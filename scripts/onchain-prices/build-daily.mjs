#!/usr/bin/env node
/**
 * Assemble `packages/pricing/src/onchain-daily-v1.json` from the raw cache
 * written by `fetch-daily.mjs`. Tooling only.
 *
 * Fail-closed: every NYSE session from a series' first session after its pool
 * was created up to `--to` must have a fetched result in the cache, or the
 * build stops. Prices are computed here from the raw vault changes with the
 * same functions the bundled-series validator recomputes them with.
 *
 * Per-share values need the Token-2022 Scaled UI multiplier in effect at the
 * trade. A mint stores only its current multiplier and one scheduled next
 * one, so past multipliers are unknown. This script reads each mint once
 * (getAccountInfo, raw copy kept in the cache) and uses the multiplier only
 * from the time the stored next multiplier took effect, if it already has.
 * Earlier points carry no per-share value.
 *
 * Usage:
 *   node scripts/onchain-prices/build-daily.mjs --to YYYY-MM-DD [--tickers NVDA,TSLA] [--revision TEXT]
 *
 * Environment:
 *   ONCHAIN_PRICES_RPC_URL    Overrides the public mainnet RPC URL (mint reads only).
 *   ONCHAIN_PRICES_CACHE_DIR  Raw cache directory written by fetch-daily.mjs (required).
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { newYorkTimeToUtc, sessionDates, usdcPerUnderlyingShare, usdcPerUnscaledToken } from "../../packages/pricing/dist/onchain-price.js";
import { decodeMint } from "../../packages/purchase/src/mint-info.ts";
import { REPO_ROOT, createRpc, loadConfig, loadJson } from "./lib.mjs";

const OUT = join(REPO_ROOT, "packages/pricing/src/onchain-daily-v1.json");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const config = loadConfig();
const cacheDir = process.env[config.cache_dir_env];
if (!cacheDir) throw new Error(`${config.cache_dir_env} must name the raw cache directory`);
const to = argument("--to");
if (!to) throw new Error("--to is required");
const poolList = loadJson(join(REPO_ROOT, "packages/pricing/src/onchain-pools-v1.json")).pools;
const tickers = argument("--tickers")?.split(",") ?? poolList.map((pool) => pool.ticker);
const method = config.search.method;

const rpc = createRpc({
  url: process.env[config.rpc.url_env] || config.rpc.default_url,
  minIntervalMs: config.rpc.min_interval_ms,
  maxRetries: config.rpc.max_retries,
  backoffBaseMs: config.rpc.backoff_base_ms,
  backoffMaxMs: config.rpc.backoff_max_ms,
  timeoutMs: config.rpc.timeout_ms,
  log: (line) => console.error(`  ${line}`),
});

/** The mint's Scaled UI configuration now, and when its current multiplier started, if known. */
async function multiplierBasis(mint) {
  mkdirSync(join(cacheDir, "mints"), { recursive: true });
  const { result } = await rpc.call("getAccountInfo", [mint, { encoding: "base64", commitment: "finalized" }]);
  const { result: readBlockTime } = await rpc.call("getBlockTime", [result.context.slot]);
  writeFileSync(join(cacheDir, "mints", `${mint}-${result.context.slot}.json`), `${JSON.stringify(result)}\n`);
  const info = decodeMint(new Uint8Array(Buffer.from(result.value.data[0], "base64")));
  if (!info?.scaledUiAmount) return null;
  const { multiplier, newMultiplier, newMultiplierEffectiveTimestamp } = info.scaledUiAmount;
  const effective = Number(newMultiplierEffectiveTimestamp);
  const known = readBlockTime !== null && effective <= readBlockTime;
  return {
    read_slot: result.context.slot,
    read_at: new Date(readBlockTime * 1000).toISOString().replace(".000Z", "Z"),
    stored_multiplier: multiplier,
    next_multiplier: newMultiplier,
    next_multiplier_effective_at: new Date(effective * 1000).toISOString().replace(".000Z", "Z"),
    known_multiplier: known ? newMultiplier : null,
    known_from: known ? new Date(effective * 1000).toISOString().replace(".000Z", "Z") : null,
  };
}

const iso = (seconds) => new Date(seconds * 1000).toISOString().replace(".000Z", "Z");

