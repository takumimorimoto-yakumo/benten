#!/usr/bin/env node
/**
 * Read executed xStock/USDC pool swaps near each NYSE session close from
 * Solana, into a resumable raw cache. Tooling only; reads only.
 *
 * For every NYSE session date in the range and every requested ticker whose
 * reviewed pool (`packages/pricing/src/onchain-pools-v1.json`) existed at the
 * close:
 *
 *   1. Close slot: the first slot whose block time is at or after the session
 *      close (16:00, or 13:00 on early-close days, America/New_York), found by
 *      interpolation and bisection over getBlockTime.
 *   2. Candidates, nearest the close slot first (slot distance, then the
 *      earlier slot, then the transaction nearest the close within a slot):
 *      - `signatures` method (default): list the pool's transactions with
 *        getSignaturesForAddress, `before` the first signature of the block W
 *        slots after the close, paging back until the listing passes W slots
 *        before the close. Every successful pool transaction strictly within W
 *        slots is then known. W starts at `initial_window_slots` and grows by
 *        `window_growth` up to `max_slot_distance` while no swap is proven.
 *      - `blocks` method (cross-check): read blocks outward from the close slot
 *        with getBlock `transactionDetails: "accounts"`, and keep transactions
 *        that move the pool's xStock and USDC vaults in opposite directions.
 *        Every block is searched for every configured pool at once.
 *   3. Proof: getTransaction (jsonParsed) shows the transaction succeeded,
 *      moved the two vaults in opposite directions for at least `min_usdc_raw`
 *      USDC, and exactly two token transfers touch the vaults: one in, one
 *      out, each for the full change. The first proven candidate is the day's
 *      trade; a ticker with none within the limits is recorded as unavailable
 *      with the reason.
 *
 * Usage:
 *   node scripts/onchain-prices/fetch-daily.mjs --from YYYY-MM-DD --to YYYY-MM-DD
 *        [--tickers NVDA,TSLA] [--method signatures|blocks] [--retry-unavailable]
 *
 * Requires `pnpm --filter @benten/pricing build` (the calendar and ET time
 * conversion are imported from its build output).
 *
 * Environment:
 *   ONCHAIN_PRICES_RPC_URL    Overrides the public mainnet RPC URL.
 *   ONCHAIN_PRICES_CACHE_DIR  Raw cache directory (required; never inside the repository).
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { newYorkTimeToUtc, sessionDates } from "../../packages/pricing/dist/onchain-price.js";
import {
  REPO_ROOT,
  blockCandidates,
  blockParams,
  candidatesNearestFirst,
  createRpc,
  loadConfig,
  loadJson,
  poolTransactions,
  poolVaultDeltas,
  scanOrder,
  signatureCandidatesNearestFirst,
  signaturesParams,
  singleSwapViolation,
  transactionParams,
  windowSequence,
} from "./lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const config = loadConfig();
const search = config.search;
const method = argument("--method") ?? search.method;
if (method !== "signatures" && method !== "blocks") throw new Error("--method must be signatures or blocks");
const cacheDir = process.env[config.cache_dir_env];
if (!cacheDir) throw new Error(`${config.cache_dir_env} must name the raw cache directory`);
if (resolve(cacheDir).startsWith(REPO_ROOT)) throw new Error("the raw cache must live outside the repository");
for (const sub of ["blocks", "anchors", "signatures", "transactions", `days-${method}`]) mkdirSync(join(cacheDir, sub), { recursive: true });

const from = argument("--from");
const to = argument("--to");
if (!from || !to) throw new Error("--from and --to are required");
const poolList = loadJson(join(REPO_ROOT, "packages/pricing/src/onchain-pools-v1.json")).pools;
const wanted = argument("--tickers")?.split(",") ?? poolList.map((pool) => pool.ticker);
for (const ticker of wanted) if (!poolList.some((pool) => pool.ticker === ticker)) throw new Error(`no reviewed pool for ${ticker}`);
const poolOf = (ticker) => poolList.find((pool) => pool.ticker === ticker);
const retryUnavailable = process.argv.includes("--retry-unavailable");

const rpc = createRpc({
  url: process.env[config.rpc.url_env] || config.rpc.default_url,
  minIntervalMs: config.rpc.min_interval_ms,
  maxRetries: config.rpc.max_retries,
  backoffBaseMs: config.rpc.backoff_base_ms,
  backoffMaxMs: config.rpc.backoff_max_ms,
  timeoutMs: config.rpc.timeout_ms,
  log: (line) => console.error(`  ${line}`),
});

const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value)}\n`);
const readIf = (path) => (existsSync(path) ? loadJson(path) : undefined);

// ---- close slot ------------------------------------------------------------

const closeSlotsPath = join(cacheDir, "close-slots.json");
const closeSlots = readIf(closeSlotsPath) ?? {};
const blockTimes = new Map();

async function blockTime(slot) {
  if (blockTimes.has(slot)) return blockTimes.get(slot);
  const outcome = await rpc.call("getBlockTime", [slot]);
  const time = outcome.skipped || outcome.result === null ? null : outcome.result;
  blockTimes.set(slot, time);
  return time;
}

/** The first slot at or after `slot` that has a block, with its block time. */
async function nextBlock(slot) {
  for (let candidate = slot; candidate < slot + 64; candidate += 1) {
    const time = await blockTime(candidate);
    if (time !== null) return { slot: candidate, time };
  }
  throw new Error(`no block in 64 slots from ${slot}`);
}

