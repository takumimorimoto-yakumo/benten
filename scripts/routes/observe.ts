/**
 * Read-only mainnet observation of one candidate route: the pool account and
 * its fee parameters, the product mint, the Pyth price of the underlying
 * share (when the reviewed feed map approves one for the mint) and two
 * exact-in USDC quotes. It reads public RPC state only;
 * it builds, signs and sends nothing. `lib.mjs` turns the observation into the
 * verdict.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
// eslint-disable-next-line import/no-named-as-default -- the SDK's default export is the DLMM pool class.
import DLMM, { getBaseFee, getTotalFee, MAX_FEE_RATE } from "@meteora-ag/dlmm";

import { FEED_MAP, valuationFeedForMint } from "../../packages/pricing/src/feed-map";
import { isStaleAt, observeFeedAccounts } from "../../packages/pricing/src/observe";
import { PURCHASE_CONFIG } from "../../packages/purchase/src/config";
import { decodeMint, effectiveMultiplier } from "../../packages/purchase/src/mint-info";
import { SWAP_FOR_Y } from "../../packages/purchase/src/quote";
import { poolAccounts } from "../../packages/purchase/src/tx-allowlist";
import { isWithheldFromProduct, resolveTicker } from "../../packages/registry/src/registry-lookup";
import type { XStockEntry } from "../../packages/registry/src/types";
import xstocks from "../../packages/registry/src/xstocks.json";
import { QUOTE_AMOUNTS_USDC, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, USDC_MINT } from "./lib.mjs";

const USDC_RAW_PER_UNIT = 1_000_000n;
const USDC_DECIMALS = 6;
const PRODUCT_DECIMALS = 8;
/** Token-2022 mint layout: the base mint, one account-type byte, then TLV extensions. */
const MINT_DECIMALS_OFFSET = 44;
const MINT_TLV_START = 166;
const EXTENSION_TRANSFER_FEE = 1;
const EXTENSION_DEFAULT_ACCOUNT_STATE = 6;
const EXTENSION_TRANSFER_HOOK = 14;
const EXTENSION_SCALED_UI_AMOUNT = 25;
const EXTENSION_PAUSABLE = 26;
/** Token account amount (u64) offset. */
const TOKEN_AMOUNT_OFFSET = 64;

export interface MintObservation {
  owner: string;
  decimals: number;
  extensionTypes: number[];
  transferHookProgram: string | null;
  transferFeeBps: { older: number; newer: number } | null;
  /** `AccountState` new token accounts start in (1 = initialized), `null` without the extension. */
  defaultAccountState: number | null;
  scaledUiAmount: boolean;
  paused: boolean | null;
}

/** The Pyth price of one underlying share and the mint's display multiplier, or why no reference was read. */
export type ReferenceObservation =
  | { status: "fresh"; feedId: string; symbol: string; price: string; publishTime: number; multiplier: string }
  | { status: "unchecked"; reason: string };

export interface Observation {
  registry: { ticker: string; symbol: string; mint: string; decimals: number } | null;
  /** The registry row of this exact ticker is withheld from every product surface. */
  withheld: boolean;
  pool: {
    owner: string | null;
    error?: string;
    status?: number;
    tokenXMint?: string;
    tokenYMint?: string;
    tokenXProgram?: string;
    tokenYProgram?: string;
    reserveX?: string;
    reserveY?: string;
    oracle?: string;
    derived?: { reserveX: string; reserveY: string; oracle: string; bitmapExtension: string };
    hasBitmapExtension?: boolean;
    binStep?: number;
    pairType?: number;
    activationPoint?: string;
    creatorPoolOnOffControl?: number;
    /** Fee rates over 10^9: the base fee, the pool's maximum (variable fee at its maximum volatility accumulator) and the program-wide cap. */
    fees?: { baseRate: string; maxRate: string; programMaxRate: string };
  };
  mint: MintObservation | null;
  reference: ReferenceObservation;
  quotes: { usdc: number; inputRaw: string; consumedRaw?: string; outputRaw?: string; feeRaw?: string; protocolFeeRaw?: string; priceImpactPct?: string; error?: string }[];
  liquidityUsd: number;
}

export function connectionFor(rpc: string): Connection {
  const retryFetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    let last: unknown = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const response = await fetch(input, init);
        if (response.status !== 429) return response;
      } catch (error) {
        last = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)));
    }
    throw new Error(`RPC retries exhausted${last instanceof Error ? `: ${last.message}` : ""}`);
  };
  return new Connection(rpc, { commitment: "confirmed", fetch: retryFetch as typeof fetch });
}

