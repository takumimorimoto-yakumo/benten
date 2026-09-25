import { describe, expect, it } from "vitest";
import { FUNDAMENTALS_FIELDS, getAnnualHistory, getVerifiedFundamentals, listPublicAssets } from "../../../packages/registry/src/index.ts";
import { NVDAX_MINT } from "../../../packages/purchase/src/route.ts";
import { createDossierView } from "../app/lib/dossier.server.ts";
import { LEGACY_GROUPS, VERIFIED_FACT_ORDER } from "../app/features/dossier/dossier-view.ts";

function tickers(): string[] {
  const catalog = listPublicAssets({});
  if (!catalog.found) throw new Error("catalog unavailable");
  return catalog.items.map(({ identity }) => identity.ticker);
}

describe("Dossier view projection", () => {
  it("builds a view for every eligible registry ticker and rejects anything else", () => {
    const all = tickers();
    expect(all).toHaveLength(152);
    for (const ticker of all) expect(createDossierView(ticker).identity.ticker).toBe(ticker);
    for (const input of ["nvda", "UNKNOWN", " NVDA", ""]) expect(() => createDossierView(input)).toThrow();
    // Withheld under the PreStocks track rule on non-PreStocks pre-IPO tokens: no Dossier at all.
    for (const withheld of ["SPCX", "VCX"]) {
      expect(all).not.toContain(withheld);
      expect(() => createDossierView(withheld)).toThrow();
    }
  });

  it("marks only the exact fixed-route mint as purchasable", () => {
    const fixed = tickers().filter((ticker) => createDossierView(ticker).purchase === "fixed_route");
    expect(fixed).toEqual(["NVDA"]);
    expect(createDossierView("NVDA").identity.mint).toBe(NVDAX_MINT.toBase58());
  });

  it("copies every verified fact with its exact period, unit, and filing", () => {
    const view = createDossierView("NVDA");
    const source = getVerifiedFundamentals("NVDA")!;
    expect(view.verified?.rows.map((row) => row.name)).toEqual(VERIFIED_FACT_ORDER.filter((name) => source.facts[name]));
    for (const row of view.verified!.rows) {
      const fact = source.facts[row.name]!;
      const period = source.periods[fact.period_ref]!;
      const filing = source.source_refs[fact.source_ref]!;
      expect(row).toEqual({
        name: row.name,
        value: fact.value,
        currency: fact.currency,
        unit: fact.unit,
        scale: fact.scale,
        concept: fact.source_concept,
        period: { fiscalYear: period.fiscal_year, type: period.fact_period_type, start: period.period_start, end: period.period_end },
        label: { fiscalYear: 2026, periodEnd: "2026-01-25" },
        source: {
          sourceRef: filing.source_ref, form: filing.form, accessionNumber: filing.accession_number,
          filedAt: filing.filed_at, filingUrl: filing.filing_url, authority: filing.source_authority,
        },
      });
    }
    expect(view.verified!.sources).toHaveLength(1);
  });

  it("labels a newest-year fact with the annual history's year for the same period end", () => {
    // The newest-year overlay calls Home Depot's year ending 2026-02-01 fiscal 2025; the annual history calls it 2026.
    const hd = createDossierView("HD");
    expect(hd.verified!.rows.map((row) => [row.period.fiscalYear, row.label])).toEqual(
      hd.verified!.rows.map(() => [2025, { fiscalYear: 2026, periodEnd: "2026-02-01" }]),
    );
    expect(hd.annual!.years[0]!.label).toEqual({ fiscalYear: 2026, periodEnd: "2026-02-01" });
  });

  it("copies the annual history newest year first, with every point, filing, restatement and exclusion", () => {
    let unverified = 0;
    let restated = 0;
    for (const ticker of tickers()) {
      const years = getAnnualHistory(ticker);
      const view = createDossierView(ticker);
      if (years.length === 0) {
        expect(view.annual, ticker).toBeNull();
        continue;
      }
      expect(view.annual!.years.map((year) => year.label)).toEqual([...years].reverse().map((year) => ({ fiscalYear: year.fiscal_year, periodEnd: year.period_end })));
      for (const [index, year] of [...years].reverse().entries()) {
        const shown = view.annual!.years[index]!;
        expect(shown.periodStart).toBe(year.period_start);
        expect(shown.annualReport?.accessionNumber ?? null).toBe(year.annual_report?.accession_number ?? null);
        expect(shown.cells.map((cell) => cell.name)).toEqual([...VERIFIED_FACT_ORDER]);
        for (const cell of shown.cells) {
          const point = year.points[cell.name];
          expect(cell.excluded).toBe(year.excluded[cell.name] ?? null);
          if (!point) {
            expect(cell.point).toBeNull();
            continue;
          }
          expect(cell.point).toEqual({
            name: point.metric, value: point.value, currency: point.unit, status: point.status, provenance: point.provenance,
            concept: point.source_concept, reason: point.reason,
            filing: { form: point.form, accessionNumber: point.accession, filedAt: point.filed, filingUrl: point.filing_url },
            restatement: point.restatement
              ? { originalValue: point.restatement.original_value, originalConcept: point.restatement.original_source_concept, originalFiling: { accessionNumber: point.restatement.original_accession, filedAt: point.restatement.original_filed, filingUrl: point.restatement.original_filing_url } }
              : null,
          });
          if (point.status === "unverified_or_derived") unverified += 1;
          if (point.restatement) restated += 1;
        }
      }
    }
    // Both kinds occur in the bundled history, so the page shows both marks.
    expect(unverified).toBeGreaterThan(0);
    expect(restated).toBeGreaterThan(0);
  });

  it("gives a legacy-only ticker its annual history", () => {
    const gs = createDossierView("GS");
    expect(gs.verified).toBeNull();
    expect(gs.legacy).not.toBeNull();
    expect(gs.annual!.years[0]!.label).toEqual({ fiscalYear: 2025, periodEnd: "2025-12-31" });
  });

  it("keeps legacy values labelled separately and represents each coverage state", () => {
    expect(createDossierView("NVDA").legacy?.values.metrics_fiscal_year).toBe(2026);
    const asml = createDossierView("ASML");
    expect([asml.coverage.filingEligible, asml.verified, asml.legacy]).toEqual([true, null, null]);
    const etf = tickers().map(createDossierView).find((view) => view.coverage.exclusion === "etf");
    expect(etf?.coverage.filingEligible).toBe(false);
    expect(etf?.verified).toBeNull();
  });

  it("places every public legacy field in exactly one display group", () => {
    const grouped = LEGACY_GROUPS.flatMap((group) => [...group.fields]);
    expect([...grouped].sort()).toEqual([...FUNDAMENTALS_FIELDS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });
});

describe("legacy snapshot fiscal year", () => {
  it("quotes the source's own label and states that no period end is recorded, in every locale", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { LegacySnapshotSection } = await import("../app/features/dossier/legacy-snapshot-section.tsx");
    const { SOURCE_FISCAL_YEAR_MESSAGES } = await import("../app/i18n/messages.ts");
    const { PUBLIC_WEB_LOCALES } = await import("../app/i18n/locales.ts");
    const view = createDossierView("HD");
    expect(view.legacy?.asOf).toBe("FY2026");
    for (const locale of PUBLIC_WEB_LOCALES) {
      const html = renderToStaticMarkup(createElement(LegacySnapshotSection, { view, locale }));
      expect(html, locale).toContain(SOURCE_FISCAL_YEAR_MESSAGES[locale].asOf("FY2026"));
      expect(html, locale).toContain(SOURCE_FISCAL_YEAR_MESSAGES[locale].value("2026"));
      expect(html, locale).not.toMatch(/>2026</);
    }
  });
});