/** The first slot with a block whose block time is at or after `targetSeconds`. */
async function findCloseSlot(targetSeconds, hint) {
  let low; // a slot x whose next block is before the target
  let high; // a slot x whose next block is at or after the target
  const secondsPerSlot = hint.secondsPerSlot ?? search.slot_seconds_estimate;
  let guess = hint.slot + Math.round((targetSeconds - hint.time) / secondsPerSlot);
  for (let probe = 0; probe < search.max_block_time_probes; probe += 1) {
    const point = await nextBlock(guess);
    if (point.time < targetSeconds) low = { x: guess, ...point };
    else high = { x: guess, ...point };
    if (low && high && high.x - low.x <= 1) return (await nextBlock(high.x)).slot;
    if (low && high) {
      const span = high.x - low.x;
      const fraction = high.time === low.time ? 0.5 : (targetSeconds - low.time) / (high.time - low.time);
      // Interpolate while the bracket is wide, then bisect; always move strictly inside.
      guess = span > 64 ? low.x + Math.round(fraction * span) : low.x + Math.floor(span / 2);
      guess = Math.min(high.x - 1, Math.max(low.x + 1, guess));
    } else if (low) {
      guess = low.slot + Math.max(1, Math.round((targetSeconds - low.time) / secondsPerSlot)) + 8;
    } else {
      guess = high.x - Math.max(1, Math.round((high.time - targetSeconds) / secondsPerSlot)) - 8;
    }
  }
  throw new Error(`close slot not found for ${targetSeconds} within ${search.max_block_time_probes} probes`);
}

// ---- raw reads, cached --------------------------------------------------------

async function loadTransaction(signature) {
  const path = join(cacheDir, "transactions", `${signature}.json`);
  const cached = readIf(path);
  if (cached) return cached;
  const { result } = await rpc.call("getTransaction", transactionParams(signature));
  writeJson(path, result);
  return result;
}