function readMint(owner: string, data: Uint8Array): MintObservation {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: MintObservation = { owner, decimals: data[MINT_DECIMALS_OFFSET] ?? -1, extensionTypes: [], transferHookProgram: null, transferFeeBps: null, defaultAccountState: null, scaledUiAmount: false, paused: null };
  let offset = MINT_TLV_START;
  while (data.byteLength > MINT_TLV_START && offset + 4 <= data.byteLength) {
    const type = view.getUint16(offset, true);
    const length = view.getUint16(offset + 2, true);
    if (type === 0) break;
    const body = data.subarray(offset + 4, offset + 4 + length);
    out.extensionTypes.push(type);
    if (type === EXTENSION_TRANSFER_HOOK) out.transferHookProgram = new PublicKey(body.subarray(32, 64)).toBase58();
    if (type === EXTENSION_TRANSFER_FEE) {
      // authority (32) withdraw authority (32) withheld (u64), then older and newer {epoch u64, maximum u64, bps u16}.
      const fees = new DataView(body.buffer, body.byteOffset, body.byteLength);
      out.transferFeeBps = { older: fees.getUint16(32 + 32 + 8 + 16, true), newer: fees.getUint16(32 + 32 + 8 + 18 + 16, true) };
    }
    if (type === EXTENSION_DEFAULT_ACCOUNT_STATE) out.defaultAccountState = body[0] ?? null;
    if (type === EXTENSION_SCALED_UI_AMOUNT) out.scaledUiAmount = true;
    if (type === EXTENSION_PAUSABLE) out.paused = body[32] === 1;
    offset += 4 + length;
  }
  return out;
}

/**
 * The Pyth price of one underlying share for `mint` (the reviewed feed map's
 * valuation feed, read with the price reader's own rules: receiver-owned,
 * fully verified, the feed id, newest shard, not stale) and the mint's Scaled
 * UI multiplier in effect now. `unchecked` with the reason when any of it is
 * missing.
 */
async function observeReference(connection: Connection, mint: string, mintData: Uint8Array | null): Promise<ReferenceObservation> {
  const feed = valuationFeedForMint(mint);
  if (!feed) return { status: "unchecked", reason: "no reviewed Pyth feed approved for this mint" };
  const decoded = mintData ? decodeMint(mintData) : null;
  if (!decoded?.scaledUiAmount) return { status: "unchecked", reason: "the mint's Scaled UI multiplier is unreadable" };
  const now = Date.now();
  const infos = await connection.getMultipleAccountsInfo(feed.price_accounts.map((ref) => new PublicKey(ref.address)));
  const accounts = infos.map((info) => (info ? { owner: info.owner.toBase58(), data: Uint8Array.from(info.data) } : null));
  const observed = observeFeedAccounts({ feedId: feed.feed_id, priceAccounts: feed.price_accounts, receiverProgram: FEED_MAP.source.receiver_program }, accounts, now);
  if (!observed.ok) return { status: "unchecked", reason: `Pyth ${feed.pyth_symbol}: ${observed.reason}` };
  const publishTime = Number(observed.update.publishTime);
  if (isStaleAt(publishTime, now)) return { status: "unchecked", reason: `Pyth ${feed.pyth_symbol}: stale (published ${new Date(publishTime * 1000).toISOString()})` };
  if (observed.update.price <= 0n) return { status: "unchecked", reason: `Pyth ${feed.pyth_symbol}: not positive` };
  const { price, exponent } = observed.update;
  const text = exponent >= 0 ? (price * 10n ** BigInt(exponent)).toString() : (Number(price) / 10 ** -exponent).toString();
  return { status: "fresh", feedId: feed.feed_id, symbol: feed.pyth_symbol, price: text, publishTime, multiplier: effectiveMultiplier(decoded.scaledUiAmount, now) };
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200);

