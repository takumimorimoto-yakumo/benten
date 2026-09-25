import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ARTIFACT_REVISION, isWithheldFromProduct, productXStocks, xstocks } from "@benten/registry";
import { handleRequest } from "../src/app.js";
import { isValidSolanaAddress } from "../src/solana-address.js";

type GoldenCase = {
  id: string;
  method: string;
  path: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  body_sha256: string;
  parity: "literal" | "provenance-only-intentional-json-normalization" | "provenance-only-intentional-method-normalization";
};
const golden = JSON.parse(await readFile(new URL("./golden/legacy-http.json", import.meta.url), "utf8")) as {
  schema_version: string;
  source_revision: string;
  capture_transport: string;
  cases: GoldenCase[];
};

describe("literal legacy HTTP oracle", () => {
  const getFixtures = golden.cases.filter((item) => item.method === "GET" && item.parity === "literal");

  it("keeps every literal GET paired with a literal HEAD observation", () => {
    for (const getFixture of getFixtures) {
      const headFixture = golden.cases.find((item) => item.method === "HEAD" && item.path === getFixture.path);
      expect(headFixture, getFixture.id).toMatchObject({
        status: getFixture.status,
        headers: getFixture.headers,
        body: "",
        body_sha256: createHash("sha256").update("").digest("hex"),
        parity: "literal",
      });
    }
  });

  it("labels framework method behavior and unknown HTML as provenance-only migrations", () => {
    expect(golden).toMatchObject({
      schema_version: "benten.legacy-http-oracle.v2",
      source_revision: "e3efffd",
      capture_transport: "real-local-http",
    });
    const methodCases = golden.cases.filter((item) => ["OPTIONS", "POST"].includes(item.method) && !item.path.startsWith("/api/unknown"));
    expect(methodCases.length).toBeGreaterThan(0);
    expect(methodCases.every((item) => item.parity === "provenance-only-intentional-method-normalization")).toBe(true);
    const unknownCases = golden.cases.filter((item) => item.path.startsWith("/api/unknown"));
    expect(unknownCases.length).toBeGreaterThan(0);
    expect(unknownCases.every((item) => item.parity === "provenance-only-intentional-json-normalization")).toBe(true);
  });

  for (const fixture of getFixtures) {
    it(`matches ${fixture.id}`, async () => {
      const response = handleRequest(new Request(`http://benten.test${fixture.path}`));
      expect(response.status).toBe(fixture.status);
      for (const [name, value] of Object.entries(fixture.headers)) {
        expect(response.headers.get(name), `${fixture.id} ${name}`).toBe(value);
      }
      expect(await response.text()).toBe(fixture.body);
      expect(createHash("sha256").update(fixture.body).digest("hex")).toBe(fixture.body_sha256);
    });

    it(`matches ${fixture.id}-head`, async () => {
      const headFixture = golden.cases.find((item) => item.method === "HEAD" && item.path === fixture.path)!;
      const response = handleRequest(new Request(`http://benten.test${headFixture.path}`, { method: "HEAD" }));
      expect(response.status).toBe(headFixture.status);
      for (const [name, value] of Object.entries(headFixture.headers)) {
        expect(response.headers.get(name), `${headFixture.id} ${name}`).toBe(value);
      }
      expect(await response.text()).toBe("");
    });
  }
});

describe("transport contract", () => {
  const knownPaths = [
    "/api/fundamentals/NVDA",
    "/api/financials/NVDA?statement=cf",
    "/api/v2/fundamentals?ticker=NVDA",
    "/api/v2/financials?ticker=NVDA&statement=cf",
  ];

  it.each(knownPaths)("returns GET status and material headers with an empty HEAD body for %s", async (path) => {
    const get = handleRequest(new Request(`http://benten.test${path}`));
    const head = handleRequest(new Request(`http://benten.test${path}`, { method: "HEAD" }));
    expect(head.status).toBe(get.status);
    for (const name of ["content-type", "cache-control", "x-benten-artifact-revision"]) {
      expect(head.headers.get(name), name).toBe(get.headers.get(name));
    }
    expect(head.headers.get("cache-control")).toBe("no-store");
    expect(head.headers.get("x-benten-artifact-revision")).toBe(ARTIFACT_REVISION);
    expect(await head.text()).toBe("");
  });

  it.each(knownPaths.flatMap((path) => [
    [path, "OPTIONS", 204],
    [path, "POST", 405],
    [path, "PUT", 405],
    [path, "PATCH", 405],
    [path, "DELETE", 405],
  ] as const))("handles %s %s explicitly", async (path, method, status) => {
    const response = handleRequest(new Request(`http://benten.test${path}`, { method }));
    expect(response.status).toBe(status);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.text()).toBe("");
  });

  it.each(["GET", "HEAD", "OPTIONS", "POST", "DELETE"])("normalizes unknown API %s to the bounded 404 contract", async (method) => {
    const response = handleRequest(new Request("http://benten.test/api/unknown?secret=redacted", { method }));
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("allow")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    if (method === "HEAD") {
      expect(await response.text()).toBe("");
    } else {
      await expect(response.json()).resolves.toEqual({
        error: { code: "unknown_endpoint" },
        disclaimer: "Factual data only. Not investment advice, a recommendation, or a valuation.",
      });
    }
  });

  it.each([
    "/api/v2/fundamentals",
    "/api/v2/fundamentals?ticker=NVDA&ticker=MSFT",
    "/api/v2/fundamentals?ticker=NVDA&debug=true",
    "/api/v2/fundamentals?mint=not-a-mint",
    "/api/v2/fundamentals?ticker=NVDA&fiscal_year_from=20x5",
    "/api/v2/fundamentals?ticker=NVDA&fiscal_year_from=2025&fiscal_year_to=2020",
    "/api/v2/financials?ticker=NVDA&fiscal_year_to=2020&fiscal_year_to=2021",
  ])("rejects malformed v2 query %s", async (path) => {
    const response = handleRequest(new Request(`http://benten.test${path}`));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ data: { found: false, reason: "invalid_input" } });
  });
});

