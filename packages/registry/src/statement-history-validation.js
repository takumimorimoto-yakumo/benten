import conceptTable from "./verified-fact-concepts.json" with { type: "json" };
import {
    ANNUAL_FACT_NAMES,
    ANNUAL_FACT_PERIOD_TYPE,
    ANNUAL_FACT_STATEMENT,
    ANNUAL_PROVENANCES,
    EXCLUSION_REASONS,
    UNVERIFIED_REASONS,
    isIsoDate,
    spanDays,
    validateAnnualFilingSource,
} from "./annual-history-validation.js";

/**
 * Fail-closed validator for the per-statement annual line-item artifacts
 * (`verified-statements-annual-v1-<statement>.json`, contract C-FIN-03
 * revision 2.2) and for the reviewed item and calculation definitions in
 * `verified-fact-concepts.json`.
 */

export const STATEMENT_DETAIL_NAMES = ["pl", "bs", "cf", "per_share"];
export const STATEMENT_ITEM_UNITS = ["USD", "USD_per_share", "shares"];
export const STATEMENT_ITEM_PERIOD_TYPES = ["duration", "instant", "cover_instant"];
export const CALCULATED_ITEM_UNITS = ["USD", "ratio"];
export const CALCULATION_OPERATIONS = ["divide", "subtract"];
const ANNUAL_DAYS_MIN = 350;
const ANNUAL_DAYS_MAX = 380;
const COVER_DAYS_MAX = 150;
const ITEM_NAME = /^[a-z][a-z0-9_]{1,47}$/;
const CONCEPT_NAME = /^(us-gaap|ifrs-full|dei):[A-Za-z0-9]{1,200}$/;
const MAX_LABEL = 120;
const MAX_NOTE = 400;

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
function isText(value, max) {
    return typeof value === "string" && value.length > 0 && value.length <= max;
}

// ------------------------------------------------------------------ definitions

function validateConceptList(list, key) {
    if (!Array.isArray(list)) throw new TypeError("Invalid statement item concepts");
    const seen = new Set();
    for (const entry of list) {
        if (!isRecord(entry)) throw new TypeError("Invalid statement item concept");
        exactKeys(entry, ["concept", key], "Unknown statement item concept property");
        if (!CONCEPT_NAME.test(entry.concept) || !isText(entry[key], MAX_NOTE) || seen.has(entry.concept)) {
            throw new TypeError("Invalid statement item concept");
        }
        seen.add(entry.concept);
    }
    return seen;
}

