import conceptTable from "./verified-fact-concepts.json" with { type: "json" };

/** Fail-closed validator for the multi-year annual fact artifact (`verified-facts-annual-v1.json`). */

export const ANNUAL_FACT_NAMES = ["revenue", "net_income_parent", "total_assets", "total_liabilities", "operating_cf"];
export const ANNUAL_FORMS = [...conceptTable.annual_forms];
export const ANNUAL_PROVENANCES = ["annual_report", "restated_in_later_report", "reported_in_later_report"];
export const UNVERIFIED_REASONS = [
    "derived_by_source",
    "reported_under_unlisted_concept",
    "value_not_reported_in_filings",
    "implausible_revenue_concept",
    "ambiguous_period",
    "period_mismatch",
];
export const EXCLUSION_REASONS = ["not_in_source", "unsafe_value", "no_annual_report_to_cite"];
const ANNUAL_DAYS_MIN = 350;
const ANNUAL_DAYS_MAX = 380;
const MAX_SOURCE_REF = 128;

const CONCEPTS = Object.fromEntries(ANNUAL_FACT_NAMES.map((name) => {
    const spec = conceptTable.facts[name];
    if (!spec || (spec.period_type !== "duration" && spec.period_type !== "instant")) {
        throw new TypeError("Verified fact concept table is incomplete");
    }
    return [name, { periodType: spec.period_type, statement: spec.statement, concepts: new Set(spec.concepts.map((entry) => entry.concept)) }];
}));

/** Statement of each annual fact, from the reviewed concept table. */
export const ANNUAL_FACT_STATEMENT = Object.fromEntries(ANNUAL_FACT_NAMES.map((name) => [name, CONCEPTS[name].statement]));
/** Period type of each annual fact, from the reviewed concept table. */
export const ANNUAL_FACT_PERIOD_TYPE = Object.fromEntries(ANNUAL_FACT_NAMES.map((name) => [name, CONCEPTS[name].periodType]));

function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(record, keys, message) {
    const actual = Object.keys(record).sort();
    const expected = [...keys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
        throw new TypeError(message);
    }
}
/** Exact `YYYY-MM-DD` calendar date. */
export function isIsoDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
/** Whole days from `start` to `end` (ISO dates). */
export function spanDays(start, end) {
    return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}
