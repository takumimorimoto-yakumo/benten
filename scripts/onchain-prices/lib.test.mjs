import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  READ_METHODS,
  blockCandidates,
  candidatesNearestFirst,
  poolVaultDeltas,
  scanOrder,
  signatureCandidatesNearestFirst,
  singleSwapViolation,
  windowSequence,
} from "./lib.mjs";

const POOL = {
  ticker: "NVDA",
  address: "Pool111111111111111111111111111111111111111",
  xstock_mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  usdc_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  xstock_vault: "XVau1t1111111111111111111111111111111111111",
  usdc_vault: "UVau1t1111111111111111111111111111111111111",
};
const TRADER_X = "TraderX111111111111111111111111111111111111";
const TRADER_U = "TraderU111111111111111111111111111111111111";
const KEYS = [TRADER_X, POOL.address, POOL.xstock_vault, POOL.usdc_vault, TRADER_U];

function balance(index, mint, amount) {
  return { accountIndex: index, mint, uiTokenAmount: { amount: String(amount), decimals: mint === POOL.usdc_mint ? 6 : 8 } };
}

/** A block-style (`accounts`) transaction: the pool sells `x` xStock for `u` USDC unless the signs say otherwise. */
function blockTx({ x = -100000000, u = 200000000, err = null, keys = KEYS, signature = "sig" } = {}) {
  return {
    meta: {
      err,
      preTokenBalances: [balance(2, POOL.xstock_mint, 1_000_000_000), balance(3, POOL.usdc_mint, 5_000_000_000)],
      postTokenBalances: [balance(2, POOL.xstock_mint, 1_000_000_000 + x), balance(3, POOL.usdc_mint, 5_000_000_000 + u)],
    },
    transaction: { accountKeys: keys.map((pubkey) => ({ pubkey })), signatures: [signature] },
  };
}

function transfer(source, destination, amount, checked = true) {
  return checked
    ? { program: "spl-token-2022", parsed: { type: "transferChecked", info: { source, destination, tokenAmount: { amount: String(amount) } } } }
    : { program: "spl-token", parsed: { type: "transfer", info: { source, destination, amount: String(amount) } } };
}

/** A jsonParsed getTransaction response of the same trade, with the given vault transfers. */
function parsedTx(transfers, { x = -100000000, u = 200000000 } = {}) {
  const block = blockTx({ x, u });
  return {
    slot: 10,
    blockTime: 1_700_000_000,
    meta: { ...block.meta, innerInstructions: [{ index: 0, instructions: transfers }] },
    transaction: { message: { accountKeys: KEYS.map((pubkey) => ({ pubkey })), instructions: [{ programId: "Swap", data: "" }] } },
  };
}

describe("poolVaultDeltas", () => {
  it("returns the signed vault changes of a swap", () => {
    assert.deepEqual(poolVaultDeltas(blockTx(), POOL), { xstockRaw: "-100000000", usdcRaw: "200000000" });
  });

  it("ignores transactions that do not name the pool, failed, or move the vaults the same way", () => {
    assert.equal(poolVaultDeltas(blockTx({ keys: [TRADER_X, POOL.xstock_vault, POOL.usdc_vault] }), POOL), null);
    assert.equal(poolVaultDeltas(blockTx({ err: { InstructionError: [0, "Custom"] } }), POOL), null);
    assert.equal(poolVaultDeltas(blockTx({ x: 100, u: 100 }), POOL), null);
    assert.equal(poolVaultDeltas(blockTx({ x: 0, u: 100 }), POOL), null);
  });

  it("fails closed when a vault holds another mint", () => {
    const tx = blockTx();
    tx.meta.preTokenBalances[0].mint = POOL.usdc_mint;
    assert.throws(() => poolVaultDeltas(tx, POOL));
  });
});

describe("blockCandidates", () => {
  it("collects swaps per ticker above the USDC minimum, in transaction order", () => {
    const block = { transactions: [blockTx({ signature: "a" }), blockTx({ signature: "b", u: 500_000 }), blockTx({ signature: "c", x: 5, u: -3_000_000 })] };
    const found = blockCandidates(block, [POOL], "1000000");
    assert.deepEqual(found.NVDA.map((entry) => [entry.signature, entry.index]), [["a", 0], ["c", 2]]);
  });
});

