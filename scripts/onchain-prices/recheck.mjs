#!/usr/bin/env node
/**
 * Re-read randomly chosen observed points of the bundled series from the
 * ledger and recompute them independently. Tooling only; reads only.
 *
 * For each chosen point this script calls getTransaction again with the plain
 * `json` encoding (the producer used `jsonParsed`), never the producer's
 * cache, and recomputes the pool vault changes from the account keys (static
 * keys plus loaded lookup-table addresses, in that order) and the pre/post
 * token balances with its own code. It checks the slot, block time, success,
 * raw changes and the stored price.
 *
 * Usage:
 *   node scripts/onchain-prices/recheck.mjs [--count 10] [--seed 1] [--tickers NVDA]
 *
 * Environment:
 *   ONCHAIN_PRICES_RPC_URL  Overrides the public mainnet RPC URL.
 */

import { join } from "node:path";

import { usdcPerUnscaledToken } from "../../packages/pricing/dist/onchain-price.js";
import { REPO_ROOT, createRpc, loadConfig, loadJson } from "./lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const count = Number(argument("--count") ?? 10);
let seed = Number(argument("--seed") ?? 1);
const tickers = argument("--tickers")?.split(",");
const config = loadConfig();
const artifact = loadJson(join(REPO_ROOT, "packages/pricing/src/onchain-daily-v1.json"));
const rpc = createRpc({
  url: process.env[config.rpc.url_env] || config.rpc.default_url,
  minIntervalMs: config.rpc.min_interval_ms,
  maxRetries: config.rpc.max_retries,
  backoffBaseMs: config.rpc.backoff_base_ms,
  backoffMaxMs: config.rpc.backoff_max_ms,
  timeoutMs: config.rpc.timeout_ms,
  log: (line) => console.error(`  ${line}`),
});

/** Small deterministic generator, so a recheck sample can be repeated. */
function random() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

function vaultChange(tx, vault, mint) {
  const keys = [
    ...tx.transaction.message.accountKeys,
    ...(tx.meta.loadedAddresses?.writable ?? []),
    ...(tx.meta.loadedAddresses?.readonly ?? []),
  ];
  const index = keys.indexOf(vault);
  if (index === -1) return null;
  const find = (list) => list.find((entry) => entry.accountIndex === index && entry.mint === mint);
  const before = find(tx.meta.preTokenBalances);
  const after = find(tx.meta.postTokenBalances);
  if (!before || !after) return null;
  return (BigInt(after.uiTokenAmount.amount) - BigInt(before.uiTokenAmount.amount)).toString();
}

const pool = [];
for (const series of artifact.series) {
  if (tickers && !tickers.includes(series.ticker)) continue;
  for (const point of series.points) if (point.status === "observed") pool.push({ series, point });
}
const chosen = [];
while (chosen.length < Math.min(count, pool.length)) {
  const pick = pool.splice(Math.floor(random() * pool.length), 1)[0];
  chosen.push(pick);
}

let failures = 0;
for (const { series, point } of chosen) {
  const { result: tx } = await rpc.call("getTransaction", [point.signature, { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "finalized" }]);
  const problems = [];
  if (!tx) problems.push("not found");
  else {
    if (tx.meta.err !== null) problems.push("failed transaction");
    if (tx.slot !== point.slot) problems.push(`slot ${tx.slot}`);
    if (new Date(tx.blockTime * 1000).toISOString().replace(".000Z", "Z") !== point.block_time) problems.push(`block time ${tx.blockTime}`);
    const usdc = vaultChange(tx, series.pool.usdc_vault, series.usdc_mint);
    const xstock = vaultChange(tx, series.pool.xstock_vault, series.mint);
    if (usdc !== point.usdc_raw) problems.push(`usdc ${usdc}`);
    if (xstock !== point.xstock_raw) problems.push(`xstock ${xstock}`);
    if (usdc && xstock) {
      const price = usdcPerUnscaledToken({ usdcRaw: usdc, xstockRaw: xstock, usdcDecimals: series.usdc_decimals, xstockDecimals: series.xstock_decimals });
      if (price !== point.usdc_per_unscaled_token) problems.push(`price ${price}`);
    }
  }
  if (problems.length > 0) failures += 1;
  console.log(`${series.ticker} ${point.date} ${point.signature} ${point.usdc_per_unscaled_token} ${problems.length === 0 ? "match" : `MISMATCH ${problems.join("; ")}`}`);
}
console.log(`checked=${chosen.length} mismatches=${failures} requests=${rpc.stats.requests}`);
process.exitCode = failures === 0 ? 0 : 1;