/** Block of the blocks method: the audit copy keeps only the transactions that name a configured pool. */
async function loadBlock(slot) {
  const path = join(cacheDir, "blocks", `${slot}.json`);
  const cached = readIf(path);
  if (cached) return cached;
  const outcome = await rpc.call("getBlock", blockParams(slot));
  const block = outcome.skipped || outcome.result === null
    ? { slot, skipped: true }
    : {
      slot,
      skipped: false,
      block_time: outcome.result.blockTime,
      blockhash: outcome.result.blockhash,
      parent_slot: outcome.result.parentSlot,
      transaction_count: outcome.result.transactions.length,
      candidates: blockCandidates(outcome.result, poolList, search.min_usdc_raw),
      pool_transactions: poolTransactions(outcome.result, poolList),
    };
  writeJson(path, block);
  return block;
}

/** The first signature of the first block at or after `slot`: the `before` anchor of a listing. */
async function loadAnchor(slot) {
  const path = join(cacheDir, "anchors", `${slot}.json`);
  const cached = readIf(path);
  if (cached) return cached;
  for (let candidate = slot; candidate < slot + 64; candidate += 1) {
    const outcome = await rpc.call("getBlock", [candidate, { transactionDetails: "signatures", rewards: false, maxSupportedTransactionVersion: 1, commitment: "finalized" }]);
    if (outcome.skipped || outcome.result === null || outcome.result.signatures.length === 0) continue;
    const anchor = { requested_slot: slot, slot: candidate, block_time: outcome.result.blockTime, signature: outcome.result.signatures[0] };
    writeJson(path, anchor);
    return anchor;
  }
  throw new Error(`no anchor block in 64 slots from ${slot}`);
}

/** Pool signatures before `anchor`, newest first, paged until the listing is older than `oldestSlot`. */
async function loadListing(pool, anchor, oldestSlot) {
  const path = join(cacheDir, "signatures", `${pool.address}-${anchor.slot}.json`);
  const cached = readIf(path);
  if (cached && (cached.complete || cached.entries.at(-1)?.slot < oldestSlot)) return cached;
  const listing = cached ?? { pool: pool.address, anchor, pages: 0, complete: false, entries: [] };
  while (listing.pages < search.max_signature_pages && !(listing.entries.at(-1)?.slot < oldestSlot) && !listing.complete) {
    const before = listing.entries.at(-1)?.signature ?? anchor.signature;
    const { result } = await rpc.call("getSignaturesForAddress", signaturesParams(pool.address, before));
    listing.pages += 1;
    for (const entry of result) listing.entries.push({ signature: entry.signature, slot: entry.slot, block_time: entry.blockTime, err: entry.err });
    if (result.length < 1000) listing.complete = true;
  }
  writeJson(path, listing);
  return listing;
}

// ---- proof ------------------------------------------------------------------

/** `null` and the proven trade, or the rejection reason. */
async function prove(pool, signature, slot) {
  const tx = await loadTransaction(signature);
  if (!tx) return { reason: "transaction_unavailable" };
  if (tx.slot !== slot) return { reason: "transaction_slot_mismatch" };
  const deltas = poolVaultDeltas(tx, pool);
  if (!deltas) return { reason: "no_opposite_vault_changes" };
  const usdcAbs = BigInt(deltas.usdcRaw) < 0n ? -BigInt(deltas.usdcRaw) : BigInt(deltas.usdcRaw);
  if (usdcAbs < BigInt(search.min_usdc_raw)) return { reason: "below_min_usdc" };
  const violation = singleSwapViolation(tx, pool, deltas);
  if (violation) return { reason: violation };
  return { trade: { slot, block_time: tx.blockTime, signature, usdc_raw: deltas.usdcRaw, xstock_raw: deltas.xstockRaw } };
}

/** Candidates that are not swap-sized vault moves at all, whatever the archive returns. */
const NOT_A_SWAP = new Set(["no_opposite_vault_changes", "below_min_usdc"]);

/**
 * Why the verification budget ran out: every swap-sized candidate came back
 * from the ledger archive without instructions (so none could be proven), or
 * the candidates were not single swaps.
 */
function exhaustedReason(rejected) {
  const swapSized = rejected.filter((entry) => !NOT_A_SWAP.has(entry.reason));
  return swapSized.length > 0 && swapSized.every((entry) => entry.reason === "inner_instructions_unavailable")
    ? "ledger_instructions_unavailable"
    : "verification_budget_exhausted";
}