/** Calendar year in which a fiscal year ends; the first 15 days of January count to the prior year. */
export function fiscalYearForPeriodEnd(periodEnd) {
    return new Date(Date.parse(`${periodEnd}T00:00:00Z`) - 15 * 86400000).getUTCFullYear();
}
function isCanonicalSecFilingUrl(value, accessionNumber) {
    if (typeof value !== "string")
        return false;
    try {
        const url = new URL(value);
        const match = url.pathname.match(/^\/Archives\/edgar\/data\/\d+\/(\d{18})\/[A-Za-z0-9._-]+\.htm$/);
        return url.protocol === "https:" && url.hostname === "www.sec.gov"
            && url.username === "" && url.password === "" && url.port === ""
            && url.search === "" && url.hash === ""
            && match?.[1] === accessionNumber.replaceAll("-", "");
    }
    catch {
        return false;
    }
}
/** Validate one cited annual filing record whose map key is `key`. */
export function validateAnnualFilingSource(value, key) {
    if (!isRecord(value))
        throw new TypeError("Invalid annual filing source");
    exactKeys(value, ["source_ref", "form", "accession_number", "filed_at", "filing_url", "source_authority"], "Unknown annual filing source property");
    if (value.source_ref !== key || key.length < 1 || key.length > MAX_SOURCE_REF
        || !ANNUAL_FORMS.includes(value.form)
        || typeof value.accession_number !== "string" || !/^\d{10}-\d{2}-\d{6}$/.test(value.accession_number)
        || !isIsoDate(value.filed_at)
        || !isCanonicalSecFilingUrl(value.filing_url, value.accession_number)
        || value.source_authority !== "SEC EDGAR")
        throw new TypeError("Invalid annual filing source");
    return value;
}
function validateFact(name, fact, year, sources, used) {
    if (!isRecord(fact) || !ANNUAL_FACT_NAMES.includes(name))
        throw new TypeError("Invalid annual fact name");
    if (!Number.isSafeInteger(fact.value) || fact.currency !== "USD")
        throw new TypeError("Invalid annual fact value");
    const cite = (ref) => {
        if (typeof ref !== "string" || !Object.hasOwn(sources, ref))
            throw new TypeError("Annual fact cites an unknown filing");
        if (sources[ref].filed_at < year.period_end)
            throw new TypeError("Annual fact cites a filing made before the period ended");
        used.add(ref);
    };
    if (fact.status === "verified_reported") {
        const restated = fact.provenance === "restated_in_later_report";
        exactKeys(fact, ["status", "value", "currency", "source_concept", "source_ref", "provenance", ...(restated ? ["restatement"] : [])], "Unknown verified annual fact property");
        if (!ANNUAL_PROVENANCES.includes(fact.provenance) || !CONCEPTS[name].concepts.has(fact.source_concept))
            throw new TypeError("Invalid verified annual fact");
        cite(fact.source_ref);
        if (fact.provenance === "annual_report" && fact.source_ref !== year.annual_report_ref)
            throw new TypeError("Annual-report provenance must cite the fiscal year's annual report");
        if (fact.provenance !== "annual_report" && fact.source_ref === year.annual_report_ref)
            throw new TypeError("Later-report provenance must cite a later filing");
        if (restated) {
            const restatement = fact.restatement;
            if (!isRecord(restatement))
                throw new TypeError("Invalid restatement");
            exactKeys(restatement, ["original_value", "original_source_concept", "original_source_ref"], "Unknown restatement property");
            if (!Number.isSafeInteger(restatement.original_value) || restatement.original_value === fact.value
                || !CONCEPTS[name].concepts.has(restatement.original_source_concept)
                || restatement.original_source_ref !== year.annual_report_ref)
                throw new TypeError("Invalid restatement");
            cite(restatement.original_source_ref);
            if (sources[restatement.original_source_ref].filed_at >= sources[fact.source_ref].filed_at)
                throw new TypeError("A restatement must come from a later filing");
        }
        if (CONCEPTS[name].periodType === "duration" && year.period_start === null)
            throw new TypeError("Verified duration fact without a period start");
        return fact;
    }
    if (fact.status === "unverified_or_derived") {
        exactKeys(fact, ["status", "value", "currency", "source_ref", "reason"], "Unknown unverified annual fact property");
        if (!UNVERIFIED_REASONS.includes(fact.reason) || year.annual_report_ref === null || fact.source_ref !== year.annual_report_ref)
            throw new TypeError("Invalid unverified annual fact");
        cite(fact.source_ref);
        return fact;
    }
    throw new TypeError("Invalid annual fact status");
}
function validateYear(value, sources, used, firstFiscalYear) {
    if (!isRecord(value))
        throw new TypeError("Invalid annual year");
    exactKeys(value, ["fiscal_year", "fiscal_month", "period_start", "period_end", "annual_report_ref", "facts", "excluded"], "Unknown annual year property");
    if (!isIsoDate(value.period_end)
        || value.fiscal_year !== fiscalYearForPeriodEnd(value.period_end) || value.fiscal_year < firstFiscalYear
        || value.fiscal_month !== Number(value.period_end.slice(5, 7))
        || !isRecord(value.facts) || !isRecord(value.excluded))
        throw new TypeError("Invalid annual year");
    if (value.period_start !== null) {
        if (!isIsoDate(value.period_start))
            throw new TypeError("Invalid annual period start");
        const days = spanDays(value.period_start, value.period_end);
        if (days < ANNUAL_DAYS_MIN || days > ANNUAL_DAYS_MAX)
            throw new TypeError("Annual period is not about one year");
    }
    if (value.annual_report_ref !== null) {
        if (typeof value.annual_report_ref !== "string" || !Object.hasOwn(sources, value.annual_report_ref))
            throw new TypeError("Annual report reference is unknown");
        used.add(value.annual_report_ref);
    }
    const names = Object.keys(value.facts);
    if (names.length === 0)
        throw new TypeError("Annual year has no facts");
    for (const name of names)
        validateFact(name, value.facts[name], value, sources, used);
    for (const [name, reason] of Object.entries(value.excluded)) {
        if (!ANNUAL_FACT_NAMES.includes(name) || Object.hasOwn(value.facts, name) || !EXCLUSION_REASONS.includes(reason))
            throw new TypeError("Invalid annual exclusion");
    }
    return value;
}

/** Validate the annual artifact against the eligible registry tickers. */
export function validateVerifiedAnnualHistory(input, eligibleTickers) {
    if (!isRecord(input))
        throw new TypeError("Invalid annual history");
    exactKeys(input, ["schema_version", "first_fiscal_year", "records"], "Unknown annual history property");
    if (input.schema_version !== "1.0" || !Number.isInteger(input.first_fiscal_year)
        || input.first_fiscal_year < 1990 || input.first_fiscal_year > 3000 || !isRecord(input.records))
        throw new TypeError("Invalid annual history");
    for (const [ticker, record] of Object.entries(input.records)) {
        if (!/^[A-Z0-9.-]{1,16}$/.test(ticker) || (eligibleTickers && !eligibleTickers.has(ticker)) || !isRecord(record))
            throw new TypeError("Invalid annual history ticker");
        exactKeys(record, ["sources", "years"], "Unknown annual history record property");
        if (!isRecord(record.sources) || !Array.isArray(record.years) || record.years.length === 0)
            throw new TypeError("Invalid annual history record");
        const accessions = new Set();
        for (const [key, source] of Object.entries(record.sources)) {
            validateAnnualFilingSource(source, key);
            if (accessions.has(source.accession_number))
                throw new TypeError("Annual filing listed twice");
            accessions.add(source.accession_number);
        }
        const used = new Set();
        let previous = null;
        for (const year of record.years) {
            validateYear(year, record.sources, used, input.first_fiscal_year);
            if (previous && (year.fiscal_year <= previous.fiscal_year || year.period_end <= previous.period_end))
                throw new TypeError("Annual years must ascend without duplicates");
            previous = year;
        }
        if (used.size !== Object.keys(record.sources).length)
            throw new TypeError("Annual history lists an uncited filing");
    }
    return input;
}

/** Number of published annual periods, for the manifest. */
export function countAnnualYears(history) {
    return Object.values(history.records).reduce((total, record) => total + record.years.length, 0);
}
