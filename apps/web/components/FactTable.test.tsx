import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getFundamentalsSnapshot } from "@benten/registry";

import { FactTable } from "@/components/FactTable";
import { formatNumber, formatValue } from "@/lib/format";
import { FUNDAMENTALS_FIELDS, FUNDAMENTALS_GROUPS, FUNDAMENTALS_VALUE_KINDS, fundamentalsFacts } from "@/lib/fundamentals-fields";
import { LOCALES } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

function rowValue(html: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<td class="cell--key">${escaped}</td><td class="cell--numeric"><span>([^<]*)</span>`).exec(html)?.[1];
}

describe("numeric value kinds", () => {
  it("groups quantities and never groups identifiers", () => {
    expect(formatNumber(2026)).toBe("2,026");
    expect(formatNumber(2026, "identifier")).toBe("2026");
    expect(formatValue(130497000000, "quantity")).toBe("130,497,000,000");
    expect(formatValue(2026, "identifier")).toBe("2026");
    expect(formatValue(null, "identifier")).toBe("—");
  });

  it("classifies every fundamentals field, with the fiscal year as an identifier", () => {
    expect(Object.keys(FUNDAMENTALS_VALUE_KINDS).sort()).toEqual([...FUNDAMENTALS_FIELDS].sort());
    expect(FUNDAMENTALS_VALUE_KINDS.metrics_fiscal_year).toBe("identifier");
    expect(FUNDAMENTALS_VALUE_KINDS.revenue).toBe("quantity");
  });
});

describe("legacy snapshot fact table", () => {
  const record = getFundamentalsSnapshot("NVDA");
  const fiscalYear = record?.data.metrics_fiscal_year;
  const revenue = record?.data.revenue;

  it("has an NVDA snapshot with a four-digit fiscal year and a large revenue", () => {
    expect(typeof fiscalYear).toBe("number");
    expect(String(fiscalYear)).toMatch(/^\d{4}$/);
    expect(typeof revenue).toBe("number");
    expect(Math.abs(revenue as number)).toBeGreaterThanOrEqual(1000);
  });

  for (const locale of LOCALES) {
    it(`shows the fiscal year without grouping and keeps amount grouping in ${locale}`, () => {
      const labels = messagesFor(locale).legacy.fields;
      const html = FUNDAMENTALS_GROUPS.map((group) =>
        renderToStaticMarkup(createElement(FactTable, { facts: fundamentalsFacts(record!.data, group.fields, labels) })),
      ).join("");
      expect(rowValue(html, labels.metrics_fiscal_year)).toBe(String(fiscalYear));
      expect(rowValue(html, labels.revenue)).toBe(formatNumber(revenue as number));
      expect(rowValue(html, labels.revenue)).toContain(",");
    });
  }
});
