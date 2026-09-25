import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import indexJson from "./company-search-index-v1.json" with { type: "json" };
import { findCompany, isWithheldFromProduct, resolveTicker, xstocks } from "./index.js";
import { buildCompanySearchIndex } from "./search-index-source.js";
import { SEARCH_MAX_LIMIT, normalizeSearchText, searchCandidates } from "./search.js";

const sourceRoot = import.meta.dirname;
const FULLWIDTH_NVDA = "ＮＶＤＡ";

/** The only sanctioned way to open a candidate: the existing exact lookups. */
function open(candidate: { slug: string | null; ticker: string | null }) {
  return candidate.slug !== null ? findCompany(candidate.slug) : resolveTicker(candidate.ticker!);
}

describe("company search index artifact", () => {
  it("is exactly what the read model derives, so it cannot drift", () => {
    expect(indexJson).toEqual(buildCompanySearchIndex());
  });

  it("indexes every company and every company-less product xStock, and nothing withheld", () => {
    expect(indexJson.entries).toHaveLength(160);
    const tickers = indexJson.entries.map((entry) => entry.ticker);
    for (const entry of xstocks.filter(isWithheldFromProduct)) expect(tickers).not.toContain(entry.ticker);
    const text = JSON.stringify(indexJson).toLowerCase();
    for (const absent of ["spcx", "vcx", "tessera", "fundrise"]) expect(text.includes(absent)).toBe(false);
  });

  it("stays light and carries no snapshot, fact or mint", () => {
    const bytes = readFileSync(join(sourceRoot, "company-search-index-v1.json"));
    expect(bytes.length).toBeLessThan(40_000);
    const source = readFileSync(join(sourceRoot, "search.ts"), "utf8");
    expect(source.match(/^import .*$/gm)).toEqual([
      'import indexJson from "./company-search-index-v1.json" with { type: "json" };',
    ]);
    for (const entry of indexJson.entries) expect(Object.keys(entry).sort()).toEqual(["names", "slug", "symbols", "ticker"]);
    expect(JSON.stringify(indexJson)).not.toMatch(/Xs[1-9A-HJ-NP-Za-km-z]{30,}|revenue|net_income|verified/);
  });
});

describe("searchCandidates", () => {
  it("returns only slug and ticker, from the index", () => {
    const [first] = searchCandidates("nvda");
    expect(first).toEqual({ slug: "nvidia", ticker: "NVDA" });
    for (const candidate of searchCandidates("a", { limit: SEARCH_MAX_LIMIT })) {
      expect(Object.keys(candidate).sort()).toEqual(["slug", "ticker"]);
    }
  });

  it("finds by company name, ticker and token symbol, closest first", () => {
    expect(searchCandidates("NVIDIA")[0]).toEqual({ slug: "nvidia", ticker: "NVDA" });
    expect(searchCandidates("NVDAx")[0]).toEqual({ slug: "nvidia", ticker: "NVDA" });
    expect(searchCandidates("openai")[0]).toEqual({ slug: "openai", ticker: null });
    expect(searchCandidates("figureai")[0]).toEqual({ slug: "figure-ai", ticker: null });
    expect(searchCandidates("coca cola")[0]).toEqual({ slug: "coca-cola", ticker: "KO" });
    expect(searchCandidates("cocacola")[0]).toEqual({ slug: "coca-cola", ticker: "KO" });
    expect(searchCandidates("disney")[0]).toEqual({ slug: "walt-disney", ticker: "DIS" });
    expect(searchCandidates("BRK.B")[0]).toEqual({ slug: "berkshire-hathaway", ticker: "BRK.B" });
    expect(searchCandidates("spy")[0]).toEqual({ slug: null, ticker: "SPY" });
    // An exact ticker outranks a name that merely starts with it.
    expect(searchCandidates("ma")[0]).toEqual({ slug: "mastercard", ticker: "MA" });
  });

  it("folds case, full-width forms and whitespace", () => {
    const expected = searchCandidates("NVDA");
    for (const query of ["nvda", "  NvDa  ", FULLWIDTH_NVDA, "　nvda　"]) expect(searchCandidates(query)).toEqual(expected);
    expect(normalizeSearchText(" Coca‐Cola  CO ")).toBe("coca cola co");
    expect(normalizeSearchText("ＡＢＣ")).toBe("abc");
  });

  it("never suggests a withheld row or a removed provider", () => {
    for (const query of ["SPCX", "spcxx", "VCX", "Fundrise", "tessera", "tOpenAI"]) expect(searchCandidates(query)).toEqual([]);
    // SpaceX is a private company here only through its PreStocks instrument.
    expect(searchCandidates("spacex")).toEqual([{ slug: "spacex", ticker: null }]);
  });

  it("returns nothing for empty, non-string or unrelated input, and bounds the result", () => {
    for (const input of ["", "   ", "---", undefined, null, 42, {}, "zzzzqqqq"]) expect(searchCandidates(input)).toEqual([]);
    expect(searchCandidates("a")).toHaveLength(8);
    expect(searchCandidates("a", { limit: SEARCH_MAX_LIMIT })).toHaveLength(SEARCH_MAX_LIMIT);
    for (const limit of [0, 21, 1.5, Number.NaN]) expect(() => searchCandidates("a", { limit })).toThrow(TypeError);
    expect(searchCandidates("n".repeat(10_000))).toEqual([]);
  });
});

