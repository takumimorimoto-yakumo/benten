import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";

import { PURCHASE_CONFIG } from "./config";
import { measurePurchase } from "./result";
import { NVDAX_MINT, USDC_MINT } from "./route";
import { readFinalizedTransactionMeta, RelayRpcError } from "./rpc";

// Synthetic addresses and signature; the response shape follows a finalized
// mainnet `getTransaction` answer with `encoding: base64`. Not real wallets.
const WALLET = new PublicKey(new Uint8Array(32).fill(7)).toBase58();
const POOL_RESERVE = new PublicKey(new Uint8Array(32).fill(9)).toBase58();
const SIGNATURE = "5".repeat(88);
const ENDPOINT = "https://benten.invalid/api/solana-rpc";
const NVDAX = NVDAX_MINT.toBase58();
const USDC = USDC_MINT.toBase58();

function balance(accountIndex: number, mint: string, owner: string, amount: string, decimals: number) {
  return { accountIndex, mint, owner, programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", uiTokenAmount: { amount, decimals, uiAmount: Number(amount) / 10 ** decimals, uiAmountString: amount } };
}

function transactionResult(version: number | "legacy") {
  return {
    slot: 400_000_000,
    blockTime: 1_790_000_000,
    version,
    transaction: ["AQID", "base64"],
    meta: {
      err: null, fee: 5000, preBalances: [1, 2], postBalances: [1, 2], innerInstructions: [], logMessages: [], rewards: [], computeUnitsConsumed: 1,
      status: { Ok: null },
      preTokenBalances: [balance(1, USDC, WALLET, "5000000", 6), balance(3, NVDAX, POOL_RESERVE, "179879402245", 8)],
      postTokenBalances: [balance(1, USDC, WALLET, "4000000", 6), balance(2, NVDAX, WALLET, "441990", 8), balance(3, NVDAX, POOL_RESERVE, "179878960255", 8)],
    },
  };
}

function relay(answer: unknown, status = 200) {
  const requests: Array<{ url: string; body: { method: string; params: [string, Record<string, unknown>] } }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(answer), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}

describe("readFinalizedTransactionMeta", () => {
  it("asks for the highest supported version in base64 and reads a version 1 transaction's balances", async () => {
    const { fetchImpl, requests } = relay({ jsonrpc: "2.0", id: 1, result: transactionResult(1) });
    const meta = await readFinalizedTransactionMeta(ENDPOINT, SIGNATURE, fetchImpl);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(ENDPOINT);
    expect(requests[0].body.method).toBe("getTransaction");
    expect(requests[0].body.params).toEqual([SIGNATURE, { commitment: "finalized", encoding: "base64", maxSupportedTransactionVersion: PURCHASE_CONFIG.maxSupportedTransactionVersion }]);
    expect(PURCHASE_CONFIG.maxSupportedTransactionVersion).toBeGreaterThanOrEqual(1);
    expect(measurePurchase(meta, WALLET)).toEqual({ nvdaxDeltaRaw: 441_990n, usdcPaidRaw: 1_000_000n, payToken: "USDC", paidRaw: 1_000_000n });
  });

  it("reads version 0 and legacy transactions the same way", async () => {
    for (const version of [0, "legacy"] as const) {
      const meta = await readFinalizedTransactionMeta(ENDPOINT, SIGNATURE, relay({ jsonrpc: "2.0", id: 1, result: transactionResult(version) }).fetchImpl);
      expect(measurePurchase(meta, WALLET), String(version)).toEqual({ nvdaxDeltaRaw: 441_990n, usdcPaidRaw: 1_000_000n, payToken: "USDC", paidRaw: 1_000_000n });
    }
  });

  it("keeps only the balance fields the result uses", async () => {
    const meta = await readFinalizedTransactionMeta(ENDPOINT, SIGNATURE, relay({ jsonrpc: "2.0", id: 1, result: transactionResult(1) }).fetchImpl);
    expect(meta?.postTokenBalances?.[1]).toEqual({ accountIndex: 2, mint: NVDAX, owner: WALLET, uiTokenAmount: { amount: "441990" } });
    expect(meta?.err).toBeNull();
  });

  it("returns null while the transaction is not available", async () => {
    expect(await readFinalizedTransactionMeta(ENDPOINT, SIGNATURE, relay({ jsonrpc: "2.0", id: 1, result: null }).fetchImpl)).toBeNull();
    expect(await readFinalizedTransactionMeta(ENDPOINT, SIGNATURE, relay({ jsonrpc: "2.0", id: 1, result: { ...transactionResult(1), meta: null } }).fetchImpl)).toBeNull();
  });

  it("throws on an RPC error such as an unsupported version, an HTTP failure or malformed balances, never guessing a result", async () => {
    await expect(readFinalizedTransactionMeta(ENDPOINT, SIGNATURE, relay({ jsonrpc: "2.0", id: 1, error: { code: -32015, message: "Transaction version (1) is not supported" } }).fetchImpl)).rejects.toEqual(new RelayRpcError(-32015));
    await expect(readFinalizedTransactionMeta(ENDPOINT, SIGNATURE, relay({ error: { code: -32005 } }, 429).fetchImpl)).rejects.toThrow("relay HTTP 429");
    const malformed = transactionResult(1);
    malformed.meta.postTokenBalances[1] = balance(2, NVDAX, WALLET, "4419.90", 8);
    await expect(readFinalizedTransactionMeta(ENDPOINT, SIGNATURE, relay({ jsonrpc: "2.0", id: 1, result: malformed }).fetchImpl)).rejects.toThrow("malformed");
  });

  it("passes a failed transaction's error through, so no result is measured", async () => {
    const failed = transactionResult(1);
    (failed.meta as { err: unknown }).err = { InstructionError: [2, { Custom: 6004 }] };
    const meta = await readFinalizedTransactionMeta(ENDPOINT, SIGNATURE, relay({ jsonrpc: "2.0", id: 1, result: failed }).fetchImpl);
    expect(measurePurchase(meta, WALLET)).toBeNull();
  });
});
