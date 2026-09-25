# Benten public data dictionary

This dictionary describes the immutable data bundled with Benten. The
machine-readable contract is
[`specs/contracts/public-data-v2.md`](../specs/contracts/public-data-v2.md).

## Identity

`ticker` and `mint` are exact registry identifiers. Tickers are trimmed and
uppercased before an exact match. Mints are trimmed, remain case-sensitive,
and must match the registry exactly. `token_name` names the xStocks token;
`underlying_company` names the filing entity only when a public filing source
supports that identity. An unknown mint means only that the current registry
snapshot does not contain it.

## Coverage

Coverage uses independent dimensions:

- `filing_eligibility` records whether the registry entry is structurally in
  scope for the filing workflow.
- `snapshot_status` records whether a bundled verified or legacy fundamentals
  capability exists.
- `source_status` distinguishes a source-verified subset, a legacy snapshot,
  and no applicable financial row.
- `capabilities.fundamentals`, `pl`, `bs`, and `cf` report availability from
  either source separately. One available statement never implies that every
  statement is available.

## Verified facts

The deadline verified allowlist contains only directly reported monetary
facts: `revenue`, `net_income_parent`, `total_assets`, `total_liabilities`, and
`operating_cf`. A record may contain fewer facts when the filing does not
directly report an accepted concept.

Each verified fact includes:

| Field | Meaning |
|---|---|
| `value` | Finite safe integer after applying the stated scale |
| `currency` | `USD`; the current v2 release supports USD filing facts only |
| `unit` | `currency` |
| `scale` | `1`; normalized or inferred scale values are rejected |
| `source_concept` | One supported `us-gaap` concept for the named fact |
| `period_ref` | Reference to an exact duration or instant context |
| `source_ref` | Reference to one filing accession, date, form, and public URL |

Revenue, parent net income, and operating cash flow use duration contexts.
Assets and liabilities use instant contexts. A fact is omitted when its value,
concept, context, currency, scale, or filing reference cannot be verified.

The current supported concepts are `us-gaap:Revenues`,
`us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax`, and
`us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax` for revenue,
`us-gaap:NetIncomeLoss`, `us-gaap:Assets`, `us-gaap:Liabilities`, and
`us-gaap:NetCashProvidedByUsedInOperatingActivities` for their correspondingly
named facts. Filing sources are public SEC 10-K URLs whose accession directory
matches the declared accession number. Fundamentals and statement copies of a
fact must resolve to the same period and filing metadata.

Free cash flow and every calculated metric are excluded from verified facts.
The legacy `fcf` field remains available only inside the legacy compatibility
block with unknown source, unit, and reported-versus-calculated status.

## Legacy snapshot

Legacy rows preserve the exact v1 values and fiscal label. They do not contain
enough evidence to infer exact period dates, currency, unit, filing source, or
whether a value was reported or calculated. Those attributes therefore remain
unknown. Verified overlay metadata never upgrades the values inside the legacy
block.

## Annual history (FY2016 onward)

`verified-facts-annual-v1.json` adds one record per fiscal year for the same
five metrics. It is additive: the newest-year verified facts above are
unchanged, and every one of them reappears in the annual history with the same
value, concept, filing, and period (startup fails otherwise). Default Web and
MCP responses do not include the history; it is returned only when a
fiscal-year range is requested.

Values come from an offline annual fundamentals export that is not part of
this repository. Each value is then checked against SEC EDGAR `companyfacts`
and carries one of two statuses:

| `status` | Meaning |
|---|---|
| `verified_reported` | A named annual filing (10-K, 20-F or 40-F) reports exactly this value, for exactly this period, under an allowlisted concept. `source_concept` names the concept and the cited filing is that filing. |
| `unverified_or_derived` | No annual filing reports this value for the period under an allowlisted concept. The value is shown with a `reason` and cites the fiscal year's annual report only as the filing that covers the year; it is not a reported value. |

Values that cannot cite any annual filing are not published: a filing whose
presentation currency is not USD (including USD convenience translations), a
source row from a predecessor registrant with a different CIK, and a
pre-listing year with no annual report of its own.

### Fields of one point

The read model (`getAnnualFactSeries`, `getAnnualHistory`, and the
`annual_history.points` of Web and MCP results) returns one point per fiscal
year and metric:

| Field | Meaning |
|---|---|
| `fiscal_year` | Calendar year in which the fiscal year ends; a year ending in the first 15 days of January counts to the prior year. This deterministic label can differ from an issuer's own name for its year (for example a year ending on 1 February 2026 is `2026`). |
| `fiscal_month`, `period_start`, `period_end` | The reported context. `period_start` is null for balance-sheet (instant) metrics. |
| `metric`, `statement` | One of the five metrics and its statement (`pl`, `bs`, `cf`). |
| `value`, `unit`, `scale` | Safe integer; `unit` is the ISO 4217 currency (`USD`); `scale` is 1. |
| `status` | `verified_reported` or `unverified_or_derived`. |
| `source_concept` | The reporting concept for a verified value; null otherwise. |
| `provenance` | For a verified value: `annual_report` (the fiscal year's own annual report), `restated_in_later_report` (a later annual report states this value and the year's own report stated a different one), or `reported_in_later_report` (only a later report states it). Null otherwise. |
| `reason` | For an unverified value: `derived_by_source`, `reported_under_unlisted_concept`, `value_not_reported_in_filings`, `implausible_revenue_concept`, `ambiguous_period`, or `period_mismatch`. Null otherwise. |
| `accession`, `form`, `filed`, `filing_url` | The cited filing. |
| `restatement` | For a restated value: the original value and concept and the original annual report's accession, date, and URL. |

### Concepts

The accepted concepts per metric, in priority order, and the concepts that are
deliberately not accepted are listed in
[`packages/registry/src/verified-fact-concepts.json`](../packages/registry/src/verified-fact-concepts.json).
Two accepted concepts carry a check: net income available to common
stockholders counts as parent net income only when the same filing's
consolidated net income minus its reported noncontrolling-interest shares
equals it, and operating cash flow from continuing operations counts only when
the filing reports no nonzero operating cash flow from discontinued operations.
Consolidated net income including noncontrolling interests, revenue
components, and a total derived from the balance-sheet identity are not
accepted.

## Statement line items (FY2016 onward)

`verified-statements-annual-v1-pl.json`, `-bs.json`, `-cf.json`, and
`-per_share.json` add 40 line items to the five annual metrics for the same
fiscal years (contract C-FIN-03 revision 2.2). The rules are those of the
annual history: a value is `verified_reported` only when SEC `companyfacts`
reports exactly that value for exactly that period under an accepted concept
in a named annual filing; otherwise it is `unverified_or_derived` with a
reason and cites only the year's annual report. A value that equals a
balance-sheet or income-statement identity of other source values and that no
filing reports is `derived_by_source`.

The read model `getStatementSeries(ticker, statement, range?)` returns one
table per statement (`pl`, `bs`, `cf`, `per_share`): `rows` in presentation
order and `years` ascending, each year holding one cell per item. A reported
cell has the value, unit, status, concept, provenance or reason, the cited
filing (accession, form, date, URL), and any restatement. The five annual
metrics are reported cells with exactly their annual-history values and
filings. Web and MCP return the same tables as `statement_history` of a
financials result when a fiscal-year bound is supplied.

Units: `USD` is whole US dollars; `USD_per_share` is dollars per share with at
most four decimals; `shares` is a whole share count; `ratio` is a fraction
(0.25 means 25%).

`shares_outstanding` is the count on the cover of the fiscal year's annual
report. That count is stated as of a date after the fiscal year ends (for
example late July for a June year end); the cell carries that date in `as_of`.

Fill rate is the share of the 1,181 published annual years with a source row
that had a source value; the verified share is of published values
(`verified_reported` and `unverified_or_derived`). Figures are from the
2026-09-25 export.