/** Observe `candidate` on mainnet. Throws only when the RPC itself cannot be read. */
export async function observeCandidate(connection: Connection, candidate: { ticker: string; pool: string }): Promise<Observation> {
  const entry = resolveTicker(candidate.ticker);
  const registry = entry && entry.ticker === candidate.ticker ? { ticker: entry.ticker, symbol: entry.symbol, mint: entry.mint, decimals: entry.decimals } : null;
  const row = (xstocks as XStockEntry[]).find((candidateRow) => candidateRow.ticker === candidate.ticker);
  const withheld = row !== undefined && isWithheldFromProduct(row);
  const poolKey = new PublicKey(candidate.pool);
  const observation: Observation = { registry, withheld, pool: { owner: null }, mint: null, reference: { status: "unchecked", reason: "the ticker names no registry mint" }, quotes: [], liquidityUsd: 0 };

  const [poolAccount, mintAccount] = await connection.getMultipleAccountsInfo([poolKey, ...(registry ? [new PublicKey(registry.mint)] : [])]);
  observation.pool.owner = poolAccount ? poolAccount.owner.toBase58() : null;
  if (mintAccount) observation.mint = readMint(mintAccount.owner.toBase58(), Uint8Array.from(mintAccount.data));
  if (registry) observation.reference = await observeReference(connection, registry.mint, mintAccount ? Uint8Array.from(mintAccount.data) : null);
  if (!poolAccount) {
    observation.pool.error = "pool account missing";
    return observation;
  }

  let pool: Awaited<ReturnType<typeof DLMM.create>>;
  try {
    pool = await DLMM.create(connection, poolKey);
  } catch (error) {
    observation.pool.error = `not a readable DLMM pool: ${message(error)}`;
    return observation;
  }
  const lbPair = pool.lbPair;
  const mintX = pool.tokenX.mint.address;
  const mintY = pool.tokenY.mint.address;
  const derived = poolAccounts({ pool: poolKey, mintX, mintY, programX: pool.tokenX.owner, programY: pool.tokenY.owner });
  const [bitmap, reserveX, reserveY] = await connection.getMultipleAccountsInfo([new PublicKey(derived.bitmapExtension), lbPair.reserveX, lbPair.reserveY]);
  Object.assign(observation.pool, {
    status: lbPair.status,
    tokenXMint: mintX.toBase58(),
    tokenYMint: mintY.toBase58(),
    tokenXProgram: pool.tokenX.owner.toBase58(),
    tokenYProgram: pool.tokenY.owner.toBase58(),
    reserveX: lbPair.reserveX.toBase58(),
    reserveY: lbPair.reserveY.toBase58(),
    oracle: lbPair.oracle.toBase58(),
    derived,
    hasBitmapExtension: bitmap !== null,
    binStep: lbPair.binStep,
    pairType: lbPair.pairType,
    activationPoint: lbPair.activationPoint.toString(),
    creatorPoolOnOffControl: lbPair.creatorPoolOnOffControl,
    fees: {
      baseRate: getBaseFee(lbPair.binStep, lbPair.parameters).toString(),
      maxRate: getTotalFee(lbPair.binStep, lbPair.parameters, { ...lbPair.vParameters, volatilityAccumulator: lbPair.parameters.maxVolatilityAccumulator }).toString(),
      programMaxRate: MAX_FEE_RATE.toString(),
    },
  });

  // Liquidity in USDC: the USDC reserve plus the product reserve at the active bin's price.
  const amount = (account: typeof reserveX) => (account && account.data.length >= TOKEN_AMOUNT_OFFSET + 8 ? Buffer.from(account.data).readBigUInt64LE(TOKEN_AMOUNT_OFFSET) : 0n);
  try {
    const price = Number((await pool.getActiveBin()).pricePerToken);
    const usdcIsY = mintY.toBase58() === USDC_MINT;
    const x = Number(amount(reserveX)) / 10 ** (usdcIsY ? PRODUCT_DECIMALS : USDC_DECIMALS);
    const y = Number(amount(reserveY)) / 10 ** (usdcIsY ? USDC_DECIMALS : PRODUCT_DECIMALS);
    observation.liquidityUsd = usdcIsY && Number.isFinite(price) ? y + x * price : 0;
  } catch {
    observation.liquidityUsd = 0;
  }

  // Quotes only make sense on the product/USDC orientation the table supports.
  const oriented = observation.pool.tokenYMint === USDC_MINT && observation.pool.tokenXProgram === TOKEN_2022_PROGRAM && observation.pool.tokenYProgram === TOKEN_PROGRAM;
  let binArrays: Awaited<ReturnType<typeof pool.getBinArrayForSwap>> | null = null;
  let binError: string | null = null;
  if (oriented) {
    try {
      binArrays = await pool.getBinArrayForSwap(SWAP_FOR_Y);
    } catch (error) {
      binError = `bin arrays unreadable: ${message(error)}`;
    }
  }
  for (const usdc of QUOTE_AMOUNTS_USDC) {
    const inputRaw = BigInt(usdc) * USDC_RAW_PER_UNIT;
    if (!oriented || binArrays === null) {
      observation.quotes.push({ usdc, inputRaw: inputRaw.toString(), error: binError ?? "pool is not product (Token-2022) / USDC (Token)" });
      continue;
    }
    try {
      const quote = pool.swapQuote(new BN(inputRaw.toString()), SWAP_FOR_Y, new BN(PURCHASE_CONFIG.slippageBps), binArrays);
      observation.quotes.push({ usdc, inputRaw: inputRaw.toString(), consumedRaw: quote.consumedInAmount.toString(), outputRaw: quote.outAmount.toString(), feeRaw: quote.fee.toString(), protocolFeeRaw: quote.protocolFee.toString(), priceImpactPct: quote.priceImpact.toString() });
    } catch (error) {
      observation.quotes.push({ usdc, inputRaw: inputRaw.toString(), error: `swapQuote failed: ${message(error)}` });
    }
  }
  return observation;
}