// ---- one session date --------------------------------------------------------

async function searchSignatures(ticker, closeSlot) {
  const pool = poolOf(ticker);
  const rejected = [];
  let lastWindow = 0;
  for (const window of windowSequence(search.initial_window_slots, search.window_growth, search.max_slot_distance)) {
    lastWindow = window;
    const anchor = await loadAnchor(closeSlot + window);
    const listing = await loadListing(pool, anchor, closeSlot - window);
    const oldest = listing.entries.at(-1)?.slot;
    const reachedBack = listing.complete || oldest < closeSlot - window;
    // Only slots strictly between the oldest listed slot and the anchor slot are listed completely,
    // so nearest-first holds only within that span on both sides of the close.
    const complete = Math.min(window, anchor.slot - closeSlot, reachedBack ? window : closeSlot - oldest);
    const tried = new Set(rejected.map((entry) => entry.signature));
    for (const candidate of signatureCandidatesNearestFirst(listing.entries, closeSlot, Math.max(0, complete))) {
      if (tried.has(candidate.signature)) continue;
      if (rejected.length >= search.max_verifications_per_ticker_day) break;
      const outcome = await prove(pool, candidate.signature, candidate.slot);
      if (outcome.trade) return { status: "observed", method: "signatures", window_slots: window, ...outcome.trade, rejected_before: rejected };
      rejected.push({ signature: candidate.signature, slot: candidate.slot, reason: outcome.reason });
    }
    if (rejected.length >= search.max_verifications_per_ticker_day) {
      return { status: "unavailable", method: "signatures", reason: exhaustedReason(rejected), window_slots: window, rejected };
    }
    if (!reachedBack) return { status: "unavailable", method: "signatures", reason: "signature_page_limit", window_slots: window, rejected };
  }
  return { status: "unavailable", method: "signatures", reason: "no_single_swap_in_search_window", window_slots: lastWindow, rejected };
}

async function searchBlocks(tickers, closeSlot) {
  const limits = search.blocks_method;
  const results = {};
  const open = new Set(tickers);
  const rejected = Object.fromEntries(tickers.map((ticker) => [ticker, []]));
  let blocksRead = 0;
  let farthest = 0;
  for (const slot of scanOrder(closeSlot, limits.max_slot_distance)) {
    if (open.size === 0 || blocksRead >= limits.max_blocks_per_day) break;
    const block = await loadBlock(slot);
    farthest = Math.abs(slot - closeSlot);
    if (block.skipped) continue;
    blocksRead += 1;
    for (const ticker of [...open]) {
      for (const candidate of candidatesNearestFirst(block.candidates[ticker] ?? [], slot, closeSlot)) {
        if (rejected[ticker].length >= search.max_verifications_per_ticker_day) break;
        const outcome = await prove(poolOf(ticker), candidate.signature, slot);
        if (outcome.trade) {
          results[ticker] = { status: "observed", method: "blocks", ...outcome.trade, rejected_before: rejected[ticker] };
          open.delete(ticker);
          break;
        }
        rejected[ticker].push({ signature: candidate.signature, slot, reason: outcome.reason });
      }
    }
  }
  for (const ticker of open) {
    results[ticker] = {
      status: "unavailable",
      method: "blocks",
      reason: rejected[ticker].length >= search.max_verifications_per_ticker_day ? exhaustedReason(rejected[ticker]) : "no_single_swap_in_search_window",
      blocks_read: blocksRead,
      slot_distance_reached: farthest,
      rejected: rejected[ticker],
    };
  }
  return results;
}

