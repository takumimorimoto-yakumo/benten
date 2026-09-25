/**
 * Read which supported product tokens (every xStock and every PreStocks
 * instrument in the bundled registry) a connected public key holds, through
 * the read-only relay. Holdings screen (/portfolio), 2026-09-24 user decision.
 *
 * Reads, in order, one POST each:
 *  1. `getTokenAccountsByOwner` for the SPL Token program (base64);
 *  2. `getTokenAccountsByOwner` for Token-2022, no earlier than the slot of 1;
 *  3. `getMultipleAccounts` for the held product mints (decimals and the
 *     Token-2022 Scaled UI Amount multiplier, read now, never stored);
 *  4. `getAccountInfo` for the Clock sysvar, the chain time at which the
 *     multiplier is evaluated.
 *
 * The two holdings reads are separate calls, so they report separate context
 * slots; both are returned and never presented as one atomic snapshot. Raw
 * amounts stay `bigint` until they become canonical decimal strings. The
 * Scaled UI multiplier changes only the display amount, never the raw amount.
 *
 * Only accounts of a supported product mint are decoded, strictly: any
 * defect in one of them fails the whole read closed, because it is what the
 * list shows. Token accounts of any other mint are counted, never decoded
 * or returned (app IA section 2.2): only their mint and owner positions are
 * read, and one that cannot be read is counted as unreadable instead of
 * failing the read. An account whose mint position cannot be read at all
 * could be a supported product's, so it is counted and the read is
 * `partial` (`unidentified_accounts`): the list is shown, the total is not.
 *
 * Nothing here signs, sends or asks a wallet for anything.
 */

import { formatRawUnits, formatScaledUnits } from "@benten/purchase/amount";
import { encodeBase58 } from "@benten/purchase/base58";
import { decodeMint, effectiveMultiplier, type MintInfo } from "@benten/purchase/mint-info";
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  supportedProductForMint,
  type SupportedProduct,
} from "@benten/solana/supported-products";

import { HOLDINGS_CONFIG } from "./config";
import { HoldingsRpcError, createRelayRpc, type HoldingsRpc, type RpcFailure } from "./rpc";
import { decodeBase64, decodeClock, decodeTokenAccount, hidesPartOfBalance, readAccountKeys } from "./token-account";

export type HoldingsReason =
  | RpcFailure
  | "invalid_owner"
  | "account_limit"
  | "mint_limit"
  | "malformed_account"
  | "unidentified_accounts"
  | "mint_unavailable"
  | "clock_unavailable";

export interface ProductHolding {
  mint: string;
  product: SupportedProduct;
  /** Token program that owns this mint's accounts. */
  tokenProgram: string;
  /** Token account addresses holding this mint, sorted. */
  accounts: string[];
  /** Sum of the accounts' raw amounts, base-10 integer string. Never scaled. */
  rawAmount: string;
  /** Read from the mint at `metadataSlot`; `null` when the mint could not be read. */
  decimals: number | null;
  /** Whether the mint carries the Token-2022 Scaled UI Amount extension; `null` when the mint could not be read. */
  hasScaledUiAmount: boolean | null;
  /** Scaled UI multiplier in effect at `chainUnixTimestamp`; `null` without the extension or without a chain time. */
  scaledUiMultiplier: string | null;
  /** Display amount: raw × multiplier for Scaled UI mints, raw ÷ 10^decimals otherwise; `null` when unknown. */
  displayAmount: string | null;
  frozenAccounts: number;
  delegatedAccounts: number;
}

interface ObservationBase {
  owner: string;
  /** Local wall-clock times (ms) of the request start and of the last response. */
  requestedAt: number;
  observedAt: number;
}

export type HoldingsObservation =
  | (ObservationBase & {
    status: "available" | "partial";
    /** `null` exactly when `status` is `available`. */
    reason: HoldingsReason | null;
    /** Context slots of the two holdings reads, base-10 strings. */
    holdingsSlots: { splToken: string; token2022: string };
    /** Context slot of the mint read; `null` when it was not read. */
    metadataSlot: string | null;
    /** Slot and unix time decoded from the Clock sysvar; `null` when it was not read. */
    clockSlot: string | null;
    chainUnixTimestamp: string | null;
    holdings: ProductHolding[];
    /**
     * `otherAccounts` counts every account that is not a supported product's;
     * `unreadableAccounts` is the part of it that could not be read (mint
     * position missing, or owner, program or encoding not as asked).
     */
    coverage: { tokenAccounts: number; productAccounts: number; otherAccounts: number; unreadableAccounts: number };
  })
  | (ObservationBase & { status: "unavailable"; reason: HoldingsReason; holdings: null });

