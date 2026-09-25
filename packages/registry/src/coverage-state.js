/** A capability is usable when either immutable source carries that capability. */
export function availabilityFromSources(legacyPresent, verifiedPresent) {
  return legacyPresent || verifiedPresent ? "available" : "no_data";
}

export function verifiedRecordHasFacts(record) {
  return Boolean(record) && [record.fundamentals, record.statements.pl, record.statements.bs, record.statements.cf]
    .some((set) => set !== null && Object.keys(set.facts).length > 0);
}

/** Derive all capability states from the same legacy/verified union used at runtime. */
export function coverageAvailabilityFromRecords(legacyFundamentals, legacyFinancials, verifiedRecord) {
  return {
    snapshot_status: availabilityFromSources(Boolean(legacyFundamentals), Boolean(verifiedRecord?.fundamentals)),
    capabilities: {
      fundamentals: availabilityFromSources(Boolean(legacyFundamentals), Boolean(verifiedRecord?.fundamentals)),
      pl: availabilityFromSources(Boolean(legacyFinancials?.statements.pl), Boolean(verifiedRecord?.statements.pl)),
      bs: availabilityFromSources(Boolean(legacyFinancials?.statements.bs), Boolean(verifiedRecord?.statements.bs)),
      cf: availabilityFromSources(Boolean(legacyFinancials?.statements.cf), Boolean(verifiedRecord?.statements.cf)),
    },
  };
}

export function countAvailableFundamentals(registry, legacyFundamentals, overlayRecords) {
  return registry.filter((entry) => Boolean(legacyFundamentals[entry.ticker] || overlayRecords[entry.ticker]?.fundamentals)).length;
}
