/**
 * Generator of `src/routes-table-clmm.ts`: reads each candidate Raydium CLMM
 * xStock/USDC pool read-only from mainnet, keeps only those that pass every
 * gate below, and writes the pinned table. Run through
 * `generate-clmm-routes.mjs`; it never signs or sends anything.
 *
 * Gates, in order (the first failure is reported for the candidate):
 *  1. the ticker is a registry entry of 8 decimals whose product rule allows
 *     it: an unlisted-company token (`exclusion_reason: "private"`) is never
 *     generated;
 *  2. the pool account is owned by the CLMM program, its token A is the
 *     registry mint and its token B USDC, and both vaults are the program's
 *     vault addresses for them;
 *  3. the product mint is owned by Token-2022, carries the Scaled UI Amount
 *     extension, and has no transfer fee, non-transferable or transfer-hook
 *     program set (the swap names no hook accounts);
 *  4. the pool is a state the quote models (swaps enabled, fee on the input,
 *     no dynamic fee);
 *  5. exact-in quotes of 2 and 10 USDC both take the whole amount with a
 *     price impact of at most 3%;
 *  6. fees, which the price impact does not include: the pool's trade fee
 *     is at most `CLMM_CONFIG.maxTradeFeeRate` and each gate quote pays at
 *     most `CLMM_CONFIG.maxQuotedFeeBps` of its input;
 *  7. where the Pyth price of the underlying share is fresh, the 10 USDC
 *     quote's price per share (at the Scaled UI multiplier in effect) is
 *     within `CLMM_CONFIG.maxReferenceDeviationBps` of it. A stale or missing
 *     price is recorded and does not block.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@benten/solana";
import { feedsForMint, isStaleAt, observeFeedAccounts } from "@benten/pricing";
import { usdcPerUnderlyingShare } from "@benten/pricing/onchain-price";
import { readFileSync, writeFileSync } from "node:fs";

import { poolVaultAddress } from "../src/clmm-program";
import { unsupportedPoolReason } from "../src/clmm-math";
import { quoteClmmOnState, readClmmState } from "../src/clmm-quote";
import { CLMM_CONFIG } from "../src/clmm-config";
import { decodeMint, effectiveMultiplier } from "../src/mint-info";
import { NVDA_REFERENCE_FEED } from "../src/route";

import { USDC_MINT } from "../src/route";
const USDC = USDC_MINT.toBase58();
const GATE_AMOUNTS = [2_000_000n, 10_000_000n];
const MAX_IMPACT_PCT = 3;
const SLIPPAGE_BPS = 100;
/** Token-2022 extension types refused on a product mint. */
const REFUSED_EXTENSIONS: Readonly<Record<number, string>> = { 1: "transfer fee", 9: "non-transferable" };
const TRANSFER_HOOK = 14;
const SCALED_UI_AMOUNT = 25;
const BPS = 10_000;

/** The fresh Pyth price of `mint`'s underlying share (USD, decimal number), or why there is none. */
async function underlyingSharePrice(connection: Connection, mint: string, nowMs: number): Promise<{ price: number; ageSeconds: number } | { unavailable: string }> {
  const feed = feedsForMint(mint).find((entry) => entry.role === "xstock_underlying_share");
  if (!feed) return { unavailable: "no underlying-share feed in the feed map" };
  const accounts = await connection.getMultipleAccountsInfo(feed.price_accounts.map((ref) => new PublicKey(ref.address)));
  const observed = observeFeedAccounts(
    { feedId: feed.feed_id, priceAccounts: feed.price_accounts, receiverProgram: NVDA_REFERENCE_FEED.receiverProgram },
    accounts.map((account) => (account ? { owner: account.owner.toBase58(), data: account.data } : null)),
    nowMs,
  );
  if (!observed.ok) return { unavailable: observed.reason };
  const ageSeconds = Math.round(nowMs / 1000 - Number(observed.update.publishTime));
  if (isStaleAt(Number(observed.update.publishTime), nowMs)) return { unavailable: `stale (${ageSeconds} s old)` };
  return { price: Number(observed.update.price) * 10 ** observed.update.exponent, ageSeconds };
}

