import assert from "node:assert/strict";
import { test } from "node:test";
import type { AccountInfo, Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import {
  inspectAcquisitionPool,
  resolveAcquisitionRoute,
} from "./acquisition-pool.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "./index.js";
import { inspectReviewedRoute } from "./venues/route-observation.js";

const PROGRAM = new PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
const POOL = new PublicKey("49iMatQtoyabsYAQc8GafVq6aeBFVDxSRH44oiatyyw6");
const CONFIG = new PublicKey("DrdecJVzkaRsf1TQu1g7iFncaokikVTHqpzPjenjRySY");
const XSTOCK = new PublicKey("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const VAULT_X = PublicKey.findProgramAddressSync([Buffer.from("pool_vault"), POOL.toBuffer(), XSTOCK.toBuffer()], PROGRAM)[0];
const VAULT_U = PublicKey.findProgramAddressSync([Buffer.from("pool_vault"), POOL.toBuffer(), USDC.toBuffer()], PROGRAM)[0];

function account(owner: PublicKey, data: Buffer): AccountInfo<Buffer> {
  return { owner, data, executable: false, lamports: 1, rentEpoch: 0 };
}

function fixture(): [AccountInfo<Buffer>, AccountInfo<Buffer>, AccountInfo<Buffer>, AccountInfo<Buffer>, AccountInfo<Buffer>] {
  const pool = Buffer.alloc(1544);
  Buffer.from("f7ede3f5d7c3de46", "hex").copy(pool);
  CONFIG.toBuffer().copy(pool, 9);
  XSTOCK.toBuffer().copy(pool, 73);
  USDC.toBuffer().copy(pool, 105);
  VAULT_X.toBuffer().copy(pool, 137);
  VAULT_U.toBuffer().copy(pool, 169);
  pool[233] = 8;
  pool[234] = 6;
  pool.writeUInt16LE(10, 235);
  pool.writeBigUInt64LE(1n, 237);

  const xMint = Buffer.alloc(82);
  xMint[44] = 8;
  xMint[45] = 1;
  const uMint = Buffer.alloc(82);
  uMint[44] = 6;
  uMint[45] = 1;

  const xVault = Buffer.alloc(165);
  XSTOCK.toBuffer().copy(xVault);
  POOL.toBuffer().copy(xVault, 32);
  xVault.writeBigUInt64LE(100n, 64);
  xVault[108] = 1;
  const uVault = Buffer.alloc(165);
  USDC.toBuffer().copy(uVault);
  POOL.toBuffer().copy(uVault, 32);
  uVault.writeBigUInt64LE(1000n, 64);
  uVault[108] = 1;
  return [
    account(PROGRAM, pool),
    account(TOKEN_2022_PROGRAM_ID, xMint),
    account(TOKEN_PROGRAM_ID, uMint),
    account(TOKEN_2022_PROGRAM_ID, xVault),
    account(TOKEN_PROGRAM_ID, uVault),
  ];
}

function rpc(accounts: ReturnType<typeof fixture>): Connection {
  return {
    getGenesisHash: async () => "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    getMultipleAccountsInfoAndContext: async () => ({ context: { slot: 42 }, value: accounts }),
  } as unknown as Connection;
}

test("only an exact allowlisted xStock with a configured pool is eligible for inspection", () => {
  const nvda = resolveAcquisitionRoute({ ticker: "NVDA" });
  assert.equal(nvda.status, "configured");
  if (nvda.status !== "configured") return;
  assert.equal(nvda.route.xstockMint, XSTOCK.toBase58());
  assert.equal(nvda.route.poolId, POOL.toBase58());
  assert.equal(resolveAcquisitionRoute({ mint: XSTOCK.toBase58() }).status, "configured");
  assert.deepEqual(resolveAcquisitionRoute({ ticker: "TSLA" }), { status: "unavailable", reason: "no_verified_pool" });
  assert.deepEqual(resolveAcquisitionRoute({ ticker: "NVDA' OR '1'='1" }), { status: "unavailable", reason: "unknown_asset" });
  assert.deepEqual(resolveAcquisitionRoute({ ticker: "NVDA", mint: XSTOCK.toBase58() }), { status: "unavailable", reason: "invalid_input" });
});

test("onchain pool, mints, and vaults verify at one observed slot", async () => {
  const result = await inspectAcquisitionPool(rpc(fixture()), { ticker: "NVDA" });
  assert.equal(result.status, "verified_pool");
  if (result.status !== "verified_pool") return;
  assert.equal(result.slot, 42);
  assert.equal(result.route.poolId, POOL.toBase58());
  assert.equal(result.xstockVaultRaw, "100");
  assert.equal(result.usdcVaultRaw, "1000");
  assert.equal(result.quoteAvailable, false);
});

test("M2 Raydium wrapper verifies genesis and keeps acquisition unavailable", async () => {
  let genesisReads = 0;
  const connection = {
    ...rpc(fixture()),
    getGenesisHash: async () => { genesisReads++; return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"; },
  } as Connection;
  const result = await inspectReviewedRoute(connection, "raydium_clmm", { ticker: "NVDA" });
  assert.equal(result.status, "verified_identity");
  if (result.status !== "verified_identity") return;
  assert.equal(result.route.poolId, POOL.toBase58());
  assert.equal(result.slot, 42);
  assert.equal(result.quoteAvailable, false);
  assert.equal(result.acquisitionReady, false);
  assert.equal(genesisReads, 1);
  const wrongCluster = { ...rpc(fixture()), getGenesisHash: async () => "wrong-genesis" } as Connection;
  assert.deepEqual(await inspectReviewedRoute(wrongCluster, "raydium_clmm", { ticker: "NVDA" }), {
    status: "unavailable", reason: "wrong_cluster",
  });
  assert.deepEqual(await inspectAcquisitionPool(wrongCluster, { ticker: "NVDA" }), {
    status: "unavailable", reason: "wrong_cluster",
  });
});

test("pool verification fails closed for compromised account fields", async () => {
  const mutations: Array<[string, (accounts: ReturnType<typeof fixture>) => void]> = [
    ["wrong program", (a) => { a[0].owner = TOKEN_PROGRAM_ID; }],
    ["wrong discriminator", (a) => { a[0].data[0] ^= 1; }],
    ["wrong pool derivation", (a) => { USDC.toBuffer().copy(a[0].data, 9); }],
    ["wrong xStock mint", (a) => { USDC.toBuffer().copy(a[0].data, 73); }],
    ["wrong USDC mint", (a) => { XSTOCK.toBuffer().copy(a[0].data, 105); }],
    ["wrong vault PDA", (a) => { USDC.toBuffer().copy(a[0].data, 137); }],
    ["wrong token program", (a) => { a[1].owner = TOKEN_PROGRAM_ID; }],
    ["wrong decimals", (a) => { a[1].data[44] = 9; }],
    ["wrong vault authority", (a) => { USDC.toBuffer().copy(a[3].data, 32); }],
    ["wrong vault mint", (a) => { USDC.toBuffer().copy(a[3].data, 0); }],
    ["empty vault", (a) => { a[3].data.writeBigUInt64LE(0n, 64); }],
    ["swap disabled", (a) => { a[0].data[389] = 1 << 4; }],
    ["zero liquidity", (a) => { a[0].data.writeBigUInt64LE(0n, 237); }],
  ];
  for (const [name, mutate] of mutations) {
    const accounts = fixture();
    mutate(accounts);
    const result = await inspectAcquisitionPool(rpc(accounts), { ticker: "NVDA" });
    assert.equal(result.status, "unavailable", name);
    if (result.status === "unavailable") assert.equal(result.reason, "pool_verification_failed", name);
  }
});

test("RPC failure and missing accounts do not produce a tradable result", async () => {
  const missing = fixture();
  (missing as Array<AccountInfo<Buffer> | null>)[3] = null;
  const result = await inspectAcquisitionPool(rpc(missing), { ticker: "NVDA" });
  assert.deepEqual(result, { status: "unavailable", reason: "pool_verification_failed" });
  const failedRpc = { getMultipleAccountsInfoAndContext: async () => { throw new Error("rpc down"); } } as unknown as Connection;
  assert.deepEqual(await inspectAcquisitionPool(failedRpc, { ticker: "NVDA" }), { status: "unavailable", reason: "rpc_unavailable" });
});

test("invalid Raydium context slot fails closed", async () => {
  const badSlot = {
    getGenesisHash: async () => "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    getMultipleAccountsInfoAndContext: async () => ({ context: { slot: 0 }, value: fixture() }),
  } as unknown as Connection;
  assert.deepEqual(await inspectAcquisitionPool(badSlot, { ticker: "NVDA" }), {
    status: "unavailable", reason: "pool_verification_failed",
  });
});