| Item | Statement | Label | Unit | Fill rate | Published | Verified |
|---|---|---|---|---|---|---|
| `revenue` | pl | Revenue | USD | (annual history) | | |
| `cost_of_revenue` | pl | Cost of revenue | USD | 66.0% | 779 | 100.0% |
| `gross_profit` | pl | Gross profit | USD | 41.8% | 494 | 100.0% |
| `sga` | pl | Selling, general and administrative expense | USD | 56.0% | 661 | 99.9% |
| `research_and_development` | pl | Research and development expense | USD | 60.3% | 712 | 99.9% |
| `operating_income` | pl | Operating income | USD | 80.8% | 954 | 99.9% |
| `interest_expense` | pl | Interest expense | USD | 61.3% | 722 | 100.0% |
| `pretax_income` | pl | Income before income taxes | USD | 99.7% | 1177 | 97.0% |
| `income_tax` | pl | Income tax expense | USD | 98.8% | 1167 | 99.9% |
| `net_income` | pl | Net income (consolidated) | USD | 99.9% | 1165 | 71.7% |
| `net_income_noncontrolling` | pl | Net income attributable to noncontrolling interests | USD | 45.7% | 540 | 100.0% |
| `net_income_parent` | pl | Net income attributable to the parent | USD | (annual history) | | |
| `comprehensive_income_parent` | pl | Comprehensive income attributable to the parent | USD | 90.8% | 1072 | 100.0% |
| `cash_and_equivalents` | bs | Cash and cash equivalents | USD | 89.8% | 1059 | 100.0% |
| `receivables` | bs | Accounts receivable, net | USD | 67.8% | 799 | 100.0% |
| `inventories` | bs | Inventories | USD | 62.7% | 739 | 100.0% |
| `current_assets` | bs | Current assets | USD | 85.4% | 1007 | 100.0% |
| `ppe` | bs | Property, plant and equipment, net | USD | 82.9% | 977 | 100.0% |
| `goodwill` | bs | Goodwill | USD | 83.3% | 982 | 100.0% |
| `intangible_assets` | bs | Intangible assets excluding goodwill | USD | 57.4% | 676 | 100.0% |
| `total_assets` | bs | Total assets | USD | (annual history) | | |
| `current_liabilities` | bs | Current liabilities | USD | 85.4% | 1007 | 100.0% |
| `long_term_debt` | bs | Long-term debt, noncurrent | USD | 53.1% | 627 | 99.8% |
| `total_liabilities` | bs | Total liabilities | USD | (annual history) | | |
| `equity_parent` | bs | Equity attributable to the parent | USD | 99.3% | 1165 | 91.2% |
| `noncontrolling_interest` | bs | Noncontrolling interest in equity | USD | 49.0% | 579 | 100.0% |
| `total_equity` | bs | Total equity (consolidated) | USD | 99.3% | 1171 | 100.0% |
| `retained_earnings` | bs | Retained earnings (accumulated deficit) | USD | 97.1% | 1145 | 100.0% |
| `operating_cf` | cf | Net cash from operating activities | USD | (annual history) | | |
| `depreciation_amortization` | cf | Depreciation and amortization | USD | 75.1% | 885 | 100.0% |
| `investing_cf` | cf | Net cash from investing activities | USD | 99.9% | 1179 | 99.3% |
| `capex` | cf | Purchases of property, plant and equipment | USD | 73.2% | 865 | 100.0% |
| `financing_cf` | cf | Net cash from financing activities | USD | 99.8% | 1179 | 99.2% |
| `dividends_paid` | cf | Dividends paid | USD | 66.5% | 785 | 99.8% |
| `share_repurchase` | cf | Repurchases of common stock | USD | 83.5% | 985 | 99.9% |
| `debt_issued` | cf | Proceeds from long-term debt | USD | 65.5% | 772 | 78.2% |
| `debt_repaid` | cf | Repayments of long-term debt | USD | 63.7% | 744 | 75.3% |
| `net_change_in_cash` | cf | Net change in cash | USD | 98.7% | 1163 | 96.0% |
| `cash_end_of_period` | cf | Cash at end of period (cash-flow statement) | USD | 99.4% | 1170 | 98.1% |
| `interest_paid` | cf | Interest paid | USD | 89.8% | 1060 | 100.0% |
| `income_taxes_paid` | cf | Income taxes paid | USD | 65.8% | 777 | 100.0% |
| `eps_basic` | per_share | Earnings per share, basic | USD_per_share | 95.1% | 1123 | 98.3% |
| `eps_diluted` | per_share | Earnings per share, diluted | USD_per_share | 95.1% | 1123 | 98.2% |
| `dividends_per_share` | per_share | Dividends per common share | USD_per_share | 64.6% | 761 | 100.0% |
| `shares_outstanding` | per_share | Common shares outstanding (annual report cover date) | shares | 92.8% | 1063 | 86.4% |

The accepted and deliberately excluded concepts for every item are listed in
`statement_items` of
[`packages/registry/src/verified-fact-concepts.json`](../packages/registry/src/verified-fact-concepts.json).
Most unverified values come from four source habits: consolidated net income
that is really the parent's share when noncontrolling interests exist, parent
equity that includes noncontrolling interests, debt proceeds and repayments that
include short-term borrowings, and cover-page share counts summed over share
classes. Items with sparse or unreliable source columns (short-term debt,
noncurrent assets, lease liabilities, impairment, discontinued operations,
book value per share) are not published.

### Calculated items

Calculated cells are computed from two reported cells of the same fiscal year
and are never reported by a filing. Each has `status: "calculated"`, the
formula, and both inputs (item, value, status, accession, filing URL).
`input_status` is `unverified_or_derived` when either input is.

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

A ratio exists only when its denominator is greater than zero and is rounded
to six decimal places. `free_cash_flow` uses the reported positive payment for
property, plant and equipment; free-cash-flow measures have no uniform
definition, and this one is exactly the stated formula. It is not the legacy
`fcf` compatibility key.