function buildDefinitions(table) {
    const items = table.statement_items;
    const order = table.statement_order;
    const calculated = table.calculated_items;
    const coreLabels = table.statement_core_labels;
    if (!isRecord(items) || !isRecord(order) || !isRecord(calculated) || !isRecord(coreLabels)) throw new TypeError("Statement item table is incomplete");
    exactKeys(coreLabels, ANNUAL_FACT_NAMES, "Unknown annual fact label");
    if (Object.values(coreLabels).some((label) => !isText(label, MAX_LABEL))) throw new TypeError("Invalid annual fact label");
    exactKeys(order, STATEMENT_DETAIL_NAMES, "Unknown statement in the item order");
    const reported = {};
    for (const [name, spec] of Object.entries(items)) {
        if (!ITEM_NAME.test(name) || ANNUAL_FACT_NAMES.includes(name) || !isRecord(spec)) throw new TypeError("Invalid statement item");
        exactKeys(spec, ["statement", "period_type", "unit", "label", "concepts", "excluded_concepts"], "Unknown statement item property");
        if (!STATEMENT_DETAIL_NAMES.includes(spec.statement) || !STATEMENT_ITEM_PERIOD_TYPES.includes(spec.period_type)
            || !STATEMENT_ITEM_UNITS.includes(spec.unit) || !isText(spec.label, MAX_LABEL)
            || (spec.period_type === "cover_instant") !== (spec.unit === "shares")) {
            throw new TypeError("Invalid statement item");
        }
        const concepts = validateConceptList(spec.concepts, "note");
        const excluded = validateConceptList(spec.excluded_concepts, "reason");
        if (concepts.size === 0 || [...excluded].some((concept) => concepts.has(concept))) throw new TypeError("Invalid statement item concepts");
        reported[name] = { name, statement: spec.statement, periodType: spec.period_type, unit: spec.unit, label: spec.label, concepts };
    }
    // The five annual facts keep their own table entries; they join the statement rows here.
    const core = Object.fromEntries(ANNUAL_FACT_NAMES.map((name) => [name, {
        name, statement: ANNUAL_FACT_STATEMENT[name], periodType: ANNUAL_FACT_PERIOD_TYPE[name], unit: "USD",
        label: coreLabels[name], concepts: new Set(conceptTable.facts[name].concepts.map((c) => c.concept)),
    }]));
    const rows = {};
    const placed = new Set();
    for (const statement of STATEMENT_DETAIL_NAMES) {
        const list = order[statement];
        if (!Array.isArray(list) || list.length === 0) throw new TypeError("Invalid statement item order");
        for (const name of list) {
            const def = reported[name] ?? core[name];
            if (!def || def.statement !== statement || placed.has(name)) throw new TypeError("Invalid statement item order");
            placed.add(name);
        }
        rows[statement] = [...list];
    }
    if (placed.size !== Object.keys(reported).length + ANNUAL_FACT_NAMES.length) throw new TypeError("A statement item has no row");
    const calc = {};
    for (const [name, spec] of Object.entries(calculated)) {
        if (!ITEM_NAME.test(name) || placed.has(name) || !isRecord(spec)) throw new TypeError("Invalid calculated item");
        exactKeys(spec, ["statement", "unit", "label", "operation", "inputs", "formula", "note"], "Unknown calculated item property");
        const inputs = spec.inputs;
        if (!STATEMENT_DETAIL_NAMES.includes(spec.statement) || !CALCULATED_ITEM_UNITS.includes(spec.unit)
            || !CALCULATION_OPERATIONS.includes(spec.operation) || !isText(spec.label, MAX_LABEL)
            || !isText(spec.formula, MAX_LABEL) || !isText(spec.note, MAX_NOTE)
            || !Array.isArray(inputs) || inputs.length !== 2 || inputs[0] === inputs[1]
            || inputs.some((input) => !placed.has(input))) {
            throw new TypeError("Invalid calculated item");
        }
        const units = inputs.map((input) => (reported[input] ?? core[input]).unit);
        const symbol = spec.operation === "divide" ? "/" : "-";
        if (units.some((unit) => unit !== "USD") || spec.formula !== `${inputs[0]} ${symbol} ${inputs[1]}`
            || (spec.operation === "divide") !== (spec.unit === "ratio")) {
            throw new TypeError("Invalid calculated item");
        }
        calc[name] = { name, statement: spec.statement, unit: spec.unit, label: spec.label, operation: spec.operation, inputs: [...inputs], formula: spec.formula };
    }
    return { reported, core, rows, calculated: calc };
}

const DEFINITIONS = buildDefinitions(conceptTable);

/** Reviewed reported line items beyond the five annual facts, by name. */
export const STATEMENT_ITEMS = DEFINITIONS.reported;
/** The five annual facts as statement rows, by name. */
export const CORE_STATEMENT_ITEMS = DEFINITIONS.core;
/** Row order of each statement (annual facts and line items). */
export const STATEMENT_ROWS = DEFINITIONS.rows;
/** Reviewed calculated items, by name. */
export const CALCULATED_ITEMS = DEFINITIONS.calculated;
/** Every reported line-item name beyond the five annual facts, in row order. */
export const STATEMENT_ITEM_NAMES = STATEMENT_DETAIL_NAMES.flatMap((statement) => STATEMENT_ROWS[statement].filter((name) => Object.hasOwn(STATEMENT_ITEMS, name)));
/** File name of each statement artifact. */
export function statementArtifactFile(statement) {
    return `verified-statements-annual-v1-${statement}.json`;
}

// ------------------------------------------------------------------ values

/** Whether `value` is a publishable value of the given item unit. */
export function isStatementValue(unit, value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    if (unit === "USD_per_share") return Math.abs(value) < 1e7 && Number(value.toFixed(4)) === value;
    return Number.isSafeInteger(value);
}

