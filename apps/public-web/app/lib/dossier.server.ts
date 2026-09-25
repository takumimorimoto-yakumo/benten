/**
 * Build-only projection from the public registry read model to the Dossier
 * view. Runs in route loaders during prerendering; never reaches the client
 * graph. Every value is copied from an allowlisted registry record; nothing is
 * derived, estimated, or ranked.
 */
import {
  companyForXStock,
  getAnnualHistory,
  FUNDAMENTALS_FIELDS,
  listedCompanyMap,
  getAssetIdentity,
  getCoverageState,
  getLegacyFundamentals,
  getVerifiedFundamentals,
  resolveTicker,
  type AnnualFactPoint,
  type AnnualYearRead,
  type FundamentalsField,
  type VerifiedFactSet,
} from "@benten/registry";
import { isPurchasableMint } from "@benten/purchase/route";
import {
  VERIFIED_FACT_ORDER,
  type AnnualFilingView,
  type AnnualPointView,
  type AnnualYearView,
  type DossierView,
  type FilingSourceView,
  type FiscalYearLabelView,
  type VerifiedFactRow,
} from "../features/dossier/dossier-view";

function annualFilingView(filing: { form: string; accession: string; filed: string; filing_url: string }): AnnualFilingView {
  return { form: filing.form, accessionNumber: filing.accession, filedAt: filing.filed, filingUrl: filing.filing_url };
}

/** One annual point as the pages show it; every field is copied from the read model. */
export function annualPointView(point: AnnualFactPoint): AnnualPointView {
  return {
    name: point.metric,
    value: point.value,
    currency: point.unit,
    status: point.status,
    provenance: point.provenance,
    concept: point.source_concept,
    reason: point.reason,
    filing: annualFilingView(point),
    restatement: point.restatement
      ? {
          originalValue: point.restatement.original_value,
          originalConcept: point.restatement.original_source_concept,
          // The read model names the original report by accession, date and URL; its form is not copied.
          originalFiling: { accessionNumber: point.restatement.original_accession, filedAt: point.restatement.original_filed, filingUrl: point.restatement.original_filing_url },
        }
      : null,
  };
}

function annualYearView(year: AnnualYearRead): AnnualYearView {
  const report = year.annual_report;
  return {
    label: { fiscalYear: year.fiscal_year, periodEnd: year.period_end },
    periodStart: year.period_start,
    annualReport: report ? { form: report.form, accessionNumber: report.accession_number, filedAt: report.filed_at, filingUrl: report.filing_url } : null,
    cells: VERIFIED_FACT_ORDER.map((name) => {
      const point = year.points[name];
      return { name, point: point ? annualPointView(point) : null, excluded: year.excluded[name] ?? null };
    }),
  };
}

function annualView(years: readonly AnnualYearRead[]): DossierView["annual"] {
  if (years.length === 0) return null;
  return { years: [...years].reverse().map(annualYearView) };
}

/**
 * The label of a newest-year fact: the annual history year that ends on the
 * same day, so the product, company and evidence pages name a year alike.
 * The newest-year facts all reappear in the annual history; without one the
 * fact's own fiscal year is kept.
 */
function labelFor(years: readonly AnnualYearRead[], fiscalYear: number, periodEnd: string): FiscalYearLabelView {
  const year = years.find((candidate) => candidate.period_end === periodEnd);
  return { fiscalYear: year?.fiscal_year ?? fiscalYear, periodEnd };
}

function sourceView(set: VerifiedFactSet, sourceRef: string): FilingSourceView {
  const source = set.source_refs[sourceRef];
  if (!source) throw new Error("verified fact cites an unknown filing source");
  return {
    sourceRef: source.source_ref,
    form: source.form,
    accessionNumber: source.accession_number,
    filedAt: source.filed_at,
    filingUrl: source.filing_url,
    authority: source.source_authority,
  };
}

function verifiedView(set: VerifiedFactSet | null, years: readonly AnnualYearRead[]): DossierView["verified"] {
  if (!set) return null;
  const rows: VerifiedFactRow[] = [];
  for (const name of VERIFIED_FACT_ORDER) {
    const fact = set.facts[name];
    if (!fact) continue;
    const period = set.periods[fact.period_ref];
    if (!period) throw new Error("verified fact cites an unknown period");
    rows.push({
      name,
      value: fact.value,
      currency: fact.currency,
      unit: fact.unit,
      scale: fact.scale,
      concept: fact.source_concept,
      period: {
        fiscalYear: period.fiscal_year,
        type: period.fact_period_type,
        start: period.period_start,
        end: period.period_end,
      },
      label: labelFor(years, period.fiscal_year, period.period_end),
      source: sourceView(set, fact.source_ref),
    });
  }
  if (rows.length === 0) return null;
  const sources = [...new Map(rows.map((row) => [row.source.sourceRef, row.source])).values()];
  return { rows, sources };
}

/** Resolve one prerendered ticker through the allowlist; unknown input throws. */
export function createDossierView(ticker: string): DossierView {
  const entry = resolveTicker(ticker);
  if (!entry || entry.ticker !== ticker) throw new Error("dossier view requires an allowlisted canonical ticker");
  const identity = getAssetIdentity(entry);
  const coverage = getCoverageState(entry);
  const legacy = getLegacyFundamentals(entry.ticker);
  const listed = listedCompanyMap.companies.find((company) => company.instruments[0].ticker === entry.ticker);
  const years = getAnnualHistory(entry.ticker);

  return {
    identity: {
      ticker: identity.ticker,
      symbol: identity.symbol,
      tokenName: identity.token_name,
      underlyingCompany: identity.underlying_company,
      companyDisplayName: companyForXStock(entry.ticker)?.display_name ?? null,
      secRegistrant: listed ? { name: listed.evidence.sec_registrant_name, cik: listed.evidence.sec_cik } : null,
      mint: identity.mint,
      issuer: identity.issuer,
      issuerVerified: identity.issuer_verified,
      decimals: entry.decimals,
      registryAsOf: identity.registry_as_of,
      registrySourceUrl: identity.registry_source_url,
    },
    coverage: {
      filingEligible: coverage.filing_eligibility === "eligible",
      sourceStatus: coverage.source_status,
      exclusion: coverage.filing_eligibility === "eligible" ? null : coverage.exclusion_reason ?? "unspecified",
    },
    verified: verifiedView(getVerifiedFundamentals(entry.ticker), years),
    annual: annualView(years),
    legacy: legacy
      ? {
          asOf: legacy.legacy_as_of,
          values: Object.fromEntries(FUNDAMENTALS_FIELDS.map((field) => [field, legacy.values[field] ?? null])) as Record<FundamentalsField, string | number | null>,
        }
      : null,
    // Exact mint equality against the pinned route constant; never a ticker or name match.
    purchase: isPurchasableMint(identity.mint) ? "fixed_route" : "unsupported",
  };
}
