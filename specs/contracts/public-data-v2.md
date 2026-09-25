# Benten Public Data Contract v2

Status: proposed implementation contract, plan-only

Compatibility target: existing v1 ticker calls and readable MCP text continue to work during migration

Authority: [Benten Product and Delivery Plan](../product-plan.md)

## 1. Contract goals

This contract lets an agent answer four separate questions without guessing:

1. Which token was identified?
2. Which underlying company does the registry map it to?
3. Is the company structurally eligible, present in the current snapshot, and source-verified?
4. What filing, period, and unit support each returned financial fact?

It also defines exact wallet amount fields so a Token-2022 display multiplier cannot be silently omitted or applied twice.

The contract does not authorize advice, derived valuation, transaction construction, signing, sending, private runtime data access, or an assertion that an unknown mint is fraudulent.

## 2. Versioning and strictness

- `schema_version` is the string `"2.0"` in every v2 structured result and snapshot manifest.
- Additive optional fields may be introduced in a minor revision. Removing a field, changing its type or meaning, or changing an error reason requires a new major version.
- Snapshot objects are fail-closed: unknown properties are rejected at publication and startup.
- MCP input objects reject unknown properties and reject requests containing both or neither identifier fields where one identifier is required.
- MCP responses provide both `structuredContent` conforming to the advertised `outputSchema` and readable `content`. During the submission migration, existing ticker inputs and v1 JSON text keys retain the behavior specified in Section 6. The mint-core wallet profile is the one explicit safety exception: a valid wallet request returns a structured unavailable result and makes no RPC call.
- REST v1 aliases, if implemented, return the same semantic presenter output. They do not define a second data model.
- Transport compatibility exception for malformed selectors: Web rejects an invalid query before its v2 presenter and returns `requested_identifier: null`; MCP preserves its pre-v2 legacy text echo and therefore also echoes the supplied selector in the v2 structured `invalid_input` result. This difference is limited to the invalid-input presentation; successful and known/unknown asset data semantics use the shared registry read model. Changing the MCP echo requires an explicit versioned migration. Do not pass either echoed value to a registry, RPC, or trade path without exact allowlist resolution.

## 3. Identifier contract

### C-ID-01 Exact identifier input

Financial lookup input is:

```ts
type AssetIdentifierInput =
  | { ticker: string; mint?: never }
  | { mint: string; ticker?: never };
```

- Ticker normalization trims outer whitespace and converts ASCII letters to uppercase, then performs exact registry equality.
- Mint normalization trims outer whitespace and preserves case, then performs exact registry equality.
- Partial matches, prefix matches, regexes, fuzzy matches, and arbitrary query expressions are forbidden.
- Providing both or neither returns `invalid_input` without a network call.

`list_xstocks` may accept the same exact optional selector in addition to its existing filters. A selector returns zero or one item. The unfiltered call remains available for compatibility; pagination is optional after the submission because 154 current records are bounded.

### C-ID-02 Identity result

```ts
interface AssetIdentity {
  symbol: string;
  ticker: string;
  token_name: string;
  underlying_company: string | null;
  underlying_company_source_ref: string | null;
  mint: string;
  issuer: string;
  issuer_verified: boolean;
  token_program: "spl-token" | "token-2022" | "unknown";
  registry_as_of: string;       // ISO 8601 date
  registry_source_url: string;  // HTTPS public source
}
```

`underlying_company` comes from a source-verified public filing identity when available and carries that filing's source reference. Without verified identity evidence, both company fields are null; the legacy `company_name` remains only inside its legacy block. Token name and underlying company are distinct fields and must never be substituted for one another. `issuer_verified` describes verification against the registry source; it is not a general security rating. `unknown` token program is allowed in the artifact but blocks wallet-demo use for that mint.

## 4. Coverage contract

### C-COV-01 Orthogonal coverage states

```ts
interface CoverageState {
  filing_eligibility: "eligible" | "not_eligible";
  snapshot_status: "available" | "no_data";
  source_status: "source_verified" | "legacy_snapshot" | "not_applicable";
  capabilities: {
    fundamentals: "available" | "no_data";
    pl: "available" | "no_data";
    bs: "available" | "no_data";
    cf: "available" | "no_data";
  };
  exclusion_reason: "etf" | "non_sec_listing" | "private" | "preferred" | null;
}
```

Rules:

- `eligible + available + source_verified` is the preferred flagship state.
- `eligible + available + legacy_snapshot` remains usable as a clearly labeled legacy snapshot row but must not expose fabricated filing metadata.
- `eligible + no_data + not_applicable` is valid, including the current ASML case.
- `not_eligible + no_data + not_applicable` requires one allowed `exclusion_reason`.
- Overall `snapshot_status` is `available` when the bundled fundamentals capability is available. Consumers use the capability map, not the overall field, when they require PL, BS, or CF.
- Each capability reports availability independently. A fundamentals row must not imply that PL, BS, and CF all exist; the current baseline has one missing BS and one missing CF record.
- `source_status` is `source_verified` when the verified overlay contains at least one accepted fact for the selected record, `legacy_snapshot` when only the v1 row exists, and `not_applicable` when no financial row exists. The returned verified and legacy blocks remain separate even when both exist.
- `fundamentals_available` remains a deprecated compatibility field during v2 migration and means structural eligibility only. New UI labels must not render it as proof that a current row exists.

## 5. Financial fact and artifact contract

### C-FIN-01 Verified reported facts

The deadline source-verified set contains directly reported facts only. Free cash flow and every other calculated metric are excluded from this set.

```ts
type VerifiedFactName =
  | "revenue"
  | "net_income_parent"
  | "total_assets"
  | "total_liabilities"
  | "operating_cf";

interface VerifiedReportedFact {
  kind: "verified_reported";
  value: number;
  currency: string;             // ISO 4217
  unit: "currency";
  scale: number;                // submission target is 1
  period_ref: string;
  source_ref: string;
  source_concept: string;       // public filing taxonomy concept
}

interface VerifiedPeriod {
  period_ref: string;
  fiscal_year: number;
  fiscal_month: number;
  period_kind: "FY";
  fact_period_type: "duration" | "instant";
  period_start: string | null;  // required for duration; null for instant
  period_end: string;           // ISO 8601 date
}

interface FilingSource {
  source_ref: string;
  form: string;
  accession_number: string;
  filed_at: string;             // ISO 8601 date
  filing_url: string;           // canonical public HTTPS filing URL
  source_authority: "SEC EDGAR";
}

interface VerifiedFactSet {
  kind: "source_verified";
  periods: Record<string, VerifiedPeriod>;
  source_refs: Record<string, FilingSource>;
  facts: Partial<Record<VerifiedFactName, VerifiedReportedFact>>;
}
```

Every verified fact has exactly one period and one source reference. Duration facts such as revenue, income, and operating cash flow require start and end dates. Balance-sheet facts use an instant period with a null start date. Different facts may point to different filings or contexts. URL reachability alone never verifies a value.

All verified values are finite safe integers. `scale` explains normalization and is `1` unless the public data dictionary and source ledger prove another value. Publication fails instead of rounding an unsafe value. Null is not permitted inside a verified fact; an unavailable fact is omitted. Zero is a valid reported value.