async function fetchDay(session, hint) {
  const dayPath = join(cacheDir, `days-${method}`, `${session.date}.json`);
  const day = readIf(dayPath) ?? { date: session.date, close_utc: session.closeUtc, tickers: {} };
  const pending = wanted.filter((ticker) => {
    if (Date.parse(poolOf(ticker).created_at) >= Date.parse(session.closeUtc)) return false;
    const known = day.tickers[ticker];
    // A result for another pool (the reviewed pool changed) is stale: search again.
    return !known || known.pool !== poolOf(ticker).address || (retryUnavailable && known.status === "unavailable");
  });
  if (pending.length === 0) return { day, hint, stats: null };

  const started = Date.now();
  const requestsBefore = rpc.stats.requests;
  if (closeSlots[session.date] === undefined) {
    const slot = await findCloseSlot(Date.parse(session.closeUtc) / 1000, hint);
    closeSlots[session.date] = { close_utc: session.closeUtc, slot, block_time: await blockTime(slot) };
    writeJson(closeSlotsPath, closeSlots);
  }
  const closeSlot = closeSlots[session.date].slot;
  day.close_slot = closeSlot;
  day.close_block_time = closeSlots[session.date].block_time;
  const found = method === "blocks" ? await searchBlocks(pending, closeSlot) : {};
  for (const ticker of pending) {
    const result = method === "blocks" ? found[ticker] : await searchSignatures(ticker, closeSlot);
    day.tickers[ticker] = { pool: poolOf(ticker).address, ...result };
  }
  writeJson(dayPath, day);
  const stats = { date: session.date, method, pending: pending.length, requests: rpc.stats.requests - requestsBefore, ms: Date.now() - started };
  // The slot rate between the previous hint and this close predicts the next close slot closely.
  const secondsPerSlot = closeSlot > hint.slot ? (day.close_block_time - hint.time) / (closeSlot - hint.slot) : hint.secondsPerSlot;
  return { day, hint: { slot: closeSlot, time: day.close_block_time, secondsPerSlot }, stats };
}

// ---- run ---------------------------------------------------------------------

const sessions = sessionDates(config.session_calendar, from, to)
  .map((session) => ({ ...session, closeUtc: newYorkTimeToUtc(session.date, session.close) }))
  .filter((session) => Date.parse(session.closeUtc) + 120_000 < Date.now());

let hint;
const known = Object.values(closeSlots);
if (known.length > 0 && sessions.length > 0) {
  const first = Date.parse(sessions[0].closeUtc) / 1000;
  const nearest = known.reduce((best, entry) => (Math.abs(entry.block_time - first) < Math.abs(best.block_time - first) ? entry : best));
  hint = { slot: nearest.slot, time: nearest.block_time };
} else {
  const { result: currentSlot } = await rpc.call("getSlot", [{ commitment: "finalized" }]);
  hint = { slot: currentSlot, time: await blockTime(currentSlot) };
}

const runStarted = Date.now();
console.error(`method=${method} sessions=${sessions.length} tickers=${wanted.join(",")}`);
for (const session of sessions) {
  const outcome = await fetchDay(session, hint);
  hint = outcome.hint;
  if (!outcome.stats) continue;
  const summary = wanted.map((ticker) => {
    const result = outcome.day.tickers[ticker];
    return `${ticker}:${result ? (result.status === "observed" ? `o${result.slot - outcome.day.close_slot}` : result.reason) : "-"}`;
  }).join(" ");
  console.error(`${session.date} slot=${outcome.day.close_slot} req=${outcome.stats.requests} ${(outcome.stats.ms / 1000).toFixed(1)}s ${summary}`);
  appendFileSync(join(cacheDir, "runs.jsonl"), `${JSON.stringify({ ...outcome.stats, tickers: wanted })}\n`);
}
console.error(`done in ${((Date.now() - runStarted) / 1000).toFixed(0)}s requests=${rpc.stats.requests} retries=${rpc.stats.retries} rate_limited=${rpc.stats.rateLimited} bytes=${rpc.stats.bytes} ${JSON.stringify(rpc.stats.byMethod)}`);