describe("search never bypasses the allowlist", () => {
  it("opens every candidate through the exact lookups, and each lookup returns that same record", () => {
    for (const entry of indexJson.entries) {
      const opened = open(entry);
      expect(opened, JSON.stringify(entry)).toBeDefined();
      if (entry.slug !== null) expect(findCompany(entry.slug)!.slug).toBe(entry.slug);
      if (entry.ticker !== null) expect(resolveTicker(entry.ticker)!.ticker).toBe(entry.ticker);
    }
  });

  it("suggests from loose input but loose input itself still opens nothing", () => {
    for (const query of [FULLWIDTH_NVDA, "nvidia", "nvid", "NVDAx", "NVIDIA CORP"]) {
      const [candidate] = searchCandidates(query);
      expect(candidate).toEqual({ slug: "nvidia", ticker: "NVDA" });
      expect(open(candidate!)).toBeDefined();
    }
    // Display names and the recorded SEC registrant names both suggest the company.
    expect(searchCandidates("Advanced Micro Devices")[0]).toEqual({ slug: "advanced-micro-devices", ticker: "AMD" });
    expect(searchCandidates("tsmc")[0]).toEqual({ slug: "taiwan-semiconductor-manufacturing", ticker: "TSM" });
    expect(searchCandidates("bank of america")[0]).toEqual({ slug: "bank-of-america", ticker: "BAC" });
    for (const query of [FULLWIDTH_NVDA, "nvid", "NVDAx", "NVIDIA", " nvidia"]) {
      expect(resolveTicker(query)).toBeNull();
      expect(findCompany(query)).toBeUndefined();
    }
  });

  it("never echoes the query: hostile input yields index values or nothing", () => {
    const allowed = new Set(indexJson.entries.map((entry) => JSON.stringify({ slug: entry.slug, ticker: entry.ticker })));
    for (const query of ["NVDA' OR '1'='1", "NVDA,eq.x", "../company/openai", "<script>", "%", ".*", "open ai", "__proto__", "constructor"]) {
      for (const candidate of searchCandidates(query, { limit: SEARCH_MAX_LIMIT })) {
        expect(allowed.has(JSON.stringify(candidate))).toBe(true);
        expect(candidate.slug === query || candidate.ticker === query).toBe(false);
      }
    }
    expect(searchCandidates("__proto__")).toEqual([]);
    expect(Object.isFrozen(searchCandidates("nvda")[0])).toBe(true);
  });
});
