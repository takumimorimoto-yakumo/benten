import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FINANCIAL_STATEMENT_FIELDS,
  STATEMENT_NAMES,
} from "@benten/registry";
import { DISCLAIMER } from "../lib/envelope.js";
import { getFinancials } from "./get-financials.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getFinancials — static public snapshot boundary", () => {
  it.each(["FAKE", "NVDA' OR '1'='1", "*", ""])(
    "rejects unlisted ticker without network access: %s",
    async (ticker) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const result = await getFinancials({ ticker });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.data).toMatchObject({ found: false, reason: "unknown_ticker" });
    },
  );

  it("rejects a registered but ineligible ticker without network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFinancials({ ticker: "BDWAP" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ found: false, reason: "not_covered" });
  });

  it("reports no_data for an eligible SEC filer without valid statement rows", async () => {
    const result = await getFinancials({ ticker: "ASML" });

    expect(result.data).toMatchObject({
      found: false,
      ticker: "ASML",
      reason: "no_data",
      exclusion_reason: null,
    });
  });

  it("rejects an invalid statement without network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFinancials({ ticker: "NVDA", statement: "../../admin" as "pl" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ found: false, reason: "invalid_statement" });
  });

  it("returns a single requested statement with only allowlisted fields", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFinancials({ ticker: "NVDA", statement: "pl" });

    expect(result.data.found).toBe(true);
    if (result.data.found) {
      expect(Object.keys(result.data.statements)).toEqual(["pl"]);
      expect(Object.keys(result.data.statements.pl ?? {}).sort()).toEqual(
        [...FINANCIAL_STATEMENT_FIELDS.pl].sort(),
      );
      expect(result.data.statements.pl).not.toHaveProperty("source_doc_id");
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.source).toBe("Benten legacy financial snapshot; filing source, unit, and fact kind unverified");
    expect(result.disclaimer).toBe(DISCLAIMER);
  });

  it("returns the three fixed statement names without network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFinancials({ ticker: "NVDA" });

    expect(result.data.found).toBe(true);
    if (result.data.found) {
      expect(Object.keys(result.data.statements)).toEqual(STATEMENT_NAMES);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
