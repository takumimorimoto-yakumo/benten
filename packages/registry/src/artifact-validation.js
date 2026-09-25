const FACT_NAMES = new Set([
    "revenue", "net_income_parent", "total_assets", "total_liabilities", "operating_cf",
]);
const DURATION_FACTS = new Set(["revenue", "net_income_parent", "operating_cf"]);
const INSTANT_FACTS = new Set(["total_assets", "total_liabilities"]);
const SUPPORTED_CONCEPTS = {
    revenue: new Set([
        "us-gaap:Revenues",
        "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
        "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax",
    ]),
    net_income_parent: new Set(["us-gaap:NetIncomeLoss"]),
    total_assets: new Set(["us-gaap:Assets"]),
    total_liabilities: new Set(["us-gaap:Liabilities"]),
    operating_cf: new Set(["us-gaap:NetCashProvidedByUsedInOperatingActivities"]),
};
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
function isIsoDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function isIsoTimestamp(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value))
        return false;
    const date = new Date(value);
    return !Number.isNaN(date.valueOf()) && date.toISOString() === value.replace("Z", ".000Z");
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
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(",")}]`;
    if (isRecord(value))
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
}
function validateSource(value) {
    if (!isRecord(value))
        throw new TypeError("Invalid filing source");
    exactKeys(value, ["source_ref", "form", "accession_number", "filed_at", "filing_url", "source_authority"], "Unknown filing source property");
    if (typeof value.source_ref !== "string" || value.source_ref.length < 1 || value.source_ref.length > 128
        || value.form !== "10-K"
        || typeof value.accession_number !== "string" || !/^\d{10}-\d{2}-\d{6}$/.test(value.accession_number)
        || !isIsoDate(value.filed_at)
        || !isCanonicalSecFilingUrl(value.filing_url, value.accession_number)
        || value.source_authority !== "SEC EDGAR")
        throw new TypeError("Invalid filing source");
    return value;
}
function validatePeriod(value, key) {
    if (!isRecord(value))
        throw new TypeError("Invalid verified period");
    exactKeys(value, ["period_ref", "fiscal_year", "fiscal_month", "period_kind", "fact_period_type", "period_start", "period_end"], "Unknown verified period property");
    if (value.period_ref !== key
        || !Number.isInteger(value.fiscal_year) || value.fiscal_year < 1900 || value.fiscal_year > 3000
        || !Number.isInteger(value.fiscal_month) || value.fiscal_month < 1 || value.fiscal_month > 12
        || value.period_kind !== "FY"
        || (value.fact_period_type !== "duration" && value.fact_period_type !== "instant")
        || !isIsoDate(value.period_end))
        throw new TypeError("Invalid verified period");
    if (value.fact_period_type === "duration") {
        if (!isIsoDate(value.period_start) || value.period_start > value.period_end)
            throw new TypeError("Invalid duration period");
    }
    else if (value.period_start !== null) {
        throw new TypeError("Invalid instant period");
    }
    return value;
}
function validateFactSet(value) {
    if (!isRecord(value))
        throw new TypeError("Invalid verified fact set");
    exactKeys(value, ["kind", "periods", "source_refs", "facts"], "Unknown verified fact-set property");
    if (value.kind !== "source_verified" || !isRecord(value.periods) || !isRecord(value.source_refs) || !isRecord(value.facts)) {
        throw new TypeError("Invalid verified fact set");
    }
    const periods = Object.fromEntries(Object.entries(value.periods).map(([key, period]) => [key, validatePeriod(period, key)]));
    const sourceRefs = Object.fromEntries(Object.entries(value.source_refs).map(([key, source]) => {
        const checked = validateSource(source);
        if (checked.source_ref !== key)
            throw new TypeError("Source reference key mismatch");
        return [key, checked];
    }));
    const facts = {};
    for (const [name, rawFact] of Object.entries(value.facts)) {
        if (!FACT_NAMES.has(name) || !isRecord(rawFact))
            throw new TypeError("Invalid verified fact name");
        exactKeys(rawFact, ["kind", "value", "currency", "unit", "scale", "period_ref", "source_ref", "source_concept"], "Unknown verified fact property");
        if (rawFact.kind !== "verified_reported"
            || !Number.isSafeInteger(rawFact.value)
            || rawFact.currency !== "USD"
            || rawFact.unit !== "currency"
            || rawFact.scale !== 1
            || typeof rawFact.period_ref !== "string" || !Object.hasOwn(periods, rawFact.period_ref)
            || typeof rawFact.source_ref !== "string" || !Object.hasOwn(sourceRefs, rawFact.source_ref)
            || typeof rawFact.source_concept !== "string" || !SUPPORTED_CONCEPTS[name].has(rawFact.source_concept))
            throw new TypeError("Invalid verified fact");
        const factName = name;
        const period = periods[rawFact.period_ref];
        if ((DURATION_FACTS.has(factName) && period.fact_period_type !== "duration") || (INSTANT_FACTS.has(factName) && period.fact_period_type !== "instant")) {
            throw new TypeError("Verified fact period type mismatch");
        }
        facts[factName] = rawFact;
    }
    if (Object.keys(facts).length === 0)
        throw new TypeError("Verified fact set is empty");
    return { kind: "source_verified", periods, source_refs: sourceRefs, facts };
}
export function validateVerifiedOverlay(input, eligibleTickers) {
    if (!isRecord(input))
        throw new TypeError("Invalid verified overlay");
    exactKeys(input, ["schema_version", "records"], "Unknown verified overlay property");
    if (input.schema_version !== "2.0" || !isRecord(input.records))
        throw new TypeError("Invalid verified overlay");
    const records = {};
    for (const [ticker, rawRecord] of Object.entries(input.records)) {
        if (!/^[A-Z0-9.-]{1,16}$/.test(ticker) || (eligibleTickers && !eligibleTickers.has(ticker)) || !isRecord(rawRecord)) {
            throw new TypeError("Invalid verified overlay ticker");
        }
        exactKeys(rawRecord, ["identity", "fundamentals", "statements"], "Unknown verified overlay record property");
        if (!isRecord(rawRecord.identity) || !isRecord(rawRecord.statements))
            throw new TypeError("Invalid verified overlay record");
        exactKeys(rawRecord.identity, ["underlying_company", "source"], "Unknown verified identity property");
        exactKeys(rawRecord.statements, ["pl", "bs", "cf"], "Unknown verified statements property");
        if (typeof rawRecord.identity.underlying_company !== "string" || rawRecord.identity.underlying_company.length < 1 || rawRecord.identity.underlying_company.length > 512) {
            throw new TypeError("Invalid underlying company");
        }
        const source = validateSource(rawRecord.identity.source);
        const optionalSet = (candidate) => candidate === null ? null : validateFactSet(candidate);
        records[ticker] = {
            identity: { underlying_company: rawRecord.identity.underlying_company, source },
            fundamentals: optionalSet(rawRecord.fundamentals),
            statements: {
                pl: optionalSet(rawRecord.statements.pl),
                bs: optionalSet(rawRecord.statements.bs),
                cf: optionalSet(rawRecord.statements.cf),
            },
        };
        const fundamentals = records[ticker].fundamentals;
        const allSets = [fundamentals, records[ticker].statements.pl, records[ticker].statements.bs, records[ticker].statements.cf].filter(Boolean);
        const periodDefinitions = new Map();
        const sourceDefinitions = new Map([[source.source_ref, canonicalJson(source)]]);
        for (const set of allSets) {
            for (const [ref, period] of Object.entries(set.periods)) {
                const definition = canonicalJson(period);
                if (periodDefinitions.has(ref) && periodDefinitions.get(ref) !== definition)
                    throw new TypeError("Period reference definition diverges");
                periodDefinitions.set(ref, definition);
            }
            for (const [ref, filing] of Object.entries(set.source_refs)) {
                const definition = canonicalJson(filing);
                if (sourceDefinitions.has(ref) && sourceDefinitions.get(ref) !== definition)
                    throw new TypeError("Source reference definition diverges");
                sourceDefinitions.set(ref, definition);
            }
        }
        if (fundamentals) {
            const statementForFact = {
                revenue: "pl",
                net_income_parent: "pl",
                total_assets: "bs",
                total_liabilities: "bs",
                operating_cf: "cf",
            };
            for (const [name, fact] of Object.entries(fundamentals.facts)) {
                const statementFact = records[ticker].statements[statementForFact[name]]?.facts[name];
                const statementSet = records[ticker].statements[statementForFact[name]];
                const expandedFundamental = { fact, period: fundamentals.periods[fact.period_ref], source: fundamentals.source_refs[fact.source_ref] };
                const expandedStatement = statementFact && statementSet
                    ? { fact: statementFact, period: statementSet.periods[statementFact.period_ref], source: statementSet.source_refs[statementFact.source_ref] }
                    : null;
                if (!expandedStatement || canonicalJson(expandedStatement) !== canonicalJson(expandedFundamental)) {
                    throw new TypeError("Fundamentals and statement verified facts diverge");
                }
            }
        }
    }
    return { schema_version: "2.0", records };
}
const STATEMENT_HASH_KEYS = ["pl", "bs", "cf", "per_share"];
const MANIFEST_KEYS_2_1 = [
    "schema_version", "artifact_revision", "published_at", "registry_as_of", "registry_source_url",
    "financial_source_authority", "registry_snapshot_sha256", "legacy_financial_snapshot_sha256",
    "verified_overlay_sha256", "verified_annual_sha256", "record_counts",
];
const COUNT_KEYS_2_1 = ["registry", "eligible", "snapshot_available", "source_verified", "annual_years"];
function validateManifestShape(input, withStatements) {
    if (!isRecord(input))
        throw new TypeError("Invalid snapshot manifest");
    exactKeys(input, withStatements ? [...MANIFEST_KEYS_2_1, "verified_statements_sha256"] : MANIFEST_KEYS_2_1, "Unknown snapshot manifest property");
    if (!isRecord(input.record_counts))
        throw new TypeError("Invalid snapshot manifest counts");
    exactKeys(input.record_counts, withStatements ? [...COUNT_KEYS_2_1, "statement_years"] : COUNT_KEYS_2_1, "Unknown snapshot manifest count");
    const hashes = [input.registry_snapshot_sha256, input.legacy_financial_snapshot_sha256, input.verified_overlay_sha256, input.verified_annual_sha256];
    if (withStatements) {
        if (!isRecord(input.verified_statements_sha256))
            throw new TypeError("Invalid snapshot manifest statement hashes");
        exactKeys(input.verified_statements_sha256, STATEMENT_HASH_KEYS, "Unknown snapshot manifest statement hash");
        hashes.push(...STATEMENT_HASH_KEYS.map((key) => input.verified_statements_sha256[key]));
    }
    const counts = Object.values(input.record_counts);
    if (input.schema_version !== "2.0"
        || typeof input.artifact_revision !== "string" || input.artifact_revision.length < 1 || input.artifact_revision.length > 128
        || !isIsoTimestamp(input.published_at)
        || !isIsoDate(input.registry_as_of)
        || input.registry_source_url !== "https://docs.xstocks.fi/developers"
        || input.financial_source_authority !== "SEC EDGAR"
        || hashes.some((hash) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
        || counts.some((count) => !Number.isSafeInteger(count) || count < 0))
        throw new TypeError("Invalid snapshot manifest");
    return input;
}
/** Validate the current manifest (revision 2.2: statement artifact hashes and year count). */
export function validateSnapshotManifest(input) {
    return validateManifestShape(input, true);
}
/** Validate a manifest published before the statement artifacts (revision 2.1); comparison baselines only. */
export function validateSnapshotManifestBeforeStatements(input) {
    return validateManifestShape(input, false);
}