function validateFact(name, fact, year, sources, used) {
    const item = STATEMENT_ITEMS[name];
    if (!isRecord(fact) || !isStatementValue(item.unit, fact.value)) throw new TypeError("Invalid statement fact value");
    const cite = (ref) => {
        if (typeof ref !== "string" || !Object.hasOwn(sources, ref)) throw new TypeError("Statement fact cites an unknown filing");
        if (sources[ref].filed_at < year.period_end) throw new TypeError("Statement fact cites a filing made before the period ended");
        used.add(ref);
    };
    if (fact.status === "verified_reported") {
        const cover = item.periodType === "cover_instant";
        const ownReport = !Object.hasOwn(fact, "provenance");
        const restated = fact.provenance === "restated_in_later_report";
        const keys = ["status", "value", "source_concept", ...(cover ? ["as_of"] : []),
            ...(ownReport ? [] : ["source_ref", "provenance"]), ...(restated ? ["restatement"] : [])];
        exactKeys(fact, keys, "Unknown verified statement fact property");
        if (!item.concepts.has(fact.source_concept)) throw new TypeError("Invalid verified statement fact concept");
        if (ownReport) {
            // No `source_ref`/`provenance`: the fiscal year's own annual report, `annual_report` provenance.
            if (year.annual_report_ref === null) throw new TypeError("Annual-report provenance without an annual report");
        } else {
            if (!ANNUAL_PROVENANCES.includes(fact.provenance) || fact.provenance === "annual_report" || cover)
                throw new TypeError("Invalid verified statement fact provenance");
            cite(fact.source_ref);
            if (fact.source_ref === year.annual_report_ref) throw new TypeError("Later-report provenance must cite a later filing");
        }
        if (restated) {
            const restatement = fact.restatement;
            if (!isRecord(restatement)) throw new TypeError("Invalid restatement");
            exactKeys(restatement, ["original_value", "original_source_concept", "original_source_ref"], "Unknown restatement property");
            if (!isStatementValue(item.unit, restatement.original_value) || restatement.original_value === fact.value
                || !item.concepts.has(restatement.original_source_concept)
                || restatement.original_source_ref !== year.annual_report_ref)
                throw new TypeError("Invalid restatement");
            cite(restatement.original_source_ref);
            if (sources[restatement.original_source_ref].filed_at >= sources[fact.source_ref].filed_at)
                throw new TypeError("A restatement must come from a later filing");
        }
        if (cover) {
            if (!isIsoDate(fact.as_of)) throw new TypeError("Invalid cover date");
            const days = spanDays(year.period_end, fact.as_of);
            if (days < 0 || days > COVER_DAYS_MAX) throw new TypeError("Cover date is not after the period end");
        }
        if (item.periodType === "duration" && year.period_start === null)
            throw new TypeError("Verified duration fact without a period start");
        return;
    }
    if (fact.status === "unverified_or_derived") {
        exactKeys(fact, ["status", "value", "reason"], "Unknown unverified statement fact property");
        if (!UNVERIFIED_REASONS.includes(fact.reason) || year.annual_report_ref === null)
            throw new TypeError("Invalid unverified statement fact");
        return;
    }
    throw new TypeError("Invalid statement fact status");
}

function validateYear(value, statement, annualByEnd, sources, used) {
    if (!isRecord(value)) throw new TypeError("Invalid statement year");
    exactKeys(value, ["fiscal_year", "fiscal_month", "period_start", "period_end", "annual_report_ref", "facts", "excluded"], "Unknown statement year property");
    const annualYear = annualByEnd.get(value.period_end);
    // A statement year is always a published annual year: same label, month, and annual report.
    if (!annualYear || value.fiscal_year !== annualYear.fiscal_year || value.fiscal_month !== annualYear.fiscal_month
        || value.annual_report_ref !== annualYear.annual_report_ref || !isRecord(value.facts) || !isRecord(value.excluded))
        throw new TypeError("Statement year does not match the annual history");
    if (annualYear.period_start !== null && value.period_start !== annualYear.period_start)
        throw new TypeError("Statement year start differs from the annual history");
    if (value.period_start !== null) {
        if (!isIsoDate(value.period_start)) throw new TypeError("Invalid statement period start");
        const days = spanDays(value.period_start, value.period_end);
        if (days < ANNUAL_DAYS_MIN || days > ANNUAL_DAYS_MAX) throw new TypeError("Annual period is not about one year");
    }
    if (value.annual_report_ref !== null) {
        if (!Object.hasOwn(sources, value.annual_report_ref)) throw new TypeError("Annual report reference is unknown");
        used.add(value.annual_report_ref);
    }
    const names = Object.keys(value.facts);
    if (names.length === 0) throw new TypeError("Statement year has no facts");
    for (const name of names) {
        if (!Object.hasOwn(STATEMENT_ITEMS, name) || STATEMENT_ITEMS[name].statement !== statement)
            throw new TypeError("Invalid statement fact name");
        validateFact(name, value.facts[name], value, sources, used);
    }
    for (const [name, reason] of Object.entries(value.excluded)) {
        if (!Object.hasOwn(STATEMENT_ITEMS, name) || STATEMENT_ITEMS[name].statement !== statement
            || Object.hasOwn(value.facts, name) || !EXCLUSION_REASONS.includes(reason))
            throw new TypeError("Invalid statement exclusion");
    }
}