The five names above are the maximum deadline set, not a promise that all five exist for every flagship. A fact is included only after value, concept, period, currency, scale, and filing context agree with the source-comparison ledger.

### C-FIN-02 Legacy snapshot facts

The current snapshot does not contain evidence for exact period dates, units, filing sources, or reported-versus-calculated status. V2 therefore carries legacy values in a separate discriminated block and never upgrades them by inference.

```ts
type LegacyScalar = string | number | null;

interface LegacySnapshotBlock<K extends string> {
  kind: "legacy_snapshot";
  legacy_as_of: string;           // exact existing fiscal label
  observed_period: {
    fiscal_year: number | null;
    fiscal_month: number | null;
    period_kind: "FY" | null;
    period_start: null;
    period_end: null;
  };
  currency: null;
  unit: null;
  fact_kind: "unknown";
  source_refs: [];
  values: Record<K, LegacyScalar>;
}
```

The exact legacy field sets are:

```ts
type LegacyFundamentalsField =
  | "company_name" | "metrics_fiscal_year" | "revenue" | "op_income"
  | "gross_profit" | "net_income_parent" | "total_assets" | "total_equity"
  | "total_liabilities" | "long_term_debt" | "operating_cf"
  | "investing_cf" | "fcf";

type LegacyPlField =
  | "ticker" | "region" | "fiscal_year" | "fiscal_month" | "period_kind"
  | "revenue" | "op_income" | "ordinary_income" | "pretax_income"
  | "net_income" | "net_income_attributable_to_owners_of_parent"
  | "gross_profit" | "cost_of_sales" | "sga" | "income_taxes"
  | "non_controlling_interests_income" | "interest_income" | "interest_expenses";

type LegacyBsField =
  | "ticker" | "region" | "fiscal_year" | "fiscal_month" | "period_kind"
  | "total_assets" | "total_equity" | "total_liabilities"
  | "equity_attributable_to_owners_of_parent" | "current_assets"
  | "non_current_assets" | "current_liabilities" | "non_current_liabilities"
  | "short_term_debt" | "long_term_debt" | "capital_stock"
  | "retained_earnings" | "cash_and_deposits" | "inventories";

type LegacyCfField =
  | "ticker" | "region" | "fiscal_year" | "fiscal_month" | "period_kind"
  | "operating_cf" | "investing_cf" | "financing_cf" | "cash_eop"
  | "capex" | "depreciation_and_amortization" | "cash_dividends_paid"
  | "interest_paid";
```

This is a complete legal translation of the existing ABNB fundamentals row. No date, unit, currency, source, or fact kind has been inferred:

```json
{
  "kind": "legacy_snapshot",
  "legacy_as_of": "FY2025",
  "observed_period": {
    "fiscal_year": 2025,
    "fiscal_month": null,
    "period_kind": null,
    "period_start": null,
    "period_end": null
  },
  "currency": null,
  "unit": null,
  "fact_kind": "unknown",
  "source_refs": [],
  "values": {
    "company_name": "Airbnb, Inc.",
    "metrics_fiscal_year": 2025,
    "revenue": 12241000000,
    "op_income": 2544000000,
    "gross_profit": null,
    "net_income_parent": 2511000000,
    "total_assets": 22208000000,
    "total_equity": 8199000000,
    "total_liabilities": 14009000000,
    "long_term_debt": 0,
    "operating_cf": 4646000000,
    "investing_cf": -748000000,
    "fcf": 3898000000
  }
}
```

The legacy `fcf` key is retained only inside this compatibility block with `fact_kind: "unknown"`, null unit/currency, and no source reference. It is not a verified reported fact or a newly defined calculation. A future metric requires a separate name, explicit formula and reconciliation, and a new reviewed contract. This follows the SEC's warning that free-cash-flow measures do not have a uniform meaning.

### C-FIN-03 Annual history (revision 2.1, additive)

Revision 2.1 adds a multi-year annual set for the five C-FIN-01 metrics, FY2016 through the newest filed year. It is a backward-compatible extension of v2, not a v3:

- `verified-facts-v2.json` is unchanged and remains the newest-year verified set. Every one of its facts must reappear in the annual set with the same value, concept, accession, filing URL, period end, and duration start, or runtime startup and publication fail.
- Default Web and MCP results are byte-identical to revision 2.0. The annual set is returned only when a caller supplies a fiscal-year bound.
- The annual set is a separate artifact because it carries a status that the verified-only v2 set cannot express, and because one compact record per year avoids repeating each fact in fundamentals and statement copies ten times.

Physical root (`packages/registry/src/verified-facts-annual-v1.json`):

```ts
interface VerifiedAnnualHistoryV1 {
  schema_version: "1.0";
  first_fiscal_year: number;                       // 2016
  records: Record<string, {                        // exact eligible tickers
    sources: Record<string, AnnualFilingSource>;   // every cited filing, each cited at least once
    years: AnnualYearRecord[];                     // ascending fiscal_year and period_end
  }>;
}

interface AnnualFilingSource {
  source_ref: string;
  form: "10-K" | "20-F" | "40-F";
  accession_number: string;
  filed_at: string;                                // on or after the cited period end
  filing_url: string;                              // canonical www.sec.gov Archives URL of the accession
  source_authority: "SEC EDGAR";
}

interface AnnualYearRecord {
  fiscal_year: number;          // calendar year of (period_end - 15 days)
  fiscal_month: number;         // month of period_end
  period_start: string | null;  // shared start of the verified duration facts; 350-380 days
  period_end: string;
  annual_report_ref: string | null;  // the fiscal year's own annual report, when it exists
  facts: Partial<Record<VerifiedFactName,
    | { status: "verified_reported"; value: number; currency: "USD"; source_concept: string; source_ref: string;
        provenance: "annual_report" | "restated_in_later_report" | "reported_in_later_report";
        restatement?: { original_value: number; original_source_concept: string; original_source_ref: string } }
    | { status: "unverified_or_derived"; value: number; currency: "USD"; source_ref: string;
        reason: "derived_by_source" | "reported_under_unlisted_concept" | "value_not_reported_in_filings"
          | "implausible_revenue_concept" | "ambiguous_period" | "period_mismatch" }>>;
  excluded: Partial<Record<VerifiedFactName, "not_in_source" | "unsafe_value" | "no_annual_report_to_cite">>;
}
```

Selection rules:

1. **Value source.** Each candidate value is an annual (FY) row of an offline fundamentals export for the eligible tickers. The exporter runs outside this repository; only its output artifact is committed. No value is computed here.
2. **Period.** The row's period end is the annual-form period end at which SEC `companyfacts` reports the most of the row's values under allowlisted concepts, within 400 days of the row's own label. Annual forms are 10-K, 20-F, and 40-F; amendments and transition reports are not used.
3. **Fiscal-year label.** `fiscal_year` is the calendar year in which the fiscal year ends, with the first 15 days of January counted to the prior year. `companyfacts` `fy` tags disagree across filings for several issuers, so they do not name years here. The label can differ from an issuer's own name for a year that ends in late January or February, and from the v2 newest-year `fiscal_year` for those issuers; `period_end` is always exact.
4. **Annual report.** The fiscal year's annual report is the earliest-filed annual-form filing in the SEC submissions index whose report date equals the period end.
5. **Verification.** A value is `verified_reported` when a USD `companyfacts` fact under an allowlisted concept (priority order from `verified-fact-concepts.json`) has exactly that value, exactly that period end, and, for duration metrics, a 350-380-day duration. The annual report is cited when it reports the value (`annual_report`). Otherwise the latest-filed later annual filing that reports it is cited; when the annual report stated a different value the fact is `restated_in_later_report` and records the original value, concept, and annual report, else `reported_in_later_report`. The export follows the newest filing for restated periods, so a restated comparative is cited from the filing that states it.
6. **Checks.** Net income available to common stockholders is accepted only when the same filing and duration report consolidated net income and consolidated net income minus the reported noncontrolling-interest shares equals the value. Continuing-operations operating cash flow is accepted only when the filing reports no nonzero discontinued-operations operating cash flow for the period. A USD value in a context that the same concept also reports in another currency is a convenience translation or a unit mistag and is not accepted. Duration facts in one year must share one start. Revenue below the same year's net income or operating cash flow becomes `unverified_or_derived` with reason `implausible_revenue_concept` (the newest-year v2 gate, applied per year).
7. **Unverified values.** A value that fails verification is published as `unverified_or_derived` with its reason and cites only the fiscal year's annual report. Without an annual report it is excluded as `no_annual_report_to_cite`.
8. **Excluded rows.** Rows are not published when the filing's presentation currency is not USD, when the export row comes from a registrant whose CIK differs from the registry's (a predecessor registrant), or when no annual period matches.
9. **Newest year.** A newest-year v2 fact missing from the export is added unchanged as `verified_reported` with `annual_report` provenance, so the annual set never regresses behind the v2 set.

`total_liabilities` is never computed from the balance-sheet identity. An exported total that no filing reports as a total-liabilities line is `unverified_or_derived` with reason `derived_by_source`.

The read model exposes `getAnnualHistory(ticker, range)` (one entry per year with its annual report, points, and exclusions), `getAnnualFactSeries(ticker, {metrics, statuses, fiscal_year_from, fiscal_year_to})` (flat ascending points), and `annualHistoryBlock`. A point is:

```ts
interface AnnualFactPoint {
  fiscal_year: number; fiscal_month: number;
  period_start: string | null; period_end: string;
  metric: VerifiedFactName; statement: "pl" | "bs" | "cf";
  value: number; unit: "USD"; scale: 1;
  status: "verified_reported" | "unverified_or_derived";
  source_concept: string | null; provenance: string | null; reason: string | null;
  accession: string; form: "10-K" | "20-F" | "40-F"; filed: string; filing_url: string;
  restatement: { original_value: number; original_source_concept: string;
    original_accession: string; original_filed: string; original_filing_url: string } | null;
}
```

#### Revision 2.2: statement line items (additive)

Revision 2.2 extends the annual set from the five C-FIN-01 metrics to statement tables: 40 reviewed line items across `pl`, `bs`, `cf`, and a `per_share` group, plus eight calculated items. It is backward compatible with revision 2.1:

