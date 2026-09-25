import { describe, expect, it, vi } from "vitest";
import { SUPPORTED_PRODUCTS, TOKEN_2022_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from "@benten/solana/supported-products";

import { HOLDINGS_CONFIG } from "./config";
import {
  OTHER_OWNER,
  OWNER,
  accountAddress,
  base64,
  clockData,
  keyedAccount,
  mintData,
  tokenAccountData,
} from "./fixtures.test-helpers";
import { isCanonicalAddress, readHoldings, readHoldingsThroughRelay } from "./read-holdings";
import { HoldingsRpcError, type HoldingsRpc } from "./rpc";

const NVDAX_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PRESTOCKS = [...SUPPORTED_PRODUCTS.values()].find((product) => product.kind === "prestocks")!;
const SPL_SLOT = 1_000;
const T22_SLOT = 1_002;
const META_SLOT = 1_003;
/** Chain time after the fixture multiplier switch at 1_789_000_200. */
const CHAIN_TIME = 1_790_000_000n;
const NOW = 1_790_000_000_000;

interface Scenario {
  spl?: unknown[];
  token2022?: unknown[];
  mints?: Array<{ owner: string; data: Uint8Array } | null>;
  clock?: Uint8Array | "fail";
  failAt?: { method: string; error: Error };
}

function scenarioRpc(scenario: Scenario) {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const rpc: HoldingsRpc = vi.fn(async (method: string, params: unknown[]) => {
    calls.push({ method, params });
    if (scenario.failAt && scenario.failAt.method === method) throw scenario.failAt.error;
    if (method === "getTokenAccountsByOwner") {
      const program = (params[1] as { programId: string }).programId;
      return program === TOKEN_PROGRAM_ADDRESS
        ? { context: { slot: SPL_SLOT }, value: scenario.spl ?? [] }
        : { context: { slot: T22_SLOT }, value: scenario.token2022 ?? [] };
    }
    if (method === "getMultipleAccounts") {
      return {
        context: { slot: META_SLOT },
        value: (scenario.mints ?? []).map((mint) => mint && { owner: mint.owner, lamports: 1, executable: false, rentEpoch: 0, data: [base64(mint.data), "base64"] }),
      };
    }
    if (method === "getAccountInfo") {
      if (scenario.clock === "fail") throw new HoldingsRpcError("upstream_unavailable");
      const data = scenario.clock ?? clockData(BigInt(META_SLOT), CHAIN_TIME);
      return { context: { slot: META_SLOT }, value: { owner: "Sysvar1111111111111111111111111111111111111", data: [base64(data), "base64"] } };
    }
    throw new Error(`unexpected ${method}`);
  });
  return { rpc, calls };
}

const nvdaxMint = { owner: TOKEN_2022_PROGRAM_ADDRESS, data: mintData(8, { multiplier: 1.0009180758490996, effectiveAt: 1_789_000_200n, newMultiplier: 1.001701196801074 }) };

describe("readHoldings", () => {
  it("reads both token programs, keeps only supported products and aggregates raw amounts by mint", async () => {
    const { rpc, calls } = scenarioRpc({
      spl: [
        keyedAccount(accountAddress(11), TOKEN_PROGRAM_ADDRESS, tokenAccountData({ mint: USDC_MINT, amount: 5_000_000n })),
        keyedAccount(accountAddress(12), TOKEN_PROGRAM_ADDRESS, tokenAccountData({ mint: PRESTOCKS.mint, amount: 250_000_000n })),
      ],
      token2022: [
        keyedAccount(accountAddress(22), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 100_000_000n, extensions: [{ type: 7, length: 0 }] })),
        keyedAccount(accountAddress(21), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 41_982n, state: 2 })),
      ],
      // Mints are read in sorted order: PreStocks mint ("Pre...") then NVDAx ("Xsc...").
      mints: [{ owner: TOKEN_PROGRAM_ADDRESS, data: mintData(9) }, nvdaxMint],
    });

    const observation = await readHoldings(rpc, OWNER, () => NOW);

    expect(observation.status).toBe("available");
    if (observation.status === "unavailable") throw new Error("unreachable");
    expect(observation.reason).toBeNull();
    expect(observation.holdingsSlots).toEqual({ splToken: String(SPL_SLOT), token2022: String(T22_SLOT) });
    expect(observation.metadataSlot).toBe(String(META_SLOT));
    expect(observation.chainUnixTimestamp).toBe(String(CHAIN_TIME));
    expect(observation.coverage).toEqual({ tokenAccounts: 4, productAccounts: 3, otherAccounts: 1, unreadableAccounts: 0 });
    expect(observation.holdings.map((holding) => holding.mint)).toEqual([PRESTOCKS.mint, NVDAX_MINT]);

    const nvdax = observation.holdings[1]!;
    expect(nvdax).toEqual({
      mint: NVDAX_MINT,
      product: SUPPORTED_PRODUCTS.get(NVDAX_MINT),
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      accounts: [accountAddress(21), accountAddress(22)].sort(),
      rawAmount: "100041982",
      decimals: 8,
      hasScaledUiAmount: true,
      scaledUiMultiplier: "1.001701196801074",
      // 100041982 × 1.001701196801074, truncated to 8 decimals.
      displayAmount: "1.00212173",
      frozenAccounts: 1,
      delegatedAccounts: 0,
    });
    const prestocks = observation.holdings[0]!;
    expect(prestocks.product.kind).toBe("prestocks");
    expect(prestocks.hasScaledUiAmount).toBe(false);
    expect(prestocks.scaledUiMultiplier).toBeNull();
    expect(prestocks.displayAmount).toBe("0.25");

    // External read calls: exact methods and params, in order.
    expect(calls).toEqual([
      { method: "getTokenAccountsByOwner", params: [OWNER, { programId: TOKEN_PROGRAM_ADDRESS }, { encoding: "base64", commitment: "confirmed" }] },
      { method: "getTokenAccountsByOwner", params: [OWNER, { programId: TOKEN_2022_PROGRAM_ADDRESS }, { encoding: "base64", commitment: "confirmed", minContextSlot: SPL_SLOT }] },
      { method: "getMultipleAccounts", params: [[PRESTOCKS.mint, NVDAX_MINT], { encoding: "base64", commitment: "confirmed", minContextSlot: T22_SLOT }] },
      { method: "getAccountInfo", params: [HOLDINGS_CONFIG.clockSysvar, { encoding: "base64", commitment: "confirmed", minContextSlot: T22_SLOT }] },
    ]);
  });

  it("evaluates the Scaled UI multiplier at the chain time, not a stored value", async () => {
    const { rpc } = scenarioRpc({
      token2022: [keyedAccount(accountAddress(22), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 100_000_000n }))],
      mints: [nvdaxMint],
      clock: clockData(BigInt(META_SLOT), 1_789_000_199n),
    });
    const observation = await readHoldings(rpc, OWNER, () => NOW);
    if (observation.status === "unavailable") throw new Error("unreachable");
    expect(observation.holdings[0]!.scaledUiMultiplier).toBe("1.0009180758490996");
    expect(observation.holdings[0]!.displayAmount).toBe("1.00091807");
    expect(observation.holdings[0]!.rawAmount).toBe("100000000");
  });

  it("shows a split multiplier on display only; the raw amount is unchanged", async () => {
    const { rpc } = scenarioRpc({
      token2022: [keyedAccount(accountAddress(22), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 150_000_000n }))],
      mints: [{ owner: TOKEN_2022_PROGRAM_ADDRESS, data: mintData(8, { multiplier: 1, effectiveAt: 1_000n, newMultiplier: 10 }) }],
    });
    const observation = await readHoldings(rpc, OWNER, () => NOW);
    if (observation.status === "unavailable") throw new Error("unreachable");
    expect(observation.holdings[0]).toMatchObject({ rawAmount: "150000000", scaledUiMultiplier: "10", displayAmount: "15.00" });
  });

  it("returns an empty available observation for a wallet with no supported product", async () => {
    const { rpc, calls } = scenarioRpc({ spl: [keyedAccount(accountAddress(11), TOKEN_PROGRAM_ADDRESS, tokenAccountData({ mint: USDC_MINT, amount: 1n }))] });
    const observation = await readHoldings(rpc, OWNER, () => NOW);
    expect(observation).toMatchObject({ status: "available", reason: null, holdings: [], metadataSlot: null, coverage: { tokenAccounts: 1, productAccounts: 0, otherAccounts: 1, unreadableAccounts: 0 } });
    expect(calls.map((call) => call.method)).toEqual(["getTokenAccountsByOwner", "getTokenAccountsByOwner"]);
  });

  it("rejects an invalid owner before any read", async () => {
    const { rpc } = scenarioRpc({});
    for (const owner of ["", "not-a-key", `${OWNER}1`, `0${OWNER.slice(1)}`]) {
      expect(await readHoldings(rpc, owner, () => NOW)).toMatchObject({ status: "unavailable", reason: "invalid_owner", holdings: null });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["an account of another owner", { spl: [keyedAccount(accountAddress(11), TOKEN_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, owner: OTHER_OWNER, amount: 1n }))] }, "malformed_account"],
    ["an account owned by the other program", { spl: [keyedAccount(accountAddress(11), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 1n }))] }, "malformed_account"],
    ["an uninitialized account", { spl: [keyedAccount(accountAddress(11), TOKEN_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 1n, state: 0 }))] }, "malformed_account"],
    ["a TLV entry past the data", { token2022: [keyedAccount(accountAddress(11), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 1n, extensions: [{ type: 7, length: 0, declaredLength: 8 }] }))] }, "malformed_account"],
    ["one mint under both programs", {
      spl: [keyedAccount(accountAddress(11), TOKEN_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 1n }))],
      token2022: [keyedAccount(accountAddress(12), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 1n }))],
    }, "malformed_account"],
    ["the same account twice", {
      spl: [keyedAccount(accountAddress(11), TOKEN_PROGRAM_ADDRESS, tokenAccountData({ mint: USDC_MINT, amount: 1n }))],
      token2022: [keyedAccount(accountAddress(11), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 1n }))],
    }, "malformed_rpc"],
    ["a supported product account with short data", { spl: [keyedAccount(accountAddress(11), TOKEN_PROGRAM_ADDRESS, tokenAccountData({ mint: PRESTOCKS.mint, amount: 1n }).subarray(0, 100))] }, "malformed_account"],
    ["a supported product account with a bad option tag", { spl: [keyedAccount(accountAddress(11), TOKEN_PROGRAM_ADDRESS, (() => {
      const data = tokenAccountData({ mint: PRESTOCKS.mint, amount: 1n });
      data[72] = 2;
      return data;
    })())] }, "malformed_account"],
    ["a supported product account with a confidential balance", { token2022: [keyedAccount(accountAddress(11), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 1n, extensions: [{ type: 7, length: 0 }, { type: 5, length: 8 }] }))] }, "malformed_account"],
    ["a supported product account without a canonical address", { token2022: [{ ...keyedAccount(accountAddress(11), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 1n })), pubkey: "not-a-key" }] }, "malformed_rpc"],
    ["a list that is not an array", { spl: "nope" as unknown as unknown[] }, "malformed_rpc"],
    ["too many accounts", {
      spl: Array.from({ length: HOLDINGS_CONFIG.maxAccountsPerProgram + 1 }, (_, index) => keyedAccount(accountAddress(index % 250), TOKEN_PROGRAM_ADDRESS, tokenAccountData({ mint: USDC_MINT, amount: 1n }))),
    }, "account_limit"],
  ])("fails closed on %s", async (_name, scenario, reason) => {
    const { rpc } = scenarioRpc(scenario as Scenario);
    expect(await readHoldings(rpc, OWNER, () => NOW)).toMatchObject({ status: "unavailable", reason, holdings: null });
  });

  it.each(["rate_limited", "timeout", "upstream_unavailable"] as const)(
    "reports a %s holdings read as unavailable",
    async (reason) => {
      const { rpc } = scenarioRpc({ failAt: { method: "getTokenAccountsByOwner", error: new HoldingsRpcError(reason) } });
      expect(await readHoldings(rpc, OWNER, () => NOW)).toMatchObject({ status: "unavailable", reason });
    },
  );

  it("reports a holdings answer too large to accept as a wallet with too many accounts", async () => {
    const { rpc } = scenarioRpc({ failAt: { method: "getTokenAccountsByOwner", error: new HoldingsRpcError("response_too_large") } });
    expect(await readHoldings(rpc, OWNER, () => NOW)).toMatchObject({ status: "unavailable", reason: "account_limit", holdings: null });
  });

  it("counts accounts of other mints without decoding them, and counts the unreadable ones separately", async () => {
    const otherMint = accountAddress(40);
    const badState = tokenAccountData({ mint: otherMint, amount: 1n, state: 0 });
    const badTag = tokenAccountData({ mint: otherMint, amount: 1n });
    badTag[129] = 9;
    const { rpc } = scenarioRpc({
      spl: [
        // Defects no decoder would accept, on mints Benten does not cover: counted, not decoded.
        keyedAccount(accountAddress(31), TOKEN_PROGRAM_ADDRESS, badState),
        keyedAccount(accountAddress(32), TOKEN_PROGRAM_ADDRESS, badTag),
        keyedAccount(accountAddress(33), TOKEN_PROGRAM_ADDRESS, tokenAccountData({ mint: USDC_MINT, amount: 1n, token2022Layout: true })),
        // Owner or program not as asked: counted as unreadable.
        keyedAccount(accountAddress(34), TOKEN_PROGRAM_ADDRESS, tokenAccountData({ mint: USDC_MINT, owner: OTHER_OWNER, amount: 1n })),
        keyedAccount(accountAddress(35), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: otherMint, amount: 1n })),
        { ...keyedAccount(accountAddress(36), TOKEN_PROGRAM_ADDRESS, tokenAccountData({ mint: otherMint, amount: 1n })), pubkey: "not-a-key" },
      ],
      token2022: [
        keyedAccount(accountAddress(37), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: otherMint, amount: 1n, extensions: [{ type: 7, length: 0, declaredLength: 64 }] })),
        keyedAccount(accountAddress(38), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: otherMint, amount: 1n, extensions: [{ type: 5, length: 8 }, { type: 999, length: 3 }] })),
        keyedAccount(accountAddress(22), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 100_000_000n })),
      ],
      mints: [nvdaxMint],
    });
    const observation = await readHoldings(rpc, OWNER, () => NOW);
    expect(observation).toMatchObject({ status: "available", reason: null });
    if (observation.status === "unavailable") throw new Error("unreachable");
    expect(observation.coverage).toEqual({ tokenAccounts: 9, productAccounts: 1, otherAccounts: 8, unreadableAccounts: 3 });
    expect(observation.holdings.map((holding) => [holding.product.symbol, holding.rawAmount])).toEqual([["NVDAx", "100000000"]]);
  });

  it("keeps the list but marks the read partial when an account's mint cannot be read", async () => {
    const { rpc } = scenarioRpc({
      spl: [
        { pubkey: accountAddress(31), account: { owner: TOKEN_PROGRAM_ADDRESS, data: ["A===", "base64"] } },
        { pubkey: accountAddress(32), account: { owner: TOKEN_PROGRAM_ADDRESS, data: { parsed: {} } } },
        keyedAccount(accountAddress(33), TOKEN_PROGRAM_ADDRESS, new Uint8Array(63)),
        { pubkey: accountAddress(34) },
        null,
      ],
      token2022: [keyedAccount(accountAddress(22), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 7n }))],
      mints: [nvdaxMint],
    });
    const observation = await readHoldings(rpc, OWNER, () => NOW);
    expect(observation).toMatchObject({ status: "partial", reason: "unidentified_accounts" });
    if (observation.status === "unavailable") throw new Error("unreachable");
    expect(observation.coverage).toEqual({ tokenAccounts: 6, productAccounts: 1, otherAccounts: 5, unreadableAccounts: 5 });
    expect(observation.holdings[0]).toMatchObject({ rawAmount: "7", displayAmount: "0.00000007" });
  });

  it("accepts a supported product account with an extension type it does not know, reading the raw amount from the base account", async () => {
    const { rpc } = scenarioRpc({
      token2022: [keyedAccount(accountAddress(22), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 123n, extensions: [{ type: 7, length: 0 }, { type: 27, length: 1 }, { type: 15, length: 1 }, { type: 999, length: 12 }] }))],
      mints: [nvdaxMint],
    });
    const observation = await readHoldings(rpc, OWNER, () => NOW);
    expect(observation).toMatchObject({ status: "available", reason: null });
    if (observation.status === "unavailable") throw new Error("unreachable");
    expect(observation.holdings[0]).toMatchObject({ rawAmount: "123" });
  });

  it("keeps the raw quantity but no display amount when the mint cannot be read", async () => {
    const { rpc } = scenarioRpc({
      token2022: [keyedAccount(accountAddress(22), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 7n }))],
      mints: [null],
    });
    const observation = await readHoldings(rpc, OWNER, () => NOW);
    expect(observation).toMatchObject({ status: "partial", reason: "mint_unavailable" });
    if (observation.status === "unavailable") throw new Error("unreachable");
    expect(observation.holdings[0]).toMatchObject({ rawAmount: "7", decimals: null, hasScaledUiAmount: null, scaledUiMultiplier: null, displayAmount: null });
  });

  it("refuses a mint account owned by an unexpected program", async () => {
    const { rpc } = scenarioRpc({
      token2022: [keyedAccount(accountAddress(22), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 7n }))],
      mints: [{ owner: TOKEN_PROGRAM_ADDRESS, data: nvdaxMint.data }],
    });
    expect(await readHoldings(rpc, OWNER, () => NOW)).toMatchObject({ status: "partial", reason: "mint_unavailable" });
  });

  it("gives no multiplier without a chain time", async () => {
    const { rpc } = scenarioRpc({
      token2022: [keyedAccount(accountAddress(22), TOKEN_2022_PROGRAM_ADDRESS, tokenAccountData({ mint: NVDAX_MINT, amount: 7n }))],
      mints: [nvdaxMint],
      clock: "fail",
    });
    const observation = await readHoldings(rpc, OWNER, () => NOW);
    expect(observation).toMatchObject({ status: "partial", reason: "upstream_unavailable", chainUnixTimestamp: null });
    if (observation.status === "unavailable") throw new Error("unreachable");
    expect(observation.holdings[0]).toMatchObject({ decimals: 8, hasScaledUiAmount: true, scaledUiMultiplier: null, displayAmount: null });
  });

  it("rejects a Token-2022 read that reports an earlier slot than the SPL read", async () => {
    const rpc: HoldingsRpc = async (_method, params) => ({
      context: { slot: (params[1] as { programId: string }).programId === TOKEN_PROGRAM_ADDRESS ? 10 : 9 },
      value: [],
    });
    expect(await readHoldings(rpc, OWNER, () => NOW)).toMatchObject({ status: "unavailable", reason: "malformed_rpc" });
  });
});

