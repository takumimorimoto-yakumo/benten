#!/usr/bin/env node
/**
 * Build the reviewed pool list `packages/pricing/src/onchain-pools-v1.json`
 * from a pool selection file, checking every pool on chain.
 *
 * Tooling only; reads only. The selection file is the output of
 * `probe-pools.mjs`: one USDC pool per ticker with the on-chain activity
 * probes it was chosen by. For each pool this script reads, over
 * public Solana RPC:
 *   - the pool account, recording its owning program;
 *   - the pool state's two token mints and two vaults, decoded with the
 *     layout of its program (Raydium CLMM, Byreal CLMM or Orca Whirlpool only). The mints
 *     must be exactly the xStock and USDC, and each vault must be a token
 *     account the pool owns. A pool may own more than one account of a mint
 *     (reward vaults, stray deposits), so ownership alone never picks a vault.
 * The xStock mint and decimals come from the bundled registry, never from
 * the selection file.
 *
 * Usage:
 *   node scripts/onchain-prices/verify-pools.mjs --selection PATH [--checked-at YYYY-MM-DD] [--dry-run]
 *
 * Environment:
 *   ONCHAIN_PRICES_RPC_URL  Overrides the public mainnet RPC URL.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, createRpc, loadConfig, loadJson } from "./lib.mjs";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;
const OUT = join(REPO_ROOT, "packages/pricing/src/onchain-pools-v1.json");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const selectionPath = argument("--selection");
if (!selectionPath) throw new Error("--selection PATH is required");
const checkedAt = argument("--checked-at") ?? new Date().toISOString().slice(0, 10);
const dryRun = process.argv.includes("--dry-run");

const config = loadConfig();
const rpc = createRpc({
  url: process.env[config.rpc.url_env] || config.rpc.default_url,
  minIntervalMs: config.rpc.min_interval_ms,
  maxRetries: config.rpc.max_retries,
  backoffBaseMs: config.rpc.backoff_base_ms,
  backoffMaxMs: config.rpc.backoff_max_ms,
  timeoutMs: config.rpc.timeout_ms,
  log: (line) => console.error(line),
});

const registry = loadJson(join(REPO_ROOT, "packages/registry/src/xstocks.json"));
const selection = loadJson(selectionPath);

/** Byte offsets of the mints and vaults in each supported program's pool state account. */
const POOL_LAYOUTS = {
  // Raydium CLMM PoolState: discriminator 8, bump 1, amm_config 32, owner 32, mint_0, mint_1, vault_0, vault_1.
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: { mints: [73, 105], vaults: [137, 169] },
  // Byreal CLMM keeps the Raydium CLMM PoolState layout.
  REALQqNEomY6cQGZJUGwywTBD2UmDT32rZcNnfxQ5N2: { mints: [73, 105], vaults: [137, 169] },
  // Orca Whirlpool: token_mint_a at 101, token_vault_a at 133, token_mint_b at 181, token_vault_b at 213.
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: { mints: [101, 181], vaults: [133, 213] },
};

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let text = "";
  while (value > 0n) {
    text = BASE58[Number(value % 58n)] + text;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    text = `1${text}`;
  }
  return text;
}

async function ownedAccounts(pool, mint) {
  const { result } = await rpc.call("getTokenAccountsByOwner", [pool, { mint }, { encoding: "jsonParsed", commitment: "finalized" }]);
  return new Set(result.value.filter((account) => account.account.data.parsed.info.owner === pool).map((account) => account.pubkey));
}

async function poolVaults(address, xstockMint) {
  const { result } = await rpc.call("getAccountInfo", [address, { encoding: "base64", commitment: "finalized" }]);
  if (!result.value) throw new Error(`${address} does not exist`);
  const program = result.value.owner;
  const layout = POOL_LAYOUTS[program];
  if (!layout) throw new Error(`${address} is owned by unsupported program ${program}`);
  const data = Buffer.from(result.value.data[0], "base64");
  const read = (offset) => base58(data.subarray(offset, offset + 32));
  const mints = layout.mints.map(read);
  const vaults = layout.vaults.map(read);
  const xIndex = mints.indexOf(xstockMint);
  const uIndex = mints.indexOf(USDC_MINT);
  if (xIndex === -1 || uIndex === -1 || xIndex === uIndex) throw new Error(`${address} pairs ${mints.join("/")}, not the xStock and USDC`);
  const [xstockVault, usdcVault] = [vaults[xIndex], vaults[uIndex]];
  if (!(await ownedAccounts(address, xstockMint)).has(xstockVault)) throw new Error(`${xstockVault} is not a pool-owned xStock account`);
  if (!(await ownedAccounts(address, USDC_MINT)).has(usdcVault)) throw new Error(`${usdcVault} is not a pool-owned USDC account`);
  return { program, xstockVault, usdcVault };
}

const pools = [];
for (const [ticker, chosen] of Object.entries(selection.pools)) {
  const entry = registry.find((row) => row.ticker === ticker);
  if (!entry) throw new Error(`${ticker} is not a registry ticker`);
  if (entry.mint !== chosen.mint) throw new Error(`${ticker} selection mint disagrees with the registry`);
  const { program, xstockVault, usdcVault } = await poolVaults(chosen.address, entry.mint);
  pools.push({
    ticker,
    symbol: entry.symbol,
    xstock_mint: entry.mint,
    xstock_decimals: entry.decimals,
    usdc_mint: USDC_MINT,
    usdc_decimals: USDC_DECIMALS,
    address: chosen.address,
    dex: chosen.dex,
    program,
    xstock_vault: xstockVault,
    usdc_vault: usdcVault,
    created_at: chosen.created,
    selection: { rule: chosen.rule, observed_at: selection.observed_at, probes: chosen.probes },
    checked_at: checkedAt,
  });
  console.error(`${ticker} ${chosen.address} ok`);
}

const artifact = {
  schema_version: "benten.onchain-pools.v1",
  checked_at: checkedAt,
  selection: {
    directory: selection.directory,
    rule: selection.rule,
  },
  pools,
};
if (dryRun) console.log(JSON.stringify(artifact, null, 2));
else writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.error(`requests=${rpc.stats.requests} retries=${rpc.stats.retries}`);
