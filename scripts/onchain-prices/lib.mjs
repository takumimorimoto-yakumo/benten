/**
 * Shared pieces of the on-chain daily price producer: a serial, rate-limited
 * read-only JSON-RPC client, and the pure functions that find pool swaps in
 * block data and prove a swap is a single swap.
 *
 * Reads only. No method here signs, sends or simulates a transaction; the
 * client refuses any RPC method outside READ_METHODS.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "../..");

export function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadConfig() {
  return loadJson(join(HERE, "config.json"));
}

/** The only RPC methods this tooling ever calls. */
export const READ_METHODS = new Set(["getSlot", "getBlockTime", "getBlock", "getTransaction", "getSignaturesForAddress", "getAccountInfo", "getTokenAccountsByOwner"]);

/** JSON-RPC codes that mean "this slot has no block": a skipped slot. Deterministic, never retried. */
export const SKIPPED_SLOT_CODES = new Set([-32007, -32009]);

export class RpcError extends Error {
  constructor(method, code, message) {
    super(`${method}: ${code} ${message}`);
    this.method = method;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

/**
 * A serial JSON-RPC client. One request at a time, at least `minIntervalMs`
 * between the end of one request and the start of the next, exponential
 * backoff with jitter on HTTP 429, 5xx, timeouts and transient RPC errors.
 * `Retry-After` is honored when the server sends it.
 */
export function createRpc({ url, minIntervalMs, maxRetries, backoffBaseMs, backoffMaxMs, timeoutMs, log = () => {} }) {
  let queue = Promise.resolve();
  let lastEnd = 0;
  const stats = { requests: 0, retries: 0, rateLimited: 0, bytes: 0, byMethod: {} };

  async function once(method, params) {
    const wait = lastEnd + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      stats.requests += 1;
      stats.byMethod[method] = (stats.byMethod[method] ?? 0) + 1;
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "accept-encoding": "gzip" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal,
      });
      const text = await response.text();
      stats.bytes += text.length;
      if (response.status === 429) return { retry: true, rateLimited: true, retryAfter: Number(response.headers.get("retry-after")) || 0 };
      if (response.status >= 500) return { retry: true };
      if (!response.ok) throw new RpcError(method, response.status, text.slice(0, 200));
      const body = JSON.parse(text);
      if (body.error) {
        const { code, message } = body.error;
        if (SKIPPED_SLOT_CODES.has(code)) return { value: { skipped: true } };
        // -32005 node behind, -32004 block not yet available, -32014 status not yet available.
        if (code === -32005 || code === -32004 || code === -32014 || code === 429) return { retry: true, rateLimited: code === 429 };
        throw new RpcError(method, code, message);
      }
      return { value: { result: body.result } };
    } catch (error) {
      if (error instanceof RpcError) throw error;
      return { retry: true, error };
    } finally {
      clearTimeout(timer);
      lastEnd = Date.now();
    }
  }

  async function call(method, params) {
    if (!READ_METHODS.has(method)) throw new Error(`refusing non-read RPC method ${method}`);
    for (let attempt = 0; ; attempt += 1) {
      const outcome = await once(method, params);
      if (!outcome.retry) return outcome.value;
      if (attempt >= maxRetries) throw new RpcError(method, "retries_exhausted", String(outcome.error ?? "rate limited or unavailable"));
      stats.retries += 1;
      if (outcome.rateLimited) stats.rateLimited += 1;
      const backoff = Math.min(backoffMaxMs, backoffBaseMs * 2 ** attempt);
      const delay = Math.max(outcome.retryAfter * 1000, backoff / 2 + Math.random() * (backoff / 2));
      log(`retry ${method} in ${Math.round(delay)}ms (attempt ${attempt + 1})`);
      await sleep(delay);
    }
  }

  return {
    stats,
    /** Serialized call: resolves to `{ result }` or `{ skipped: true }` for a skipped slot. */
    call(method, params) {
      const next = queue.then(() => call(method, params));
      queue = next.catch(() => {});
      return next;
    },
  };
}