describe("annual history query", () => {
  it("adds sourced annual points only when a fiscal-year bound is supplied", async () => {
    const plain = await handleRequest(new Request("http://benten.test/api/v2/fundamentals?ticker=NVDA")).json();
    expect(plain.data).not.toHaveProperty("annual_history");
    const response = handleRequest(new Request("http://benten.test/api/v2/financials?ticker=NVDA&statement=pl&fiscal_year_from=2016&fiscal_year_to=2025"));
    expect(response.status).toBe(200);
    const body = await response.json();
    const points = body.data.annual_history.points as Array<Record<string, unknown>>;
    expect(new Set(points.map((point) => point.fiscal_year)).size).toBe(10);
    expect(new Set(points.map((point) => point.metric))).toEqual(new Set(["revenue", "net_income_parent"]));
    for (const point of points) {
      expect(point).toMatchObject({ unit: "USD", status: expect.stringMatching(/^(verified_reported|unverified_or_derived)$/) });
      expect(point.filing_url).toEqual(expect.stringMatching(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//));
    }
  });
});

describe("statement history query", () => {
  it("adds fiscal-year x line-item tables with sources only when a fiscal-year bound is supplied", async () => {
    const plain = await handleRequest(new Request("http://benten.test/api/v2/financials?ticker=NVDA&statement=bs")).json();
    expect(plain.data).not.toHaveProperty("statement_history");
    const response = handleRequest(new Request("http://benten.test/api/v2/financials?ticker=NVDA&statement=bs&fiscal_year_from=2021&fiscal_year_to=2023"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body.data.statement_history.statements)).toEqual(["bs"]);
    const table = body.data.statement_history.statements.bs;
    expect(table.years.map((year: { fiscal_year: number }) => year.fiscal_year)).toEqual([2021, 2022, 2023]);
    for (const year of table.years) {
      for (const cell of Object.values(year.cells) as Array<Record<string, any>>) {
        if (cell.kind === "reported") expect(cell.filing.filing_url).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);
        else expect(cell).toMatchObject({ status: "calculated", formula: expect.any(String) });
      }
    }
    const all = await handleRequest(new Request("http://benten.test/api/v2/financials?ticker=NVDA&fiscal_year_from=2024")).json();
    expect(Object.keys(all.data.statement_history.statements)).toEqual(["pl", "bs", "cf", "per_share"]);
  });
});

describe("snapshot coverage", () => {
  it("serves every allowlisted ticker and mint without widening the allowlist", async () => {
    for (const entry of productXStocks) {
      for (const selector of [`ticker=${entry.ticker}`, `mint=${entry.mint}`]) {
        const fundamentals = handleRequest(new Request(`http://benten.test/api/v2/fundamentals?${selector}`));
        const financials = handleRequest(new Request(`http://benten.test/api/v2/financials?${selector}`));
        expect(fundamentals.status, `${entry.ticker} fundamentals`).toBe(200);
        expect(financials.status, `${entry.ticker} financials`).toBe(200);
      }
    }
    const unknown = handleRequest(new Request("http://benten.test/api/v2/fundamentals?ticker=ZZUNKNOWN"));
    expect(unknown.status).toBe(404);
  });

  it("withholds SPCX and VCX from every endpoint, by ticker and by mint", () => {
    // The PreStocks track rule makes a project ineligible when it integrates a
    // non-PreStocks pre-IPO token; see `isWithheldFromProduct` in the registry.
    const withheld = xstocks.filter(isWithheldFromProduct);
    expect(withheld.map((entry) => entry.ticker)).toEqual(["SPCX", "VCX"]);
    for (const entry of withheld) {
      for (const path of [
        `/api/v2/fundamentals?ticker=${entry.ticker}`,
        `/api/v2/fundamentals?mint=${entry.mint}`,
        `/api/v2/financials?ticker=${entry.ticker}`,
        `/api/v2/financials?mint=${entry.mint}`,
        `/api/fundamentals/${entry.ticker}`,
        `/api/financials/${entry.ticker}`,
      ]) {
        const response = handleRequest(new Request(`http://benten.test${path}`));
        expect(response.status, path).toBe(404);
      }
    }
  });

  it("validates canonical 32-byte Solana public keys without network access", () => {
    expect(isValidSolanaAddress("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh")).toBe(true);
    expect(isValidSolanaAddress("11111111111111111111111111111111")).toBe(true);
    expect(isValidSolanaAddress("0OIl11111111111111111111111111111")).toBe(false);
    expect(isValidSolanaAddress("abc123")).toBe(false);
  });
});
