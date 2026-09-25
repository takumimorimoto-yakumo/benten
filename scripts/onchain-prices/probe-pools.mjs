#!/usr/bin/env node
/**
 * Choose one xStock/USDC pool per ticker by its on-chain activity history,
 * and write the selection file `verify-pools.mjs` consumes. Tooling only;
 * reads only.
 *
 * A pool's current volume says nothing about its past: a pool created at
 * launch may have stayed empty for months. So candidates are compared by
 * what the ledger shows at fixed probe instants (config `pool_probes`):
 * for each probe, getSignaturesForAddress lists the pool's transactions
 * before the first block at the probe, and the successful ones in the 24
 * hours before it are counted (a listing holds at most 1000, so a count of
 * 1000 is a floor).
 *
 * Rule: candidates are the USDC pools of the xStock on the public pool
 * directory's first page with at least `min_tx_24h` transactions in its last
 * 24 hours. The pool with the longest unbroken run of active probes ending
 * at the latest probe wins; a tie goes to the larger sum of probe counts.
 * Only ledger facts decide; the directory is used to find candidate
 * addresses.
 *
 * Usage:
 *   node scripts/onchain-prices/probe-pools.mjs --directory-dir PATH --out PATH [--tickers NVDA,TSLA]
 *
 *   --directory-dir  Folder of `<TICKER>.json` pool-directory responses (one
 *                    per ticker, as fetched from the directory named in the
 *                    output), read only from disk.
 *
 * Environment:
 *   ONCHAIN_PRICES_RPC_URL    Overrides the public mainnet RPC URL.
 *   ONCHAIN_PRICES_CACHE_DIR  Optional: close slots already found there seed the slot search.
 */

import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, createRpc, loadConfig, loadJson, signaturesParams } from "./lib.mjs";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const config = loadConfig();
const probeConfig = config.pool_probes;
const directoryDir = argument("--directory-dir");
const out = argument("--out");
if (!directoryDir || !out) throw new Error("--directory-dir and --out are required");
const registry = loadJson(join(REPO_ROOT, "packages/registry/src/xstocks.json"));
const tickers = argument("--tickers")?.split(",") ?? readdirSync(directoryDir).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5));

const rpc = createRpc({
  url: process.env[config.rpc.url_env] || config.rpc.default_url,
  minIntervalMs: config.rpc.min_interval_ms,
  maxRetries: config.rpc.max_retries,
  backoffBaseMs: config.rpc.backoff_base_ms,
  backoffMaxMs: config.rpc.backoff_max_ms,
  timeoutMs: config.rpc.timeout_ms,
  log: (line) => console.error(`  ${line}`),
});

/** Candidate USDC pools of one mint from a directory response. */
function candidates(directory, mint) {
  return (directory.data ?? []).flatMap((pool) => {
    const base = pool.relationships.base_token.data.id.split("_")[1];
    const quote = pool.relationships.quote_token.data.id.split("_")[1];
    if (!((base === mint && quote === USDC_MINT) || (base === USDC_MINT && quote === mint))) return [];
    const tx24h = pool.attributes.transactions.h24.buys + pool.attributes.transactions.h24.sells;
    if (tx24h < probeConfig.min_tx_24h) return [];
    return [{ address: pool.attributes.address, dex: pool.relationships.dex.data.id, created: pool.attributes.pool_created_at, tx24h }];
  });
}

/**
 * Known (slot, block time) points: the close slots already found by
 * fetch-daily.mjs when a cache is given, and the current finalized slot.
 * Slot duration drifts over months, so a probe slot is located by secant
 * steps between the nearest known points, not by a fixed slot duration.
 */
const known = [];
async function loadKnown() {
  const cacheDir = process.env[config.cache_dir_env];
  if (cacheDir) {
    try {
      for (const entry of Object.values(loadJson(join(cacheDir, "close-slots.json")))) known.push({ slot: entry.slot, time: entry.block_time });
    } catch {
      // No cache yet: the current slot alone seeds the search.
    }
  }
  const { result: nowSlot } = await rpc.call("getSlot", [{ commitment: "finalized" }]);
  const { result: nowTime } = await rpc.call("getBlockTime", [nowSlot]);
  known.push({ slot: nowSlot, time: nowTime });
}