- `verified-facts-annual-v1.json` and `verified-facts-v2.json` are byte-identical. The five metrics keep their keys, values, and citations and are read from the annual artifact only; the statement artifacts never repeat them.
- Default Web and MCP results are unchanged. `statement_history` is added to a `get_financials` result only when a caller supplies a fiscal-year bound.
- The five fact entries of `verified-fact-concepts.json` are unchanged. The file gains `statement_items` (per item: statement, period type, unit, label, accepted concepts in priority order, deliberately excluded concepts), `statement_core_labels`, `statement_order` (row order of each statement, including the five metrics), and `calculated_items`. The item list and fill rates are in [the data dictionary](../../docs/data-dictionary.md#statement-line-items-fy2016-onward).

Physical roots (`packages/registry/src/verified-statements-annual-v1-<statement>.json`, one file each for `pl`, `bs`, `cf`, `per_share`):

```ts
interface VerifiedStatementHistoryV1 {
  schema_version: "1.0";
  statement: "pl" | "bs" | "cf" | "per_share";   // equals the file's statement
  first_fiscal_year: number;                     // equals the annual artifact's
  records: Record<string, {                      // tickers of the annual artifact only
    sources: Record<string, AnnualFilingSource>; // every cited filing; a ref shared with the annual record is the identical record
    years: StatementYearRecord[];                // ascending period_end; only years with a fact of this statement
  }>;
}

interface StatementYearRecord {
  fiscal_year: number; fiscal_month: number;     // equal to the annual year with the same period_end
  period_start: string | null;                   // equals the annual start when that is set; one start per year across files
  period_end: string;                            // a published annual period end
  annual_report_ref: string | null;              // equal to the annual year's
  facts: Record<string /* item of this statement */,
    | { status: "verified_reported"; value: number; source_concept: string;
        as_of?: string;                          // cover_instant items only
        source_ref?: string; provenance?: "restated_in_later_report" | "reported_in_later_report";
        restatement?: { original_value: number; original_source_concept: string; original_source_ref: string } }
    | { status: "unverified_or_derived"; value: number; reason: UnverifiedReason }>;
  excluded: Record<string, "not_in_source" | "unsafe_value" | "no_annual_report_to_cite">;
}
```

A verified fact without `source_ref` and `provenance` cites the fiscal year's own annual report with `annual_report` provenance; a verified fact cited from a later filing writes both. An unverified fact always cites the year's annual report and therefore writes neither, so a year without an annual report cannot hold one. Omitting these defaults keeps the four files at 1.0-2.3 MB (7.3 MB in total instead of 9.3 MB), and it cannot change a citation because each year has exactly one annual report. An item absent from both `facts` and `excluded` had no source value.

The statements are separate files because each is about the size of the 2.2 MB annual artifact, a re-export shows which statement changed, and a consumer can import one statement. A per-company layout would need a generated index of 124 imports for the same bytes. A plain JavaScript loader (`statement-history-data.js`) imports the files so the type checker does not infer a literal type for several megabytes of JSON; the registry build copies the loader and the files, and runtime startup validates all four against the annual artifact before any read.

Item rules, in addition to rules 1-9 above:

1. **Years.** A statement year is a published annual year. The source row joins it through the period end that the annual export anchored for that row; no statement item defines, moves, or adds a year.
2. **Units.** `USD` values are safe integers (whole dollars). `USD_per_share` values are finite, below 10^7 in magnitude, with at most four decimals. `shares` values are safe integers. Only the matching `companyfacts` unit (`USD`, `USD/shares`, `shares`) is compared.
3. **Period types.** `duration` items span 350-380 days and share the year's start; `instant` items are reported at the period end. `cover_instant` (`shares_outstanding`) is the count on the cover of the fiscal year's own annual report, dated 0-150 days after the period end; `as_of` records that date, and only that annual report can verify it.
4. **Checks.** `us-gaap:NetIncomeLoss` counts as consolidated `net_income` only when the same filing and duration report no nonzero net income attributable to noncontrolling or redeemable noncontrolling interests. `us-gaap:StockholdersEquity` counts as consolidated `total_equity` only when the same filing and date report no nonzero noncontrolling interest. Continuing-operations investing and financing cash flows count only when the filing reports no nonzero discontinued-operations amount for the period.
5. **Derived values.** A value that no filing reports and that equals a source identity (gross profit = revenue - cost of revenue; total equity = total assets - total liabilities, or parent equity + noncontrolling interest; parent equity = total equity - noncontrolling interest; net income = parent + noncontrolling net income; pretax income = net income + income tax) is `unverified_or_derived` with reason `derived_by_source`. No identity is ever used to publish a value.

Calculated items (`calculated_items`) are computed by the read model from two reported cells of the same fiscal year and are never stored:

| Item | Statement | Formula | Unit |
|---|---|---|---|
| `gross_margin` | pl | `gross_profit / revenue` | ratio |
| `operating_margin` | pl | `operating_income / revenue` | ratio |
| `net_margin` | pl | `net_income_parent / revenue` | ratio |
| `return_on_equity` | pl | `net_income_parent / equity_parent` (year-end equity) | ratio |
| `return_on_assets` | pl | `net_income_parent / total_assets` (year-end assets) | ratio |
| `equity_ratio` | bs | `equity_parent / total_assets` | ratio |
| `current_ratio` | bs | `current_assets / current_liabilities` | ratio |
| `free_cash_flow` | cf | `operating_cf - capex` | USD |

A calculated cell exists only when both inputs exist; for a ratio the denominator must be greater than zero. A ratio is a fraction rounded to six decimal places. The cell has `status: "calculated"`, its formula, and both inputs with value, status, accession, and filing URL; `input_status` is `unverified_or_derived` when either input is. `free_cash_flow` is a separately named item with exactly this formula; the legacy `fcf` compatibility key keeps its C-FIN-02 meaning. No calculated item estimates, forecasts, ranks, or values anything.

The read model exposes `getStatementRows(statement)`, `getStatementSeries(ticker, statement, range?)`, and `statementHistoryBlock(ticker, range, statements?)`:

```ts
type StatementDetailName = "pl" | "bs" | "cf" | "per_share";

interface StatementSeries {
  ticker: string; statement: StatementDetailName;
  first_fiscal_year: number; fiscal_year_from: number | null; fiscal_year_to: number | null;
  rows: StatementRowDefinition[];   // presentation order: reported rows, then calculated rows
  years: StatementYearColumn[];     // ascending; only years with at least one cell
}
interface StatementRowDefinition {
  item: string; label: string; statement: StatementDetailName; kind: "reported" | "calculated";
  unit: "USD" | "USD_per_share" | "shares" | "ratio";
  period_type: "duration" | "instant" | "cover_instant" | null;
  formula: string | null; inputs: [string, string] | null;
}
interface StatementYearColumn {
  fiscal_year: number; fiscal_month: number; period_start: string | null; period_end: string;
  annual_report: AnnualFilingSource | null;
  cells: Partial<Record<string, ReportedStatementCell | CalculatedStatementCell>>;
  excluded: Partial<Record<string, "not_in_source" | "unsafe_value" | "no_annual_report_to_cite">>;
}
interface ReportedStatementCell {
  item: string; kind: "reported"; status: "verified_reported" | "unverified_or_derived";
  value: number; unit: "USD" | "USD_per_share" | "shares";
  period_start: string | null; period_end: string; as_of: string | null;
  source_concept: string | null; provenance: AnnualProvenance | null; reason: UnverifiedReason | null;
  filing: { accession: string; form: "10-K" | "20-F" | "40-F"; filed: string; filing_url: string };
  restatement: AnnualRestatementPoint | null;
}
interface CalculatedStatementCell {
  item: string; kind: "calculated"; status: "calculated";
  input_status: "verified_reported" | "unverified_or_derived";
  value: number; unit: "USD" | "ratio"; period_start: string | null; period_end: string;
  formula: string;
  inputs: [CalculatedInputRef, CalculatedInputRef];  // { item, value, status, accession, filing_url }
}
```

`getStatementSeries` returns null for an unknown statement, an invalid range, or a ticker without annual history. The five metrics appear as reported cells of their statements with exactly the values, concepts, provenance, and filings of their C-FIN-03 points.

### C-SRC-01 Physical files and manifest

V1 and v2 coexist during the submission:

```text
packages/registry/src/xstocks.json                 # existing registry bytes
packages/registry/src/financials-snapshot.json    # existing v1 legacy bytes
packages/registry/src/verified-facts-v2.json       # new v2 verified overlay
packages/registry/src/verified-facts-annual-v1.json  # revision 2.1 annual history (C-FIN-03)
packages/registry/src/verified-statements-annual-v1-{pl,bs,cf,per_share}.json  # revision 2.2 statement line items (C-FIN-03)
packages/registry/src/snapshot-manifest.json       # hashes and counts; not hashed
```

The verified overlay has this physical root:

```ts
interface VerifiedOverlayV2 {
  schema_version: "2.0";
  records: Record<string, {
    identity: {
      underlying_company: string;
      source: FilingSource;
    };
    fundamentals: VerifiedFactSet | null;
    statements: {
      pl: VerifiedFactSet | null;
      bs: VerifiedFactSet | null;
      cf: VerifiedFactSet | null;
    };
  }>;
}
```

`records` keys are exact eligible tickers. An empty overlay is structurally valid as `{"schema_version":"2.0","records":{}}`, but it does not satisfy the submission requirement for 3-5 flagships. Overlay records add evidence to the v1 values; they do not replace or rewrite them.

For an overlay record, `AssetIdentity.underlying_company_source_ref` equals `identity.source.source_ref`. The filing identity, registry ticker, and every fact ticker in the legacy statement rows must agree or publication fails.

The manifest shape is:

```ts
interface SnapshotManifestV2 {
  schema_version: "2.0";
  artifact_revision: string;
  published_at: string;
  registry_as_of: string;
  registry_source_url: string;
  financial_source_authority: "SEC EDGAR";
  registry_snapshot_sha256: string;
  legacy_financial_snapshot_sha256: string;
  verified_overlay_sha256: string;
  verified_annual_sha256: string;   // revision 2.1
  verified_statements_sha256: {     // revision 2.2
    pl: string; bs: string; cf: string; per_share: string;
  };
  record_counts: {
    registry: number;
    eligible: number;
    snapshot_available: number;
    source_verified: number;
    annual_years: number;           // revision 2.1: published annual periods
    statement_years: number;        // revision 2.2: published statement years, summed over the four files
  };
}
```

Revision 2.1 adds `verified_annual_sha256` and `record_counts.annual_years`. The release checker accepts a current root published before revision 2.1 as a read-only comparison baseline and requires both fields in every candidate. Revision 2.2 adds `verified_statements_sha256` and `record_counts.statement_years` the same way: a revision 2.1 root is accepted only as a comparison baseline, and every candidate carries the four statement files, their hashes, and the count.

Each digest is SHA-256 over the exact raw bytes of its named file, including whitespace and the final newline. No JSON reserialization or canonicalization occurs. The manifest is not included in any digest, so there is no circular hash. Digests are lowercase 64-character hexadecimal strings.

`artifact_revision` changes whenever any of the three hashed files changes. It is not a freshness claim. `published_at` describes artifact publication, a source's `filed_at` describes the filing, and a verified period's `period_end` describes the fact context. Legacy fiscal labels remain legacy labels.

For a reproducible bootstrap fixture at baseline commit `054d58e`, write the empty overlay as the exact UTF-8 bytes `{"schema_version":"2.0","records":{}}` followed by one LF. Its raw-byte digest is `916784bc65c0177c59766caf83e43e5115c95a09b2874546bb643ce038bba717`. Together with the unchanged baseline files, this structurally valid fixture manifest is:

```json
{
  "schema_version": "2.0",
  "artifact_revision": "054d58e-empty-overlay-fixture",
  "published_at": "2026-09-13T00:00:00Z",
  "registry_as_of": "2026-09-12",
  "registry_source_url": "https://docs.xstocks.fi/developers",
  "financial_source_authority": "SEC EDGAR",
  "registry_snapshot_sha256": "27441e02a030c11ba408c0e8b475b939f5ee2c0acf1f51d2fa43509c5a26a296",
  "legacy_financial_snapshot_sha256": "1128ea10dc4499e327d033b57e0133e07e3a39f270eb2bb7779e625188db4f22",
  "verified_overlay_sha256": "916784bc65c0177c59766caf83e43e5115c95a09b2874546bb643ce038bba717",
  "record_counts": {
    "registry": 154,
    "eligible": 129,
    "snapshot_available": 128,
    "source_verified": 0
  }
}
```

The fixture timestamp identifies the fixture, not a production release, and its zero verified records fail the Stocklana flagship acceptance condition. It exists to make the physical format and digest calculation reproducible before real source records are added.

## 6. Complete MCP contract

### C-MCP-01 Common result and release profiles

```ts
type ReleaseProfile = "mint_core" | "wallet_enhanced";

interface PublicResult<T> {
  schema_version: "2.0";
  artifact_revision: string;
  release_profile: ReleaseProfile;
  data: T;
  disclaimer: "Factual data only. Not investment advice, a recommendation, or a valuation.";
}

type StatementName = "pl" | "bs" | "cf";
```

Every tool advertises an `outputSchema` covering every success, missing state, and unavailable state it can return. Every valid tool call returns matching `structuredContent` plus one text content item. Application missing states have `isError: false`; an unexpected handler failure uses the fixed error boundary with `isError: true`.

Readable text for a source-verified result includes the source URL, period, and unit. Readable text for a legacy-only result says that exact filing date, unit, and source are unverified and does not borrow metadata from another record. A `no_data` result says that no current bundled row exists.

`mint_core` is the mandatory submission profile and is implementable by WP-03 without WP-04. In that profile, wallet lookup is explicitly unavailable and makes no RPC call. `wallet_enhanced` is allowed only after WP-00 and WP-04 pass.

Product-plan Profile C changes the optional judged web surface; it does not create a third MCP `ReleaseProfile` value. Its MCP results remain `mint_core` or `wallet_enhanced` according to the wallet gate.

### C-MCP-02 Tool inputs

```ts
interface ListXstocksInputV2 {
  covered_only?: boolean; // deprecated name; means structurally eligible
  exclusion_reason?: "etf" | "non_sec_listing" | "private" | "preferred";
  ticker?: string;
  mint?: string;
}

type AnnualRangeInput = {
  fiscal_year_from?: number;   // integer 1900-3000; revision 2.1
  fiscal_year_to?: number;     // integer 1900-3000; revision 2.1
};

type GetFundamentalsInputV2 = AssetIdentifierInput & AnnualRangeInput;

type GetFinancialsInputV2 = AssetIdentifierInput & AnnualRangeInput & {
  statement?: StatementName;
};

interface GetWalletHoldingsInputV2 {
  address: string;
}
```

Supplying either fiscal-year bound adds `annual_history` (C-FIN-03) to a successful `get_fundamentals` or `get_financials` result; an inverted range returns `invalid_input`. Without a bound the result is exactly the revision 2.0 result. For `get_financials` a bound also adds `statement_history` (revision 2.2): the selected statement's table, or all four tables (`pl`, `bs`, `cf`, `per_share`) when `statement` is omitted. `statement` keeps its three values; the `per_share` table is returned with the unselected request.

`list_xstocks` permits zero or one identifier. Both `ticker` and `mint` together return `invalid_input`. A selector is applied before existing filters; a known selected record that does not satisfy a filter returns an empty list. `get_fundamentals` and `get_financials` require exactly one identifier. `statement` may be omitted or one exact enum value. All objects reject unknown input fields.

### C-MCP-03 Tool outputs

```ts
interface ListXstocksSuccessV2 {
  found: true;
  items: Array<{ identity: AssetIdentity; coverage: CoverageState }>;
}

interface GetFundamentalsSuccessV2 {
  found: true;
  identity: AssetIdentity;
  coverage: CoverageState;
  verified_facts: VerifiedFactSet | null;
  legacy_snapshot: LegacySnapshotBlock<LegacyFundamentalsField> | null;
  annual_history?: AnnualHistoryBlock;   // revision 2.1, only when a range was requested
}

interface AnnualHistoryBlock {
  first_fiscal_year: number;
  fiscal_year_from: number | null;
  fiscal_year_to: number | null;
  points: AnnualFactPoint[];             // C-FIN-03; get_financials keeps only the selected statements
}

interface StatementResult<K extends string> {
  availability: "available" | "no_data";
  verified_facts: VerifiedFactSet | null;
  legacy_snapshot: LegacySnapshotBlock<K> | null;
}

interface GetFinancialsSuccessV2 {
  found: true;
  identity: AssetIdentity;
  coverage: CoverageState;
  statements: Partial<{
    pl: StatementResult<LegacyPlField>;
    bs: StatementResult<LegacyBsField>;
    cf: StatementResult<LegacyCfField>;
  }>;
  annual_history?: AnnualHistoryBlock;   // revision 2.1, only when a range was requested
  statement_history?: StatementHistoryBlock;   // revision 2.2, only when a range was requested
}

interface StatementHistoryBlock {
  first_fiscal_year: number;
  fiscal_year_from: number | null;
  fiscal_year_to: number | null;
  statements: Partial<Record<"pl" | "bs" | "cf" | "per_share", {
    rows: StatementRowDefinition[];      // C-FIN-03 revision 2.2
    years: StatementYearColumn[];
  }>>;
}
```

Tool result unions are:

| Tool | Structured `data` union |
|---|---|
| `list_xstocks` | `ListXstocksSuccessV2 | PublicError` |
| `get_fundamentals` | `GetFundamentalsSuccessV2 | PublicError` |
| `get_financials` | `GetFinancialsSuccessV2 | PublicError` |
| `get_wallet_holdings` | `WalletHoldingsAvailableV2 | WalletHoldingsUnavailableV2 | PublicError` |

For `get_financials`, omitting `statement` returns all three keys `pl`, `bs`, and `cf`. Supplying `statement` returns only that key. A missing statement inside an otherwise present ticker is a successful result with `availability: "no_data"` and both payload fields null. For example, `{ticker:"SLMT",statement:"bs"}` returns a `bs` result with no data; it is distinct from ASML having no current financial record and from an invalid statement.

Examples that the schema and protocol tests must fix:

```text
{ticker:"NVDA"}                         -> fundamentals success; v2 identity + verified/legacy blocks
{mint:"XscSc1zjbVizEnhCzzehJ9fzztm3WRKdn9pjmriKDuN"} -> the ABNB identity and financial result
{ticker:"NVDA",statement:"cf"}         -> financial success with only statements.cf
{ticker:"NVDA"} to get_financials       -> financial success with pl, bs, and cf
{ticker:"SLMT",statement:"bs"}         -> success; bs.availability=no_data
{ticker:"NVDA",statement:"quarterly"}  -> invalid_statement
```

The ABNB mint above is copied exactly from the versioned registry at baseline commit `054d58e`. WP-02 must fail if that fixture no longer resolves to ABNB in the candidate registry.

### C-MCP-04 V1 text compatibility

`content[0].text` is exactly one parseable JSON object. Nothing is prepended or appended. Its type is:

```ts
interface TextVerifiedFact {
  name: VerifiedFactName;
  value: number;
  currency: string;
  unit: "currency";
  scale: number;
  source_concept: string;
  period: VerifiedPeriod;
  source: FilingSource;
}

interface TextMetadataV2 {
  artifact_revision: string;
  release_profile: ReleaseProfile;
  requested_identifier: {
    kind: "ticker" | "mint";
    value: string;
  } | null;
  identity: AssetIdentity | null;
  coverage: CoverageState | null;
  legacy_data: {
    status: "legacy_snapshot";
    scope: "/data";
    warning: "Exact filing date, unit, source, and reported-versus-calculated status are unverified for every value under /data.";
  } | {
    status: "absent";
    scope: "/data";
    warning: "No current bundled legacy row exists under /data.";
  } | {
    status: "not_applicable";
    scope: "/data";
    warning: "This tool does not return legacy financial values under /data.";
  };
  verified_subset: {
    fundamentals: TextVerifiedFact[];
    statements: {
      pl: TextVerifiedFact[];
      bs: TextVerifiedFact[];
      cf: TextVerifiedFact[];
    };
  };
}

interface V1CompatibleTextEnvelope<T> {
  data: T;
  as_of: string;
  source: string;
  disclaimer: "Factual data only. Not investment advice, a recommendation, or a valuation.";
  _benten_v2: TextMetadataV2;
}
```

For legacy ticker inputs, the existing `data` keys, their values, and `as_of` remain exact through the submission:

- `list_xstocks` items preserve `symbol`, `ticker`, `name`, `mint`, `issuer_verified`, `fundamentals_available`, and `exclusion_reason`.
- `get_fundamentals` success preserves `found` plus every `LegacyFundamentalsField` at the current top level.
- `get_financials` success preserves `found`, `ticker`, and the existing flat statement rows with every field in the exact legacy PL/BS/CF sets. Statement omission and selection retain current behavior.
- Existing ticker errors retain current v1 reason names in text (`unknown_ticker`, `not_covered`, `no_data`, `invalid_statement`). V2 structured errors use Section 7 names.
- New mint inputs have no prior text contract. Their `data` is the v1-equivalent result for the resolved ticker, while the single JSON object's `_benten_v2.requested_identifier` and `_benten_v2.identity` contain the mint and resolved identity.

The old financial-success `source` string is not a compatibility field because it described all legacy values as SEC-derived without field-level evidence. When `/data` contains a legacy financial row, `source` is exactly `Benten legacy financial snapshot; filing source, unit, and fact kind unverified`. When no current row exists, it is exactly `Benten financial snapshot; no current bundled row`. Registry and wallet tools use `Benten registry snapshot` and `Solana read-only wallet lookup`, respectively. Exact filing URLs occur only inside individual `_benten_v2.verified_subset` entries; `source` never summarizes a partial overlay as verification of all `/data`.

When the structured result carries `annual_history`, `_benten_v2.annual_history` is an exact copy; a missing, extra, or unequal copy triggers the `service_unavailable` boundary, and so does a point without an accession, filing date, or filing URL.

`_benten_v2` is mechanically projected from the same `PublicResult` used for `structuredContent`: artifact revision, release profile, identity, and coverage are copied exactly; every verified fact is joined to exactly its referenced period and filing source; and financial legacy presence selects `legacy_snapshot` or `absent`. Registry and wallet tools select `not_applicable`; they never describe their nonfinancial `/data` as a missing legacy row. Every descendant of a financial `/data` remains legacy even when a verified subset exists. No legacy value is promoted, reconciled, or annotated as verified. Within each verified entry, name, value, currency, unit, scale, concept, expanded period, and expanded source must equal the referenced structured fact. Missing references, unequal common fields, a verified entry without a structured counterpart, or a text serialization failure triggers the fixed `service_unavailable` error boundary rather than a divergent response.

The wallet safety fallback is an explicit exception. Under `mint_core`, a valid address does not execute the old RPC path; text and structured content both say that wallet correctness is unavailable in this release profile. This exception is preferable to presenting an unverified amount as compatible behavior.

This complete legacy-only ABNB text example copies the current v1 data values and adds only the reserved metadata object:

```json
{
  "data": {
    "found": true,
    "company_name": "Airbnb, Inc.",
    "metrics_fiscal_year": 2025,
    "revenue": 12241000000,
    "op_income": 2544000000,
    "gross_profit": null,
    "net_income_parent": 2511000000,
    "total_assets": 22208000000,
    "total_equity": 8199000000,
    "total_liabilities": 14009000000,
    "long_term_debt": 0,
    "operating_cf": 4646000000,
    "investing_cf": -748000000,
    "fcf": 3898000000
  },
  "as_of": "FY2025",
  "source": "Benten legacy financial snapshot; filing source, unit, and fact kind unverified",
  "disclaimer": "Factual data only. Not investment advice, a recommendation, or a valuation.",
  "_benten_v2": {
    "artifact_revision": "054d58e-empty-overlay-fixture",
    "release_profile": "mint_core",
    "requested_identifier": {"kind": "ticker", "value": "ABNB"},
    "identity": {
      "symbol": "ABNBx",
      "ticker": "ABNB",
      "token_name": "Airbnb xStock",
      "underlying_company": null,
      "underlying_company_source_ref": null,
      "mint": "XscSc1zjbVizEnhCzzehJ9fzztm3WRKdn9pjmriKDuN",
      "issuer": "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS",
      "issuer_verified": true,
      "token_program": "unknown",
      "registry_as_of": "2026-09-12",
      "registry_source_url": "https://docs.xstocks.fi/developers"
    },
    "coverage": {
      "filing_eligibility": "eligible",
      "snapshot_status": "available",
      "source_status": "legacy_snapshot",
      "capabilities": {"fundamentals": "available", "pl": "available", "bs": "available", "cf": "available"},
      "exclusion_reason": null
    },
    "legacy_data": {
      "status": "legacy_snapshot",
      "scope": "/data",
      "warning": "Exact filing date, unit, source, and reported-versus-calculated status are unverified for every value under /data."
    },
    "verified_subset": {"fundamentals": [], "statements": {"pl": [], "bs": [], "cf": []}}
  }
}
```

The next complete envelope is a **schema demonstration only** for an ABNB record with one hypothetical accepted verified fact. The placeholder accession and URL deliberately do not assert that verification has occurred and must fail a real publication check; WP-02 replaces them only with source-ledger evidence. It demonstrates that `/data`, including `fcf`, remains legacy while only the separate revenue entry carries period, unit, and source metadata:

```json
{
  "data": {
    "found": true,
    "company_name": "Airbnb, Inc.",
    "metrics_fiscal_year": 2025,
    "revenue": 12241000000,
    "op_income": 2544000000,
    "gross_profit": null,
    "net_income_parent": 2511000000,
    "total_assets": 22208000000,
    "total_equity": 8199000000,
    "total_liabilities": 14009000000,
    "long_term_debt": 0,
    "operating_cf": 4646000000,
    "investing_cf": -748000000,
    "fcf": 3898000000
  },
  "as_of": "FY2025",
  "source": "Benten legacy financial snapshot; filing source, unit, and fact kind unverified",
  "disclaimer": "Factual data only. Not investment advice, a recommendation, or a valuation.",
  "_benten_v2": {
    "artifact_revision": "schema-demo-not-for-release",
    "release_profile": "mint_core",
    "requested_identifier": {"kind": "mint", "value": "XscSc1zjbVizEnhCzzehJ9fzztm3WRKdn9pjmriKDuN"},
    "identity": {
      "symbol": "ABNBx",
      "ticker": "ABNB",
      "token_name": "Airbnb xStock",
      "underlying_company": "Airbnb, Inc.",
      "underlying_company_source_ref": "schema-demo-source",
      "mint": "XscSc1zjbVizEnhCzzehJ9fzztm3WRKdn9pjmriKDuN",
      "issuer": "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS",
      "issuer_verified": true,
      "token_program": "unknown",
      "registry_as_of": "2026-09-12",
      "registry_source_url": "https://docs.xstocks.fi/developers"
    },
    "coverage": {
      "filing_eligibility": "eligible",
      "snapshot_status": "available",
      "source_status": "source_verified",
      "capabilities": {"fundamentals": "available", "pl": "available", "bs": "available", "cf": "available"},
      "exclusion_reason": null
    },
    "legacy_data": {
      "status": "legacy_snapshot",
      "scope": "/data",
      "warning": "Exact filing date, unit, source, and reported-versus-calculated status are unverified for every value under /data."
    },
    "verified_subset": {
      "fundamentals": [{
        "name": "revenue",
        "value": 12241000000,
        "currency": "USD",
        "unit": "currency",
        "scale": 1,
        "source_concept": "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
        "period": {
          "period_ref": "schema-demo-period",
          "fiscal_year": 2025,
          "fiscal_month": 12,
          "period_kind": "FY",
          "fact_period_type": "duration",
          "period_start": "2025-01-01",
          "period_end": "2025-12-31"
        },
        "source": {
          "source_ref": "schema-demo-source",
          "form": "10-K",
          "accession_number": "0000000000-00-000000",
          "filed_at": "2026-01-01",
          "filing_url": "https://www.sec.gov/Archives/edgar/data/0/schema-demo-not-for-release.htm",
          "source_authority": "SEC EDGAR"
        }
      }],
      "statements": {"pl": [], "bs": [], "cf": []}
    }
  }
}
```

### C-API-01 Optional web API compatibility

Profile A does not submit the web API as a judged surface. If Profile C is selected, the existing unversioned ticker routes remain legacy-compatible through the deadline:

- `/api/fundamentals/<ticker>` preserves `{found,ticker,as_of,source,disclaimer,data}` on success and its current ticker missing-state responses.
- `/api/financials/<ticker>` preserves `{found,ticker,as_of,source,disclaimer,statements}`. With no query it returns PL, BS, and CF keys; `?statement=cf` returns only CF; a missing statement value remains null; an invalid statement remains HTTP 400.
- Legacy statement rows preserve every field in the C-FIN-02 allowlists.

Optional `/api/v2/fundamentals` and `/api/v2/financials` routes may expose the same identifier and result types as C-MCP-02 and C-MCP-03. Revision 2.1 accepts `fiscal_year_from` and `fiscal_year_to` query parameters, each exactly four digits and at most once; any other form returns HTTP 400 `invalid_input`. They use the shared presenter and add no new semantics. If they are not complete by the Profile C cutoff, they are cut with Profile C rather than weakening Profile A.

## 7. Error contract

### C-ERR-01 Stable semantic errors

```ts
type ErrorReason =
  | "invalid_input"
  | "unknown_ticker"
  | "unknown_mint"
  | "not_eligible"
  | "no_data"
  | "invalid_statement"
  | "service_unavailable";

interface PublicError {
  found: false;
  reason: ErrorReason;
  requested_identifier: string | null;
  identity: AssetIdentity | null;
  coverage: CoverageState | null;
  retryable: boolean;
}
```

- Invalid and unknown identifiers are non-retryable for the current artifact revision.
- `no_data` is non-retryable for the current artifact revision and preserves a known identity.
- `service_unavailable` is retryable and must not expose endpoint URLs, credentials, stack traces, or upstream payloads.
- An unknown mint is described only as absent from the current registry snapshot. It is never labeled fake, malicious, or fraudulent.
- MCP protocol errors and application missing states remain distinguishable. A valid tool call with `no_data` returns a valid structured result, not a transport failure.

## 8. Wallet amount contract

### C-WAL-01 Exact raw and display amounts

```ts
interface WalletHoldingV2 {
  identity: AssetIdentity;
  raw_amount: string;       // unsigned base-unit integer from token account data
  decimals: number;
  display_amount: string;   // exact decimal string shown under the proven basis
  display_basis: "rpc_scaled" | "computed_scaled" | "unscaled";
  multiplier: string | null;
  multiplier_effective_at: string | null;
}

interface WalletHoldingsAvailableV2 {
  available: true;
  owner: string;
  slot: number;
  commitment: "confirmed";
  holdings: WalletHoldingV2[];
}

interface WalletHoldingsUnavailableV2 {
  available: false;
  reason: "wallet_correctness_unverified";
  retryable: false;
  release_profile: "mint_core";
}
```

The implementation must not convert an RPC amount to JavaScript `number`. It preserves raw and display strings. Accounts for the same mint across queried token programs are combined only through exact integer arithmetic, with one deterministic output row per mint. Zero-balance rows are omitted unless a future option explicitly requests them.

The implementation of `display_basis` is blocked on WP-00:

1. Select a known xStocks Token-2022 mint and an account with an observable nonzero balance.
2. Record the Solana slot, raw amount, decimals, RPC `uiAmountString`, mint owner/program, and official current multiplier metadata at one observation time.
3. Compare the RPC display string to both unscaled and multiplier-adjusted calculations using decimal arithmetic.
4. Document whether `getParsedTokenAccountsByOwner` already reflects the active multiplier for the tested provider and version.
5. Add a replay fixture. Production code follows the measured branch and never applies the same multiplier twice.

If this gate is unavailable, inconsistent, or provider-dependent by the cutoff, the release remains `mint_core`. A syntactically valid address returns `WalletHoldingsUnavailableV2` with `isError: false`, no Solana connection is created, and the tool description states that the profile is unavailable. A malformed address returns `invalid_input`. T-003 and T-006A verify this four-tool fallback. Mint-based identity and financial lookup remain complete.

## 9. Publication contract

### C-SEC-01 One-way public artifact acceptance

The repository accepts a snapshot update only when all of these gates pass:

1. Artifact and manifest parse under exact v2 schemas with no unknown fields.
2. Every registry mint, ticker, issuer, and public URL passes its type and allowlist validation.
3. Manifest hashes match the exact raw bytes of the three named artifact files.
4. Counts match the parsed artifact and the coverage-diff report names every added, removed, eligibility-changed, availability-changed, and source-status-changed ticker.
5. Every `source_verified` flagship has an accessible public filing URL whose accession, form, filing date, and period match the artifact. Verification evidence is retained with the release review.
6. A source-comparison ledger confirms each flagship value, concept, duration/instant context, period, unit, scale, and source reference. Multiple filings or contexts remain separate. URL reachability alone is insufficient.
7. Verified monetary facts include currency, unit, scale, period reference, filing reference, and a public concept. Deadline verified facts are directly reported only. Legacy null and zero remain distinct and legacy FCF remains explicitly unverified.
8. Financial runtimes remain network-free; no producer, database adapter, connection string, credential, or private source identifier enters the repository.
9. Build, typecheck, unit/contract tests, protocol E2E, publication scan, and deployment configuration checks pass on the exact commit.

The future checker is a read-only command:

```bash
node scripts/check-snapshot-release.mjs \
  --current-root packages/registry/src \
  --candidate-root path/to/candidate
```

`candidate-root` must contain the four named artifact files. Other source-code files are ignored, while an unexpected JSON artifact matching the snapshot naming convention is rejected. A post-migration `current-root` has the same four artifacts. For the one-time baseline migration, the current root's artifact set may contain only the existing `xstocks.json` and `financials-snapshot.json`; the checker labels that side `legacy_bootstrap`, computes its counts directly, and treats every current financial row as legacy rather than inventing a manifest. Any other missing-artifact combination fails. The checker reads both roots, verifies candidate schemas and raw-byte hashes, and compares counts and identifier-level status changes. It never copies, renames, edits, or deletes either root.

Success exits 0 and emits one JSON object to stdout:

```json
{"ok":true,"artifact_revision":"candidate-revision","hashes_verified":true,"counts":{"registry":154,"eligible":129,"snapshot_available":128,"source_verified":3},"changes":[]}
```

Failure exits nonzero and emits `{"ok":false,"errors":[{"code":"HASH_MISMATCH","path":"verified-facts-v2.json"}]}`. Errors name codes and public paths without printing rejected values, credentials, or upstream payloads. A failed check leaves the current repository and candidate directory byte-for-byte unchanged. A separate, reviewed file replacement occurs only after success.

### C-OPS-01 Refresh and rollback

- Refresh is a reviewed replacement of immutable snapshot artifacts, not an in-place runtime mutation.
- The release commit contains the snapshot, manifest, coverage diff, validator/test changes required by the schema, and no unrelated feature changes.
- Rollback is a revert to the previous accepted artifact commit followed by all release gates.
- RPO is the previous accepted snapshot revision. The submission RTO target is 30 minutes, subject to the hosting provider.
- Deployment and public release are separate authorized operations. A local accepted artifact does not prove public availability.

### C-OPS-02 Submission continuity

- The submission receipt pins the exact commit, artifact revision, and submitted evidence URLs.
- At least one eligible GitHub, live-demo, or video route must be accessible to a signed-out reviewer; the contract does not assume public GitHub is mandatory.
- The evidence owner checks all submitted URLs daily through the structured judging deadline observed on 2026-09-16, `2026-10-09T00:00:00Z`, and records timestamp, status, visible version/revision where applicable, and recovery action. This timestamp is not asserted to be a winner-announcement date; a changed official value supersedes it through a dated D0 receipt.
- A local backup recording and the prior verified web artifact are retained until judging ends.
- Form registration, wallet connection, final submission, and post-submission edits are external actions governed by separate authority and the actual form terms.

## 10. Evidence contracts

### C-EVD-01 Judge evidence

The submission evidence identifies one exact commit and records:

- clean-checkout MCP setup and first correct fact;
- known mint identity result;
- flagship source-verifiable fact result;
- ASML `no_data` result;
- unknown-mint result;
- full release-gate result;
- signed-out public artifact check;
- demo timestamp mapping to the published judging concerns.

### C-EVD-02 User-validation evidence

Each attempt records participant fit, environment, start/end time, completion, identity correctness, source interpretation, missing-state interpretation, source trust score, and first friction point. Names and private account data are not required. The sample size and recruitment relationship are disclosed.

## 11. Required tests

| Test | Required assertions |
|---|---|
| Identifier convergence | Known ticker and mint return identical identity; both/neither/unknown/injection-shaped values fail closed |
| Coverage matrix | One fixture for source-verified, legacy-snapshot, no-data, capability-specific statement gaps, and every structural exclusion reason |
| Provenance | Invalid accession/date/URL/concept/unit/scale/hash, broken source/period refs, or duration/instant mismatch is rejected; every flagship value is checked in a source ledger; legacy unknown dates/units remain null |
| Structured MCP | Each of the four advertised output schemas validates every success/error/unavailable branch; v1 text compatibility assertions follow C-MCP-04 |
| Snapshot safety | Unknown fields, nested legacy values, non-finite/unsafe verified numbers, ticker mismatch, raw-byte hash mismatch, count mismatch, and candidate-check mutation fail the gate |
| Wallet mint-core | A valid address returns `wallet_correctness_unverified` without constructing an RPC connection; malformed input returns `invalid_input` |
| Wallet enhanced | Both token programs, raw precision, display basis, multiplier boundary, duplicate mint aggregation, zero balance, missing optional RPC fields, and RPC failure |
| Cross-surface consistency | Mandatory: v1 text and v2 structured MCP agree semantically. Enhanced web profile: MCP, JSON API, and web presenter also agree for flagship, legacy, ASML, SLMT missing statements, unknown, and ineligible fixtures |
| Protocol E2E | Spawn compiled stdio server; initialize, list tools, call known mint, call ASML, and call unknown mint |

## 12. Deferred contract questions

- Multi-period output is defined by C-FIN-03 (revision 2.1; statement line items in revision 2.2). Non-USD presentation currencies, predecessor registrants with a different CIK, and aligning the v2 newest-year `fiscal_year` with the C-FIN-03 label remain open.
- Exact decimal strings for financial facts become mandatory in a future major version if any accepted source value cannot be represented as a safe integer with explicit scale.
- Pagination is deferred while the registry remains a bounded 154-record snapshot, unless onboarding measurements show that unfiltered output harms agent use.
- Hosted transport authentication, quotas, billing, service-level targets, and retention are undefined because the submission uses local stdio and immutable public snapshots.