/** Parameters of the smallest getBlock response that still carries account keys and token balances. */
export function blockParams(slot) {
  return [slot, { encoding: "json", transactionDetails: "accounts", rewards: false, maxSupportedTransactionVersion: 1, commitment: "finalized" }];
}

export function transactionParams(signature) {
  return [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "finalized" }];
}

function balanceOf(list, keys, vault, mint) {
  const entry = (list ?? []).find((balance) => keys[balance.accountIndex] === vault);
  if (!entry) return { amount: 0n, present: false };
  if (entry.mint !== mint) throw new Error(`vault ${vault} holds ${entry.mint}, not ${mint}`);
  return { amount: BigInt(entry.uiTokenAmount.amount), present: true };
}

function keyList(accountKeys) {
  return accountKeys.map((key) => (typeof key === "string" ? key : key.pubkey));
}

/**
 * The pool's vault changes in one transaction of a getBlock (`accounts`) or
 * getTransaction response, or `null` when the transaction does not move
 * both vaults in opposite directions, failed, or does not name the pool.
 */
export function poolVaultDeltas(tx, pool) {
  const keys = keyList(tx.transaction.accountKeys ?? tx.transaction.message?.accountKeys ?? []);
  if (!keys.includes(pool.address)) return null;
  if (!tx.meta || tx.meta.err !== null) return null;
  const pre = tx.meta.preTokenBalances;
  const post = tx.meta.postTokenBalances;
  const xBefore = balanceOf(pre, keys, pool.xstock_vault, pool.xstock_mint);
  const xAfter = balanceOf(post, keys, pool.xstock_vault, pool.xstock_mint);
  const uBefore = balanceOf(pre, keys, pool.usdc_vault, pool.usdc_mint);
  const uAfter = balanceOf(post, keys, pool.usdc_vault, pool.usdc_mint);
  if (!xBefore.present || !xAfter.present || !uBefore.present || !uAfter.present) return null;
  const xstock = xAfter.amount - xBefore.amount;
  const usdc = uAfter.amount - uBefore.amount;
  if (xstock === 0n || usdc === 0n || (xstock > 0n) === (usdc > 0n)) return null;
  return { xstockRaw: xstock.toString(), usdcRaw: usdc.toString() };
}

/** Swap candidates of every configured pool in one block, in transaction order. */
export function blockCandidates(block, pools, minUsdcRaw) {
  const found = Object.fromEntries(pools.map((pool) => [pool.ticker, []]));
  for (const [index, tx] of (block.transactions ?? []).entries()) {
    for (const pool of pools) {
      const deltas = poolVaultDeltas(tx, pool);
      if (!deltas) continue;
      const usdcAbs = BigInt(deltas.usdcRaw) < 0n ? -BigInt(deltas.usdcRaw) : BigInt(deltas.usdcRaw);
      if (usdcAbs < BigInt(minUsdcRaw)) continue;
      found[pool.ticker].push({ signature: tx.transaction.signatures[0], index, ...deltas });
    }
  }
  return found;
}

/** Raw transactions of a block that name any configured pool; kept as the audit copy of the block. */
export function poolTransactions(block, pools) {
  const addresses = new Set(pools.map((pool) => pool.address));
  return (block.transactions ?? []).filter((tx) => keyList(tx.transaction.accountKeys).some((key) => addresses.has(key)));
}

const TRANSFER_TYPES = new Set(["transfer", "transferChecked"]);
const TOKEN_PROGRAMS = new Set(["spl-token", "spl-token-2022"]);

function allInstructions(tx) {
  const top = tx.transaction.message.instructions ?? [];
  const inner = (tx.meta.innerInstructions ?? []).flatMap((group) => group.instructions);
  return [...top, ...inner];
}

/**
 * Prove from a jsonParsed getTransaction response that the transaction is
 * exactly one swap through `pool`: it succeeded, its vault deltas equal the
 * candidate's, and exactly two token transfers touch the pool vaults, one
 * into the vault whose balance rose and one out of the vault whose balance
 * fell, each for the full change. Returns `null` when proven, else the reason.
 */