const anchors = new Map();
/** The first signature of a block within `anchor_tolerance_seconds` of the probe instant. */
async function anchorAt(instant) {
  if (anchors.has(instant)) return anchors.get(instant);
  const target = Date.parse(instant) / 1000;
  const points = [...known].sort((left, right) => Math.abs(left.time - target) - Math.abs(right.time - target)).slice(0, 2);
  const secondsPerSlot = () => (points.length > 1 && points[1].slot !== points[0].slot
    ? (points[1].time - points[0].time) / (points[1].slot - points[0].slot)
    : config.search.slot_seconds_estimate);
  let slot = points[0].slot + Math.round((target - points[0].time) / secondsPerSlot());
  for (let step = 0; step < 16; step += 1) {
    const outcome = await rpc.call("getBlock", [slot, { transactionDetails: "signatures", rewards: false, maxSupportedTransactionVersion: 1, commitment: "finalized" }]);
    if (outcome.skipped || !outcome.result || outcome.result.signatures.length === 0) {
      slot += 1;
      continue;
    }
    const time = outcome.result.blockTime;
    if (Math.abs(time - target) <= probeConfig.anchor_tolerance_seconds) {
      const anchor = { slot, block_time: time, signature: outcome.result.signatures[0] };
      anchors.set(instant, anchor);
      known.push({ slot, time });
      return anchor;
    }
    points.unshift({ slot, time });
    points.length = 2;
    slot += Math.round((target - time) / secondsPerSlot());
  }
  throw new Error(`no anchor block near ${instant}`);
}

async function activity(address, createdAt) {
  const probes = [];
  for (const instant of probeConfig.instants) {
    if (Date.parse(instant) <= Date.parse(createdAt)) {
      probes.push({ at: instant, successful_24h: null });
      continue;
    }
    const anchor = await anchorAt(instant);
    const { result } = await rpc.call("getSignaturesForAddress", signaturesParams(address, anchor.signature));
    const since = anchor.block_time - 86_400;
    const count = result.filter((entry) => entry.err === null && entry.blockTime !== null && entry.blockTime >= since).length;
    probes.push({ at: instant, successful_24h: count });
  }
  return probes;
}

const probeSum = (probes) => probes.reduce((sum, probe) => sum + (probe.successful_24h ?? 0), 0);

/** Unbroken active probes counted back from the latest one. */
function recentRun(probes) {
  let run = 0;
  for (let index = probes.length - 1; index >= 0 && (probes[index].successful_24h ?? 0) > 0; index -= 1) run += 1;
  return run;
}

await loadKnown();
const pools = {};
for (const ticker of tickers) {
  const entry = registry.find((row) => row.ticker === ticker);
  if (!entry) throw new Error(`${ticker} is not a registry ticker`);
  const found = candidates(loadJson(join(directoryDir, `${ticker}.json`)), entry.mint);
  if (found.length === 0) throw new Error(`${ticker} has no candidate pool`);
  const scored = [];
  for (const candidate of found) {
    const probes = await activity(candidate.address, candidate.created);
    scored.push({ ...candidate, probes, run: recentRun(probes) });
    console.error(`${ticker} ${candidate.address} ${candidate.dex} tx24h=${candidate.tx24h} probes=${probes.map((probe) => probe.successful_24h ?? "-").join(",")}`);
  }
  scored.sort((left, right) => right.run - left.run || probeSum(right.probes) - probeSum(left.probes));
  const chosen = scored[0];
  pools[ticker] = {
    mint: entry.mint,
    address: chosen.address,
    dex: chosen.dex,
    created: chosen.created,
    rule: "longest_recent_activity",
    probes: chosen.probes,
    candidates: scored.map(({ address, dex, probes, run }) => ({ address, dex, probes, active_probe_run: run, probe_sum: probeSum(probes) })),
  };
}

writeFileSync(out, `${JSON.stringify({
  observed_at: new Date().toISOString().slice(0, 10),
  directory: probeConfig.directory,
  rule: probeConfig.rule,
  pools,
}, null, 1)}\n`);
console.error(`wrote ${out} requests=${rpc.stats.requests} retries=${rpc.stats.retries}`);