describe("singleSwapViolation", () => {
  const candidate = { xstockRaw: "-100000000", usdcRaw: "200000000" };

  it("accepts exactly one transfer in and one out for the full changes", () => {
    const tx = parsedTx([transfer(TRADER_U, POOL.usdc_vault, 200000000), transfer(POOL.xstock_vault, TRADER_X, 100000000)]);
    assert.equal(singleSwapViolation(tx, POOL, candidate), null);
  });

  it("accepts legacy transfer instructions too", () => {
    const tx = parsedTx([transfer(TRADER_U, POOL.usdc_vault, 200000000, false), transfer(POOL.xstock_vault, TRADER_X, 100000000, false)]);
    assert.equal(singleSwapViolation(tx, POOL, candidate), null);
  });

  it("rejects a second pass through the pool", () => {
    const tx = parsedTx([
      transfer(TRADER_U, POOL.usdc_vault, 250000000), transfer(POOL.xstock_vault, TRADER_X, 125000000),
      transfer(TRADER_X, POOL.xstock_vault, 25000000), transfer(POOL.usdc_vault, TRADER_U, 50000000),
    ]);
    assert.equal(singleSwapViolation(tx, POOL, candidate), "vault_transfer_count_4");
  });

  it("rejects transfers that do not carry the full change", () => {
    const tx = parsedTx([transfer(TRADER_U, POOL.usdc_vault, 199999999), transfer(POOL.xstock_vault, TRADER_X, 100000000)]);
    assert.equal(singleSwapViolation(tx, POOL, candidate), "vault_transfer_amount");
  });

  it("rejects the wrong direction and vault-to-vault moves", () => {
    const wrong = parsedTx([transfer(POOL.usdc_vault, TRADER_U, 200000000), transfer(TRADER_X, POOL.xstock_vault, 100000000)]);
    assert.equal(singleSwapViolation(wrong, POOL, candidate), "vault_transfer_direction");
    const internal = parsedTx([transfer(POOL.xstock_vault, POOL.usdc_vault, 1), transfer(TRADER_U, POOL.usdc_vault, 200000000)]);
    assert.equal(singleSwapViolation(internal, POOL, candidate), "vault_transfer_direction");
  });

  it("rejects deltas that disagree with the candidate, and failed or missing transactions", () => {
    const tx = parsedTx([transfer(TRADER_U, POOL.usdc_vault, 200000000), transfer(POOL.xstock_vault, TRADER_X, 100000000)]);
    assert.equal(singleSwapViolation(tx, POOL, { ...candidate, usdcRaw: "1" }), "deltas_disagree_with_block");
    assert.equal(singleSwapViolation(null, POOL, candidate), "transaction_unavailable");
    assert.equal(singleSwapViolation({ ...tx, meta: { ...tx.meta, err: {} } }, POOL, candidate), "transaction_failed");
  });
});

describe("search order", () => {
  it("scans the close slot, then alternately before and after", () => {
    assert.deepEqual(scanOrder(100, 2), [100, 99, 101, 98, 102]);
  });

  it("orders block candidates nearest the close within a block", () => {
    const candidates = [{ index: 1 }, { index: 5 }, { index: 3 }];
    assert.deepEqual(candidatesNearestFirst(candidates, 99, 100).map((entry) => entry.index), [5, 3, 1]);
    assert.deepEqual(candidatesNearestFirst(candidates, 101, 100).map((entry) => entry.index), [1, 3, 5]);
  });

  it("orders a newest-first signature listing by distance, earlier slot, then nearness to the close", () => {
    const listing = [
      { signature: "after-late", slot: 102, err: null },
      { signature: "after-early", slot: 102, err: null },
      { signature: "failed", slot: 101, err: { InstructionError: [0, "x"] } },
      { signature: "close", slot: 100, err: null },
      { signature: "before-late", slot: 98, err: null },
      { signature: "before-early", slot: 98, err: null },
      { signature: "far", slot: 50, err: null },
    ];
    assert.deepEqual(signatureCandidatesNearestFirst(listing, 100, 10).map((entry) => entry.signature), [
      "close", "before-late", "before-early", "after-early", "after-late",
    ]);
  });

  it("grows the window geometrically up to the cap", () => {
    assert.deepEqual(windowSequence(150, 4, 4500), [150, 600, 2400, 4500]);
    assert.deepEqual(windowSequence(150, 4, 150), [150]);
  });
});

describe("read-only client", () => {
  it("allows exactly the fixed list of read methods", () => {
    assert.deepEqual([...READ_METHODS].sort(), [
      "getAccountInfo", "getBlock", "getBlockTime", "getSignaturesForAddress", "getSlot", "getTokenAccountsByOwner", "getTransaction",
    ]);
  });
});

describe("archived transactions without instructions", () => {
  it("cannot be proven a single swap from balances alone", () => {
    const tx = parsedTx([]);
    tx.meta.innerInstructions = null;
    assert.equal(singleSwapViolation(tx, POOL, { xstockRaw: "-100000000", usdcRaw: "200000000" }), "inner_instructions_unavailable");
  });
});