/**
 * Validate one statement artifact against the validated annual history.
 * Every ticker must have an annual record, every year must be one of its
 * published years, and a filing cited by both must be the identical record.
 */
export function validateVerifiedStatementHistory(input, statement, annualHistory) {
    if (!STATEMENT_DETAIL_NAMES.includes(statement)) throw new TypeError("Unknown statement");
    if (!isRecord(input)) throw new TypeError("Invalid statement history");
    exactKeys(input, ["schema_version", "statement", "first_fiscal_year", "records"], "Unknown statement history property");
    if (input.schema_version !== "1.0" || input.statement !== statement
        || input.first_fiscal_year !== annualHistory.first_fiscal_year || !isRecord(input.records))
        throw new TypeError("Invalid statement history");
    for (const [ticker, record] of Object.entries(input.records)) {
        const annual = annualHistory.records[ticker];
        if (!annual || !isRecord(record)) throw new TypeError("Statement history ticker has no annual history");
        exactKeys(record, ["sources", "years"], "Unknown statement history record property");
        if (!isRecord(record.sources) || !Array.isArray(record.years) || record.years.length === 0)
            throw new TypeError("Invalid statement history record");
        const accessions = new Set();
        for (const [key, source] of Object.entries(record.sources)) {
            validateAnnualFilingSource(source, key);
            if (accessions.has(source.accession_number)) throw new TypeError("Statement filing listed twice");
            accessions.add(source.accession_number);
            const shared = annual.sources[key];
            if (shared && JSON.stringify(shared) !== JSON.stringify(source)) throw new TypeError("Statement filing differs from the annual filing record");
        }
        for (const source of Object.values(annual.sources)) {
            const own = Object.values(record.sources).find((candidate) => candidate.accession_number === source.accession_number);
            if (own && own.source_ref !== source.source_ref) throw new TypeError("Statement filing differs from the annual filing record");
        }
        const annualByEnd = new Map(annual.years.map((year) => [year.period_end, year]));
        const used = new Set();
        let previous = null;
        for (const year of record.years) {
            validateYear(year, statement, annualByEnd, record.sources, used);
            if (previous && year.period_end <= previous.period_end) throw new TypeError("Statement years must ascend without duplicates");
            previous = year;
        }
        if (used.size !== Object.keys(record.sources).length) throw new TypeError("Statement history lists an uncited filing");
    }
    return input;
}

/**
 * Validate all four statement artifacts together: each one alone, then the
 * duration start of a year must agree wherever more than one file states it.
 */
export function validateVerifiedStatementHistories(inputs, annualHistory) {
    if (!isRecord(inputs)) throw new TypeError("Invalid statement histories");
    exactKeys(inputs, STATEMENT_DETAIL_NAMES, "Unknown statement history");
    const starts = new Map();
    for (const statement of STATEMENT_DETAIL_NAMES) {
        const history = validateVerifiedStatementHistory(inputs[statement], statement, annualHistory);
        for (const [ticker, record] of Object.entries(history.records)) {
            for (const year of record.years) {
                if (year.period_start === null) continue;
                const key = `${ticker}|${year.period_end}`;
                if (starts.has(key) && starts.get(key) !== year.period_start) throw new TypeError("Statement year starts disagree");
                starts.set(key, year.period_start);
            }
        }
    }
    return inputs;
}

/** Number of published statement years per statement, for the manifest. */
export function countStatementYears(histories) {
    return Object.fromEntries(STATEMENT_DETAIL_NAMES.map((statement) => [statement,
        Object.values(histories[statement].records).reduce((total, record) => total + record.years.length, 0)]));
}