const ADDRESS_TEXT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** A canonical base58 text of exactly 32 bytes (decodes and re-encodes to the same text). */
export function isCanonicalAddress(text: unknown): text is string {
  if (typeof text !== "string" || !ADDRESS_TEXT.test(text)) return false;
  let value = 0n;
  for (const character of text) value = value * 58n + BigInt(BASE58_ALPHABET.indexOf(character));
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  let leadingOnes = 0;
  while (text[leadingOnes] === "1") leadingOnes += 1;
  const decoded = new Uint8Array(leadingOnes + bytes.length);
  decoded.set(bytes, leadingOnes);
  return decoded.byteLength === 32 && encodeBase58(decoded) === text;
}

class ObservationError extends Error {
  constructor(readonly reason: HoldingsReason) {
    super(reason);
  }
}

/** One entry of a `getTokenAccountsByOwner` answer; each field `null` when it is not what was asked for. */
interface RawAccount {
  pubkey: string | null;
  programOwner: string | null;
  data: Uint8Array | null;
}

function slotOf(result: unknown): bigint {
  const slot = (result as { context?: { slot?: unknown } } | null)?.context?.slot;
  if (typeof slot !== "number" || !Number.isSafeInteger(slot) || slot < 0) throw new ObservationError("malformed_rpc");
  return BigInt(slot);
}

function base64Data(value: unknown): Uint8Array {
  if (!Array.isArray(value) || value.length !== 2 || value[1] !== "base64") throw new ObservationError("malformed_rpc");
  const bytes = decodeBase64(value[0]);
  if (!bytes) throw new ObservationError("malformed_rpc");
  return bytes;
}

/** `[base64 text, "base64"]` to bytes; `null` for anything else. */
function base64DataOrNull(value: unknown): Uint8Array | null {
  if (!Array.isArray(value) || value.length !== 2 || value[1] !== "base64") return null;
  return decodeBase64(value[0]);
}

/**
 * The answer's list of accounts. Only its shape and length are checked here;
 * each entry is kept as read, and whether a defect in it fails the read
 * depends on whether it turns out to be a supported product's account.
 */
function tokenAccountsOf(result: unknown): RawAccount[] {
  const value = (result as { value?: unknown } | null)?.value;
  if (!Array.isArray(value)) throw new ObservationError("malformed_rpc");
  if (value.length > HOLDINGS_CONFIG.maxAccountsPerProgram) throw new ObservationError("account_limit");
  return value.map((entry) => {
    const pubkey = (entry as { pubkey?: unknown } | null)?.pubkey;
    const account = (entry as { account?: unknown } | null)?.account as { owner?: unknown; data?: unknown } | null | undefined;
    return {
      pubkey: isCanonicalAddress(pubkey) ? pubkey : null,
      programOwner: typeof account?.owner === "string" ? account.owner : null,
      data: account ? base64DataOrNull(account.data) : null,
    };
  });
}

/**
 * One holdings read. A too-large answer is reported as `account_limit`: the
 * relay transport caps an answer at `maxResponseLength` (2 Mi code units),
 * about 8,000 code units per account at `maxAccountsPerProgram`, while one
 * base64 token account entry measures about 450. An answer past the cap
 * therefore holds far more accounts than Benten reads, which is the reason
 * the user should see (measured 2026-09-25: a wallet with 5,103 Token-2022
 * accounts answered 2,332,367 code units and was shown as unverifiable).
 */
async function readTokenAccounts(rpc: HoldingsRpc, params: unknown[]): Promise<unknown> {
  try {
    return await rpc("getTokenAccountsByOwner", params);
  } catch (error) {
    if (error instanceof HoldingsRpcError && error.reason === "response_too_large") throw new ObservationError("account_limit");
    throw error;
  }
}

function failureReason(error: unknown): HoldingsReason {
  if (error instanceof ObservationError || error instanceof HoldingsRpcError) return error.reason;
  return "malformed_rpc";
}