interface Candidate { ticker: string; pool: string }
interface RegistryEntry { ticker: string; symbol: string; mint: string; decimals: number; exclusion_reason: string | null }

function mintExtensionFailure(data: Uint8Array): string | null {
  if (data.length <= 166 || data[165] !== 1) return "not a Token-2022 mint with extensions";
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let scaled = false;
  for (let offset = 166; offset + 4 <= data.length;) {
    const type = view.getUint16(offset, true);
    const length = view.getUint16(offset + 2, true);
    if (type === 0) break;
    if (REFUSED_EXTENSIONS[type]) return `the mint has a ${REFUSED_EXTENSIONS[type]} extension`;
    if (type === TRANSFER_HOOK && data.subarray(offset + 4 + 32, offset + 4 + 64).some((byte) => byte !== 0)) return "the mint's transfer-hook program is set";
    if (type === SCALED_UI_AMOUNT) scaled = true;
    offset += 4 + length;
  }
  return scaled ? null : "the mint has no Scaled UI Amount extension";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function retried<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= 5) throw error;
      await sleep(1_500 * (attempt + 1));
    }
  }
}

async function main(): Promise<void> {
  const [candidatesPath, registryPath, outPath] = process.argv.slice(2);
  const connection = new Connection(process.env.RPC ?? "https://api.mainnet-beta.solana.com", "confirmed");
  const candidates: Candidate[] = JSON.parse(readFileSync(candidatesPath, "utf8"));
  const registry: RegistryEntry[] = JSON.parse(readFileSync(registryPath, "utf8"));
  const accepted: string[] = [];
  const report: Record<string, unknown>[] = [];

  for (const candidate of candidates) {
    const entry = registry.find((row) => row.ticker === candidate.ticker);
    const reject = (reason: string, extra: Record<string, unknown> = {}) => report.push({ ticker: candidate.ticker, pool: candidate.pool, accepted: false, reason, ...extra });
    if (!entry) { reject("not a registry ticker"); continue; }
    if (entry.exclusion_reason === "private") { reject("unlisted-company token (exclusion_reason private): outside the product rule"); continue; }
    if (entry.decimals !== 8) { reject("registry decimals are not 8"); continue; }
    const pool = new PublicKey(candidate.pool);
    let state;
    try {
      state = await retried(() => readClmmState(connection, pool));
    } catch (error) {
      reject(`pool read failed: ${(error as Error).message}`);
      continue;
    }
    const p = state.poolState;
    if (p.mintA.toBase58() !== entry.mint || p.mintB.toBase58() !== USDC) { reject("pool mints are not the registry mint and USDC"); continue; }
    if (!poolVaultAddress(pool, p.mintA).equals(p.vaultA) || !poolVaultAddress(pool, p.mintB).equals(p.vaultB)) { reject("pool vaults are not the program's vault addresses"); continue; }
    if (p.decimalsA !== 8 || p.decimalsB !== 6) { reject("pool decimals differ"); continue; }
    const mint = await retried(() => connection.getAccountInfo(p.mintA));
    if (!mint || !mint.owner.equals(TOKEN_2022_PROGRAM_ID)) { reject("product mint is not owned by Token-2022"); continue; }
    const mintFailure = mintExtensionFailure(mint.data);
    if (mintFailure) { reject(mintFailure); continue; }
    const unsupported = unsupportedPoolReason(p, state.config);
    if (unsupported) { reject(unsupported); continue; }
    const quotes: Record<string, string | number> = { tradeFeePct: state.config.tradeFeeRate / 10_000 };
    let gateFailure: string | null = state.config.tradeFeeRate > CLMM_CONFIG.maxTradeFeeRate ? `trade fee ${state.config.tradeFeeRate / 10_000}% above ${CLMM_CONFIG.maxTradeFeeRate / 10_000}%` : null;
    let tenUsdcOut: string | null = null;
    for (const amount of GATE_AMOUNTS) {
      const label = `${Number(amount) / 1e6}usdc`;
      try {
        const reading = quoteClmmOnState(state, amount, SLIPPAGE_BPS);
        quotes[`impact_${label}_pct`] = reading.quote.priceImpactPct;
        quotes[`out_${label}_raw`] = reading.quote.outputRaw;
        const feeBps = (Number(reading.quote.feeRaw) / Number(amount)) * BPS;
        quotes[`fee_${label}_pct`] = Number((feeBps / 100).toFixed(4));
        if (amount === GATE_AMOUNTS[GATE_AMOUNTS.length - 1]) tenUsdcOut = reading.quote.outputRaw;
        if (Number(reading.quote.priceImpactPct) > MAX_IMPACT_PCT) gateFailure ??= `price impact above ${MAX_IMPACT_PCT}% at ${Number(amount) / 1e6} USDC`;
        if (feeBps > CLMM_CONFIG.maxQuotedFeeBps) gateFailure ??= `quoted fee above ${CLMM_CONFIG.maxQuotedFeeBps / 100}% of the input at ${Number(amount) / 1e6} USDC`;
      } catch (error) {
        gateFailure ??= `quote of ${Number(amount) / 1e6} USDC failed: ${(error as Error).message}`;
      }
    }
    const scaled = decodeMint(mint.data)?.scaledUiAmount ?? null;
    const nowMs = Date.now();
    const reference = await retried(() => underlyingSharePrice(connection, entry.mint, nowMs));
    if (tenUsdcOut !== null && scaled) {
      const multiplier = effectiveMultiplier(scaled, nowMs);
      const perShare = Number(usdcPerUnderlyingShare({ usdcRaw: GATE_AMOUNTS[GATE_AMOUNTS.length - 1].toString(), xstockRaw: tenUsdcOut, usdcDecimals: 6, xstockDecimals: 8 }, multiplier));
      quotes.multiplier = multiplier;
      quotes.buyPricePerShare_10usdc = perShare;
      if ("price" in reference) {
        const deviationBps = Math.abs(perShare / reference.price - 1) * BPS;
        quotes.pythSharePrice = reference.price;
        quotes.pythAgeSeconds = reference.ageSeconds;
        quotes.referenceDeviationPct = Number((deviationBps / 100).toFixed(4));
        if (deviationBps > CLMM_CONFIG.maxReferenceDeviationBps) gateFailure ??= `10 USDC price per share ${perShare} is more than ${CLMM_CONFIG.maxReferenceDeviationBps / 100}% from the Pyth share price ${reference.price}`;
      } else {
        quotes.pythSharePrice = `unavailable: ${reference.unavailable}`;
      }
    }
    if (gateFailure) { reject(gateFailure, quotes); continue; }
    report.push({ ticker: entry.ticker, pool: candidate.pool, accepted: true, tradeFeeRate: state.config.tradeFeeRate, tickSpacing: p.tickSpacing, ...quotes });
    accepted.push(
      `  ${JSON.stringify(entry.ticker)}: clmmRoute(${JSON.stringify(entry.ticker)}, ${JSON.stringify(entry.symbol)}, ${JSON.stringify(entry.mint)}, ${JSON.stringify(candidate.pool)}, {\n` +
      `    ammConfig: ${JSON.stringify(p.ammConfig.toBase58())}, observation: ${JSON.stringify(p.observation.toBase58())},\n` +
      `    productVault: ${JSON.stringify(p.vaultA.toBase58())}, usdcVault: ${JSON.stringify(p.vaultB.toBase58())}, tickSpacing: ${p.tickSpacing},\n` +
      `  }),`,
    );
    await sleep(300);
  }

  const template = readFileSync(outPath, "utf8");
  const tickers = report.filter((row) => row.accepted).map((row) => JSON.stringify(row.ticker)).join(", ");
  const generated = template
    .replace(/(\/\/ <generated-tickers>\n)[\s\S]*?(\n\s*\/\/ <\/generated-tickers>)/, `$1export const CLMM_PRODUCT_TICKERS = [${tickers}] as const;$2`)
    .replace(/(\/\/ <generated-routes>)[\s\S]*?(\n\s*\/\/ <\/generated-routes>)/, `$1\n${accepted.join("\n")}$2`);
  writeFileSync(outPath, generated);
  console.log(JSON.stringify(report, null, 1));
}

await main();