describe("isCanonicalAddress", () => {
  it("accepts exactly canonical 32-byte base58 text", () => {
    expect(isCanonicalAddress(OWNER)).toBe(true);
    expect(isCanonicalAddress(NVDAX_MINT)).toBe(true);
    expect(isCanonicalAddress("11111111111111111111111111111111")).toBe(true);
    expect(isCanonicalAddress("1111111111111111111111111111111")).toBe(false);
    expect(isCanonicalAddress(`${NVDAX_MINT} `)).toBe(false);
    expect(isCanonicalAddress(42)).toBe(false);
  });
});

describe("readHoldingsThroughRelay", () => {
  it("posts single JSON-RPC calls to the relay URL and nothing else", async () => {
    const bodies: unknown[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(url).toBe("https://benten.test/api/solana-rpc");
      expect(init?.method).toBe("POST");
      expect(init?.credentials).toBe("omit");
      const body = JSON.parse(init!.body as string);
      bodies.push(body);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { context: { slot: 5 }, value: [] } }));
    });
    const observation = await readHoldingsThroughRelay(OWNER, { relayUrl: "https://benten.test/api/solana-rpc", fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW });
    expect(observation).toMatchObject({ status: "available", holdings: [] });
    expect(bodies).toEqual([
      { jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [OWNER, { programId: TOKEN_PROGRAM_ADDRESS }, { encoding: "base64", commitment: "confirmed" }] },
      { jsonrpc: "2.0", id: 2, method: "getTokenAccountsByOwner", params: [OWNER, { programId: TOKEN_2022_PROGRAM_ADDRESS }, { encoding: "base64", commitment: "confirmed", minContextSlot: 5 }] },
    ]);
  });
});