interface Aggregate {
  product: SupportedProduct;
  tokenProgram: string;
  accounts: string[];
  raw: bigint;
  frozen: number;
  delegated: number;
}

function commitmentConfig(minContextSlot?: bigint) {
  return minContextSlot === undefined
    ? { encoding: "base64", commitment: HOLDINGS_CONFIG.commitment }
    : { encoding: "base64", commitment: HOLDINGS_CONFIG.commitment, minContextSlot: Number(minContextSlot) };
}

/**
 * Read the supported product holdings of `owner` over `rpc`. Never throws:
 * every failure is an `unavailable` observation, or `partial` when the
 * holdings themselves were read but their mint metadata was not.
 */
export async function readHoldings(rpc: HoldingsRpc, owner: string, now: () => number): Promise<HoldingsObservation> {
  const requestedAt = now();
  if (!isCanonicalAddress(owner)) {
    return { status: "unavailable", reason: "invalid_owner", owner: String(owner), requestedAt, observedAt: requestedAt, holdings: null };
  }

  let splSlot: bigint;
  let token2022Slot: bigint;
  const aggregates = new Map<string, Aggregate>();
  const coverage = { tokenAccounts: 0, productAccounts: 0, otherAccounts: 0, unreadableAccounts: 0 };
  let unidentified = 0;
  try {
    const spl = await readTokenAccounts(rpc, [owner, { programId: TOKEN_PROGRAM_ADDRESS }, commitmentConfig()]);
    splSlot = slotOf(spl);
    const token2022 = await readTokenAccounts(rpc, [owner, { programId: TOKEN_2022_PROGRAM_ADDRESS }, commitmentConfig(splSlot)]);
    token2022Slot = slotOf(token2022);
    if (token2022Slot < splSlot) throw new ObservationError("malformed_rpc");

    const seen = new Set<string>();
    for (const [program, accounts] of [[TOKEN_PROGRAM_ADDRESS, tokenAccountsOf(spl)], [TOKEN_2022_PROGRAM_ADDRESS, tokenAccountsOf(token2022)]] as const) {
      for (const account of accounts) {
        coverage.tokenAccounts += 1;
        // The same account listed twice would be counted twice: the answer itself is wrong.
        if (account.pubkey !== null) {
          if (seen.has(account.pubkey)) throw new ObservationError("malformed_rpc");
          seen.add(account.pubkey);
        }
        const keys = account.data ? readAccountKeys(account.data) : null;
        const product = keys ? supportedProductForMint(keys.mint) : undefined;
        if (!product) {
          // Not a supported product's account: counted, never decoded.
          coverage.otherAccounts += 1;
          if (!keys) {
            unidentified += 1;
            coverage.unreadableAccounts += 1;
          } else if (account.pubkey === null || account.programOwner !== program || keys.owner !== owner) {
            coverage.unreadableAccounts += 1;
          }
          continue;
        }
        // A supported product's account: decoded strictly, and any defect fails the read closed.
        if (account.pubkey === null || account.data === null) throw new ObservationError("malformed_rpc");
        if (account.programOwner !== program) throw new ObservationError("malformed_account");
        const decoded = decodeTokenAccount(account.data, program === TOKEN_2022_PROGRAM_ADDRESS);
        if (!decoded || decoded.owner !== owner || hidesPartOfBalance(decoded.extensions)) throw new ObservationError("malformed_account");
        coverage.productAccounts += 1;
        const aggregate = aggregates.get(decoded.mint) ?? { product, tokenProgram: program, accounts: [], raw: 0n, frozen: 0, delegated: 0 };
        // One mint belongs to one token program; accounts of it under both mean the response is wrong.
        if (aggregate.tokenProgram !== program) throw new ObservationError("malformed_account");
        aggregate.accounts.push(account.pubkey);
        aggregate.raw += decoded.amount;
        if (decoded.frozen) aggregate.frozen += 1;
        if (decoded.delegated) aggregate.delegated += 1;
        aggregates.set(decoded.mint, aggregate);
      }
    }
  } catch (error) {
    return { status: "unavailable", reason: failureReason(error), owner, requestedAt, observedAt: now(), holdings: null };
  }

  const mints = [...aggregates.keys()].sort();
  let reason: HoldingsReason | null = null;
  let metadataSlot: bigint | null = null;
  let clockSlot: bigint | null = null;
  let chainUnixTimestamp: bigint | null = null;
  const mintInfo = new Map<string, MintInfo>();
  const minSlot = token2022Slot > splSlot ? token2022Slot : splSlot;

  if (mints.length > HOLDINGS_CONFIG.maxProductMints) {
    reason = "mint_limit";
  } else if (mints.length > 0) {
    try {
      const result = await rpc("getMultipleAccounts", [mints, commitmentConfig(minSlot)]);
      metadataSlot = slotOf(result);
      const value = (result as { value?: unknown } | null)?.value;
      if (!Array.isArray(value) || value.length !== mints.length) throw new ObservationError("malformed_rpc");
      value.forEach((entry, index) => {
        const mint = mints[index]!;
        const account = entry as { owner?: unknown; data?: unknown } | null;
        const info = account && account.owner === aggregates.get(mint)!.tokenProgram ? decodeMint(base64Data(account.data)) : null;
        if (info) mintInfo.set(mint, info);
        else reason ??= "mint_unavailable";
      });
    } catch (error) {
      reason = failureReason(error);
    }
    try {
      const result = await rpc("getAccountInfo", [HOLDINGS_CONFIG.clockSysvar, commitmentConfig(minSlot)]);
      slotOf(result);
      const clock = decodeClock(base64Data((result as { value?: { data?: unknown } | null }).value?.data));
      if (!clock) throw new ObservationError("clock_unavailable");
      clockSlot = clock.slot;
      chainUnixTimestamp = clock.unixTimestamp;
    } catch (error) {
      reason ??= error instanceof HoldingsRpcError ? error.reason : "clock_unavailable";
    }
  }

  const holdings: ProductHolding[] = mints.map((mint) => {
    const aggregate = aggregates.get(mint)!;
    const info = mintInfo.get(mint) ?? null;
    const scaled = info?.scaledUiAmount ?? null;
    const multiplier = scaled && chainUnixTimestamp !== null ? effectiveMultiplier(scaled, Number(chainUnixTimestamp) * 1000) : null;
    let displayAmount: string | null = null;
    if (info && !scaled) displayAmount = formatRawUnits(aggregate.raw, info.decimals);
    else if (info && multiplier) displayAmount = formatScaledUnits(aggregate.raw, info.decimals, multiplier);
    if (scaled && chainUnixTimestamp === null) reason ??= "clock_unavailable";
    return {
      mint,
      product: aggregate.product,
      tokenProgram: aggregate.tokenProgram,
      accounts: [...aggregate.accounts].sort(),
      rawAmount: aggregate.raw.toString(),
      decimals: info?.decimals ?? null,
      hasScaledUiAmount: info ? scaled !== null : null,
      scaledUiMultiplier: multiplier,
      displayAmount,
      frozenAccounts: aggregate.frozen,
      delegatedAccounts: aggregate.delegated,
    };
  });

  // Completeness of the list comes first: a covered token may be among the unidentified accounts.
  if (unidentified > 0) reason = "unidentified_accounts";

  return {
    status: reason === null ? "available" : "partial",
    reason,
    owner,
    requestedAt,
    observedAt: now(),
    holdingsSlots: { splToken: splSlot.toString(), token2022: token2022Slot.toString() },
    metadataSlot: metadataSlot?.toString() ?? null,
    clockSlot: clockSlot?.toString() ?? null,
    chainUnixTimestamp: chainUnixTimestamp?.toString() ?? null,
    holdings,
    coverage,
  };
}

export interface RelayHoldingsOptions {
  /** Absolute same-origin relay URL. */
  relayUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** One explicit refresh through the relay, under the overall `HOLDINGS_CONFIG.deadlineMs` deadline. */
export async function readHoldingsThroughRelay(owner: string, options: RelayHoldingsOptions): Promise<HoldingsObservation> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HOLDINGS_CONFIG.deadlineMs);
  try {
    const rpc = createRelayRpc({ url: options.relayUrl, signal: controller.signal, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
    return await readHoldings(rpc, owner, options.now ?? Date.now);
  } finally {
    clearTimeout(timer);
  }
}