const series = [];
for (const ticker of tickers) {
  const pool = poolList.find((entry) => entry.ticker === ticker);
  if (!pool) throw new Error(`no reviewed pool for ${ticker}`);
  const createdMs = Date.parse(pool.created_at);
  const sessions = sessionDates(config.session_calendar, pool.created_at.slice(0, 10), to)
    .map((session) => ({ ...session, closeUtc: newYorkTimeToUtc(session.date, session.close) }))
    .filter((session) => Date.parse(session.closeUtc) > createdMs);
  if (sessions.length === 0) throw new Error(`${ticker} has no session after its pool was created`);
  const basis = await multiplierBasis(pool.xstock_mint);
  const knownFromSeconds = basis?.known_from ? Date.parse(basis.known_from) / 1000 : null;
  const points = sessions.map((session) => {
    const dayPath = join(cacheDir, `days-${method}`, `${session.date}.json`);
    if (!existsSync(dayPath)) throw new Error(`${ticker} ${session.date}: not fetched`);
    const day = loadJson(dayPath);
    const result = day.tickers[ticker];
    if (!result) throw new Error(`${ticker} ${session.date}: not fetched`);
    if (result.pool !== pool.address) throw new Error(`${ticker} ${session.date}: fetched for pool ${result.pool}, not the reviewed ${pool.address}`);
    if (day.close_utc !== session.closeUtc) throw new Error(`${session.date}: cached close ${day.close_utc} disagrees with ${session.closeUtc}`);
    if (result.status === "unavailable") {
      return { date: session.date, status: "unavailable", close_slot: day.close_slot, reason: result.reason };
    }
    const amounts = { usdcRaw: result.usdc_raw, xstockRaw: result.xstock_raw, usdcDecimals: pool.usdc_decimals, xstockDecimals: pool.xstock_decimals };
    const perShare = knownFromSeconds !== null && result.block_time >= knownFromSeconds ? usdcPerUnderlyingShare(amounts, basis.known_multiplier) : null;
    return {
      date: session.date,
      status: "observed",
      close_slot: day.close_slot,
      usdc_per_unscaled_token: usdcPerUnscaledToken(amounts),
      usdc_per_underlying_share: perShare,
      signature: result.signature,
      slot: result.slot,
      block_time: iso(result.block_time),
      usdc_raw: result.usdc_raw,
      xstock_raw: result.xstock_raw,
    };
  });
  series.push({
    ticker,
    symbol: pool.symbol,
    mint: pool.xstock_mint,
    xstock_decimals: pool.xstock_decimals,
    usdc_mint: pool.usdc_mint,
    usdc_decimals: pool.usdc_decimals,
    pool: { address: pool.address, dex: pool.dex, program: pool.program, xstock_vault: pool.xstock_vault, usdc_vault: pool.usdc_vault },
    first_date: sessions[0].date,
    last_date: sessions.at(-1).date,
    multiplier_basis: basis,
    points,
  });
  const observed = points.filter((point) => point.status === "observed").length;
  console.error(`${ticker}: ${points.length} sessions, ${observed} observed, ${points.length - observed} unavailable`);
}

const { sources, ...calendar } = config.session_calendar;
const artifact = {
  schema_version: "benten.onchain-daily.v1",
  revision: argument("--revision") ?? `${new Date().toISOString().slice(0, 10)}.1`,
  generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  network: "solana-mainnet",
  statement: "Each price is the executed price of one swap in the named xStock/USDC pool, read from the public Solana ledger. It is not a quote, a bid or ask, or a reference price.",
  method: {
    close_slot: "the first slot whose block time is at or after the session close in America/New_York",
    selection: "the successful pool transaction nearest the close slot (slot distance, then the earlier slot, then the transaction nearest the close within the slot) that is proven to be a single swap",
    single_swap_proof: "the transaction moves the pool's xStock and USDC vaults in opposite directions and exactly two token transfers touch the vaults, one in and one out, each for the full change",
    price: "usdc_per_unscaled_token = |USDC vault change| / 10^usdc_decimals divided by |xStock vault change| / 10^xstock_decimals; the Scaled UI multiplier is not applied; truncated to 6 fraction digits",
    per_share: "usdc_per_underlying_share = usdc_per_unscaled_token / multiplier, only for trades at or after multiplier_basis.known_from; the issuer defines one displayed unit (raw x multiplier) as one underlying share",
    min_usdc_raw: config.search.min_usdc_raw,
    max_slot_distance: config.search.max_slot_distance,
  },
  session_calendar: { ...calendar, sources },
  series,
};
/** Pretty JSON with one point per line, so a review diff shows one line per changed session. */
function serialize(value) {
  const placeholders = value.series.map((_, index) => `__points_${index}__`);
  const text = JSON.stringify({ ...value, series: value.series.map((entry, index) => ({ ...entry, points: placeholders[index] })) }, null, 1);
  return value.series.reduce((out, entry, index) => out.replace(
    `"${placeholders[index]}"`,
    `[\n${entry.points.map((point) => `   ${JSON.stringify(point)}`).join(",\n")}\n  ]`,
  ), text);
}

writeFileSync(OUT, `${serialize(artifact)}\n`);
console.error(`wrote ${OUT}`);