export function singleSwapViolation(tx, pool, candidate) {
  if (!tx || !tx.meta) return "transaction_unavailable";
  if (tx.meta.err !== null) return "transaction_failed";
  const deltas = poolVaultDeltas(tx, pool);
  if (!deltas) return "no_opposite_vault_changes";
  if (deltas.xstockRaw !== candidate.xstockRaw || deltas.usdcRaw !== candidate.usdcRaw) return "deltas_disagree_with_block";
  // Some archived transactions come back without inner instructions or logs; a swap cannot be proven from balances alone.
  if (tx.meta.innerInstructions === null || tx.meta.innerInstructions === undefined) return "inner_instructions_unavailable";
  const vaults = new Set([pool.xstock_vault, pool.usdc_vault]);
  const touching = allInstructions(tx).filter((ix) => TOKEN_PROGRAMS.has(ix.program) && TRANSFER_TYPES.has(ix.parsed?.type)
    && (vaults.has(ix.parsed.info.source) || vaults.has(ix.parsed.info.destination)));
  if (touching.length !== 2) return `vault_transfer_count_${touching.length}`;
  const amountOf = (ix) => BigInt(ix.parsed.info.amount ?? ix.parsed.info.tokenAmount?.amount ?? "-1");
  const rising = BigInt(deltas.xstockRaw) > 0n ? pool.xstock_vault : pool.usdc_vault;
  const falling = rising === pool.xstock_vault ? pool.usdc_vault : pool.xstock_vault;
  const risingDelta = rising === pool.xstock_vault ? BigInt(deltas.xstockRaw) : BigInt(deltas.usdcRaw);
  const fallingDelta = -(falling === pool.xstock_vault ? BigInt(deltas.xstockRaw) : BigInt(deltas.usdcRaw));
  const into = touching.find((ix) => ix.parsed.info.destination === rising && !vaults.has(ix.parsed.info.source));
  const out = touching.find((ix) => ix.parsed.info.source === falling && !vaults.has(ix.parsed.info.destination));
  if (!into || !out) return "vault_transfer_direction";
  if (amountOf(into) !== risingDelta || amountOf(out) !== fallingDelta) return "vault_transfer_amount";
  return null;
}

/** Slots in scan order around `center`: center, center-1, center+1, center-2, ... up to `maxDistance`. */
export function scanOrder(center, maxDistance) {
  const order = [center];
  for (let distance = 1; distance <= maxDistance; distance += 1) order.push(center - distance, center + distance);
  return order;
}

/**
 * Candidates of one block, nearest to the close first: for a block before
 * the close slot the last transactions come first, otherwise the first.
 */
export function candidatesNearestFirst(candidates, slot, closeSlot) {
  const sorted = [...candidates].sort((left, right) => left.index - right.index);
  return slot < closeSlot ? sorted.reverse() : sorted;
}

export function signaturesParams(address, before) {
  return [address, { before, limit: 1000, commitment: "finalized" }];
}

/**
 * Successful pool transactions from a getSignaturesForAddress listing (newest
 * first, as the RPC returns it) whose slot is strictly within `window` slots
 * of `closeSlot`, nearest first: by slot distance, then the earlier slot, and
 * within one slot the transaction nearest the close (the last one for a slot
 * before the close, the first one otherwise). The listing is newest first
 * within a slot too, which is what makes position a time order.
 */
export function signatureCandidatesNearestFirst(listing, closeSlot, window) {
  const kept = listing
    .map((entry, position) => ({ ...entry, position }))
    .filter((entry) => entry.err === null && Math.abs(entry.slot - closeSlot) < window);
  return kept.sort((left, right) => {
    const distance = Math.abs(left.slot - closeSlot) - Math.abs(right.slot - closeSlot);
    if (distance !== 0) return distance;
    if (left.slot !== right.slot) return left.slot - right.slot;
    return left.slot < closeSlot ? left.position - right.position : right.position - left.position;
  });
}

/** The window sequence of the signature method: initial, ×growth, ... capped at the maximum. */
export function windowSequence(initial, growth, maximum) {
  const windows = [];
  for (let window = initial; ; window *= growth) {
    windows.push(Math.min(window, maximum));
    if (window >= maximum) return windows;
  }
}
