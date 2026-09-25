import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as financialsRoute } from "@/app/api/v2/financials/route";
import { GET as fundamentalsRoute } from "@/app/api/v2/fundamentals/route";
import { GET as legacyFinancialsRoute } from "@/app/api/financials/[ticker]/route";
import { GET as legacyFundamentalsRoute } from "@/app/api/fundamentals/[ticker]/route";
import {
  getFinancialsV2,
  getFundamentalsV2,
  parseV2Query,
  publicResultStatus,
} from "@/lib/public-v2";

function readData(result: ReturnType<typeof getFundamentalsV2> | ReturnType<typeof getFinancialsV2>) {
  return result.data as Record<string, any>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("v2 public presenter", () => {
  it("returns the fourteen source-verified NVDA, MSFT and AMZN facts from the immutable overlay", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const results = ["NVDA", "MSFT", "AMZN"].map((ticker) => getFundamentalsV2({ ticker }));
    const facts = results.flatMap((result) => {
      const data = readData(result);
      expect(data.found).toBe(true);
      expect(data.coverage.source_status).toBe("source_verified");
      expect(data.identity.underlying_company).toBeTypeOf("string");
      return Object.values(data.verified_facts.facts);
    });

    expect(facts).toHaveLength(14);
    expect(facts.every((fact: any) => fact.kind === "verified_reported")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a TSM mint lookup as a legacy snapshot without promoting it to source verified", () => {
    const result = getFundamentalsV2({ mint: "XsafvsGtzFqqHgTnA3aPC83EAMkacU5mcGtcSayhpVV" });
    const data = readData(result);

    expect(data).toMatchObject({
      found: true,
      identity: { ticker: "TSM" },
      coverage: { source_status: "legacy_snapshot" },
    });
    expect(data.verified_facts).toBeNull();
    expect(data.legacy_snapshot.kind).toBe("legacy_snapshot");
  });

  it("preserves ASML no-data and SLMT statement-gap states", () => {
    const asml = readData(getFundamentalsV2({ ticker: "ASML" }));
    const slmt = readData(getFinancialsV2({ ticker: "SLMT", statement: "bs" }));

    expect(asml).toMatchObject({
      found: false,
      reason: "no_data",
      identity: { ticker: "ASML" },
      coverage: { snapshot_status: "no_data" },
    });
    expect(slmt).toMatchObject({
      found: true,
      statements: {
        bs: { availability: "no_data", verified_facts: null, legacy_snapshot: null },
      },
    });
  });

  it("distinguishes unknown ticker and mint lookups", () => {
    const unknownTicker = getFundamentalsV2({ ticker: "NOTREAL" });
    const unknownMint = getFundamentalsV2({ mint: "11111111111111111111111111111111" });

    expect(readData(unknownTicker)).toMatchObject({ found: false, reason: "unknown_ticker" });
    expect(readData(unknownMint)).toMatchObject({ found: false, reason: "unknown_mint" });
    expect(publicResultStatus(unknownTicker)).toBe(404);
    expect(publicResultStatus(unknownMint)).toBe(404);
  });
});

describe("v2 API query and route contract", () => {
  it.each([
    ["neither selector", ""],
    ["both selectors", "ticker=NVDA&mint=Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh"],
    ["repeated selector", "ticker=NVDA&ticker=MSFT"],
    ["unsupported parameter", "ticker=NVDA&debug=true"],
  ])("rejects %s before lookup", (_name, query) => {
    expect(parseV2Query(new URLSearchParams(query))).toEqual({ ok: false, reason: "invalid_input" });
  });

  it("defers financial statement semantics to the shared registry resolver", () => {
    expect(parseV2Query(new URLSearchParams("ticker=NVDA&statement=quarterly"), true))
      .toEqual({ ok: true, identifier: { ticker: "NVDA" }, statement: "quarterly" });
  });

  it("gives an unknown financial selector precedence over an invalid statement", async () => {
    const unknownTicker = await financialsRoute(
      new Request("https://benten.test/api/v2/financials?ticker=ZZUNKNOWN&statement=quarterly"),
    );
    const unknownMint = await financialsRoute(
      new Request("https://benten.test/api/v2/financials?mint=11111111111111111111111111111111&statement=quarterly"),
    );
    const knownTicker = await financialsRoute(
      new Request("https://benten.test/api/v2/financials?ticker=NVDA&statement=quarterly"),
    );

    expect(unknownTicker.status).toBe(404);
    await expect(unknownTicker.json()).resolves.toMatchObject({
      data: { found: false, reason: "unknown_ticker", identity: null, coverage: null },
    });
    expect(unknownMint.status).toBe(404);
    await expect(unknownMint.json()).resolves.toMatchObject({
      data: { found: false, reason: "unknown_mint", identity: null, coverage: null },
    });
    expect(knownTicker.status).toBe(400);
    await expect(knownTicker.json()).resolves.toMatchObject({
      data: { found: false, reason: "invalid_statement", identity: { ticker: "NVDA" } },
    });
  });

  it("distinguishes an empty statement from omitted and exact statement selectors", async () => {
    const empty = await financialsRoute(
      new Request("https://benten.test/api/v2/financials?ticker=NVDA&statement="),
    );
    const omitted = await financialsRoute(
      new Request("https://benten.test/api/v2/financials?ticker=NVDA"),
    );
    const exact = await financialsRoute(
      new Request("https://benten.test/api/v2/financials?ticker=NVDA&statement=cf"),
    );

    expect(empty.status).toBe(400);
    await expect(empty.json()).resolves.toMatchObject({
      data: { found: false, reason: "invalid_statement", identity: { ticker: "NVDA" } },
    });
    expect(omitted.status).toBe(200);
    await expect(omitted.json()).resolves.toMatchObject({
      data: { found: true, statements: { pl: expect.any(Object), bs: expect.any(Object), cf: expect.any(Object) } },
    });
    expect(exact.status).toBe(200);
    await expect(exact.json()).resolves.toMatchObject({
      data: { found: true, statements: { cf: expect.any(Object) } },
    });
    const exactBody = await (await financialsRoute(
      new Request("https://benten.test/api/v2/financials?ticker=NVDA&statement=cf"),
    )).json();
    expect(Object.keys(exactBody.data.statements)).toEqual(["cf"]);
  });

  it.each(["", "quarterly"])(
    "gives structural ineligibility precedence over statement %j",
    async (statement) => {
      const response = await financialsRoute(
        new Request(`https://benten.test/api/v2/financials?ticker=SPY&statement=${statement}`),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        data: {
          found: false,
          reason: "not_eligible",
          identity: { ticker: "SPY" },
          coverage: { filing_eligibility: "not_eligible", exclusion_reason: "etf" },
        },
      });
    },
  );

  it("rejects a malformed mint before registry lookup", () => {
    expect(parseV2Query(new URLSearchParams("mint=not-a-solana-mint")))
      .toEqual({ ok: false, reason: "invalid_input" });
  });

  it("returns PublicResult through routes with conventional status codes", async () => {
    const verified = await fundamentalsRoute(new Request("https://benten.test/api/v2/fundamentals?mint=Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh"));
    const invalid = await fundamentalsRoute(new Request("https://benten.test/api/v2/fundamentals?ticker=NVDA&ticker=MSFT"));
    const unknown = await financialsRoute(new Request("https://benten.test/api/v2/financials?mint=11111111111111111111111111111111"));
    const statement = await financialsRoute(new Request("https://benten.test/api/v2/financials?ticker=NVDA&statement=cf"));

    expect(verified.status).toBe(200);
    await expect(verified.json()).resolves.toMatchObject({
      schema_version: "2.0",
      data: { found: true, identity: { ticker: "NVDA" }, coverage: { source_status: "source_verified" } },
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ data: { reason: "invalid_input" } });
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toMatchObject({ data: { reason: "unknown_mint" } });
    expect(statement.status).toBe(200);
    await expect(statement.json()).resolves.toMatchObject({
      data: { found: true, statements: { cf: { availability: "available" } } },
    });
  });
});

describe("legacy web API compatibility", () => {
  it("retains v1 envelope fields without presenting the legacy snapshot as fully source verified", async () => {
    const fundamentals = await legacyFundamentalsRoute(
      new Request("https://benten.test/api/fundamentals/NVDA"),
      { params: { ticker: "NVDA" } },
    );
    const financials = await legacyFinancialsRoute(
      new Request("https://benten.test/api/financials/NVDA"),
      { params: { ticker: "NVDA" } },
    );

    await expect(fundamentals.json()).resolves.toMatchObject({
      found: true,
      ticker: "NVDA",
      as_of: expect.any(String),
      source: "Benten legacy financial snapshot; filing source, unit, and fact kind unverified",
      data: expect.any(Object),
    });
    await expect(financials.json()).resolves.toMatchObject({
      found: true,
      ticker: "NVDA",
      as_of: expect.any(String),
      source: "Benten legacy financial snapshot; filing source, unit, and fact kind unverified",
      statements: expect.any(Object),
    });
  });
});
