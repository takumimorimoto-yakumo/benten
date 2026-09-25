import assert from "node:assert/strict";
import { test } from "node:test";
import type { AccountInfo, Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../index.js";
import { inspectReviewedRoute } from "./route-observation.js";

const PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
const POOL = new PublicKey("F4inHs4RQARpASmvLpj45QjGLdkukeGQrtQ22pimVy2a");
const XSTOCK = new PublicKey("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const VAULT_X = new PublicKey("86FWMceL1zy5agA4HxyDAZxRHR86Ky7D6AhDL8VXtvsY");
const VAULT_U = new PublicKey("GZj4nNXEZ67eEvbvKzkRc8aSrS2EGH2mu2hmUA3UTeBr");
const GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

function account(owner: PublicKey, data: Buffer): AccountInfo<Buffer> {
  return { owner, data, executable: false, lamports: 1, rentEpoch: 0 };
}

function fixture(): Array<AccountInfo<Buffer> | null> {
  const pool = Buffer.alloc(904);
  Buffer.from("210b3162b565b10d", "hex").copy(pool);
  pool[82] = 0;
  XSTOCK.toBuffer().copy(pool, 88);
  USDC.toBuffer().copy(pool, 120);
  VAULT_X.toBuffer().copy(pool, 152);
  VAULT_U.toBuffer().copy(pool, 184);
  const xMint = Buffer.alloc(82);
  xMint[44] = 8;
  xMint[45] = 1;
  const uMint = Buffer.alloc(82);
  uMint[44] = 6;
  uMint[45] = 1;
  const xVault = Buffer.alloc(165);
  XSTOCK.toBuffer().copy(xVault, 0);
  POOL.toBuffer().copy(xVault, 32);
  xVault.writeBigUInt64LE(100n, 64);
  xVault[108] = 1;
  const uVault = Buffer.alloc(165);
  USDC.toBuffer().copy(uVault, 0);
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

function rpc(accounts: ReturnType<typeof fixture>, genesis = GENESIS, slot = 42): Connection {
  return {
    getGenesisHash: async () => genesis,
    getMultipleAccountsInfoAndContext: async (keys: PublicKey[]) => {
      assert.deepEqual(keys.map((key) => key.toBase58()), [POOL, XSTOCK, USDC, VAULT_X, VAULT_U].map((key) => key.toBase58()));
      return { context: { slot }, value: accounts };
    },
  } as unknown as Connection;
}

test("Meteora identity verifies at one account-batch slot without quote readiness", async () => {
  const result = await inspectReviewedRoute(rpc(fixture()), "meteora_dlmm", { ticker: "NVDA" });
  assert.equal(result.status, "verified_identity");
  if (result.status !== "verified_identity") return;
  assert.equal(result.slot, 42);
  assert.equal(result.route.poolId, POOL.toBase58());
  assert.equal(result.xstockVaultRaw, "100");
  assert.equal(result.usdcVaultRaw, "1000");
  assert.equal(result.quoteAvailable, false);
  assert.equal(result.acquisitionReady, false);
});

test("Meteora identity fails closed on mismatched cluster, account, status or slot", async () => {
  assert.deepEqual(await inspectReviewedRoute(rpc(fixture(), "wrong-genesis"), "meteora_dlmm", { ticker: "NVDA" }), {
    status: "unavailable", reason: "wrong_cluster",
  });
  const mutations: Array<[string, (accounts: ReturnType<typeof fixture>) => void]> = [
    ["wrong program", (a) => { a[0]!.owner = TOKEN_PROGRAM_ID; }],
    ["wrong discriminator", (a) => { a[0]!.data[0] ^= 1; }],
    ["inactive status", (a) => { a[0]!.data[82] = 1; }],
    ["wrong xStock mint", (a) => { USDC.toBuffer().copy(a[0]!.data, 88); }],
    ["wrong USDC mint", (a) => { XSTOCK.toBuffer().copy(a[0]!.data, 120); }],
    ["wrong X vault", (a) => { VAULT_U.toBuffer().copy(a[0]!.data, 152); }],
    ["wrong token program", (a) => { a[1]!.owner = TOKEN_PROGRAM_ID; }],
    ["wrong decimals", (a) => { a[1]!.data[44] = 9; }],
    ["wrong vault authority", (a) => { USDC.toBuffer().copy(a[3]!.data, 32); }],
    ["wrong vault mint", (a) => { USDC.toBuffer().copy(a[3]!.data, 0); }],
    ["empty reserve", (a) => { a[3]!.data.writeBigUInt64LE(0n, 64); }],
    ["missing account", (a) => { a[3] = null; }],
  ];
  for (const [name, mutate] of mutations) {
    const accounts = fixture();
    mutate(accounts);
    assert.deepEqual(await inspectReviewedRoute(rpc(accounts), "meteora_dlmm", { ticker: "NVDA" }), {
      status: "unavailable", reason: "pool_verification_failed",
    }, name);
  }
  assert.deepEqual(await inspectReviewedRoute(rpc(fixture(), GENESIS, 0), "meteora_dlmm", { ticker: "NVDA" }), {
    status: "unavailable", reason: "pool_verification_failed",
  });
});

test("invalid assets stop before any RPC and RPC failures never verify", async () => {
  let calls = 0;
  const connection = { getGenesisHash: async () => { calls++; throw new Error("rpc down"); } } as unknown as Connection;
  assert.deepEqual(await inspectReviewedRoute(connection, "meteora_dlmm", { ticker: "TSLA" }), {
    status: "unavailable", reason: "no_verified_pool",
  });
  assert.equal(calls, 0);
  assert.deepEqual(await inspectReviewedRoute(connection, "meteora_dlmm", { ticker: "NVDA" }), {
    status: "unavailable", reason: "rpc_unavailable",
  });
});

test("malformed injected RPC context, owner and reserve data fail closed", async () => {
  const malformed = [
    { context: null, value: fixture() },
    { context: { slot: 42 }, value: fixture().map((item, index) => index === 0 ? { ...item, owner: undefined } : item) },
    { context: { slot: 42 }, value: fixture().map((item, index) => index === 3 ? { ...item, data: undefined } : item) },
  ];
  for (const result of malformed) {
    const connection = {
      getGenesisHash: async () => GENESIS,
      getMultipleAccountsInfoAndContext: async () => result,
    } as unknown as Connection;
    assert.deepEqual(await inspectReviewedRoute(connection, "meteora_dlmm", { ticker: "NVDA" }), {
      status: "unavailable", reason: "pool_verification_failed",
    });
  }
});
