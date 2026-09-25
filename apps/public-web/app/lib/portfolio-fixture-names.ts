/**
 * Names of the Holdings and Activity Living Catalog fixture pages
 * (`/_catalog/portfolio/<tab>-<name>`, development only). Constants only, so
 * react-router.config.ts can list their paths without loading the fixtures.
 */
export const HOLDINGS_FIXTURE_NAMES = [
  "not-connected", "reading", "not-read", "none-held", "nvdax-fresh", "nvdax-stale", "prestocks-no-feed", "other-unreadable", "unidentified", "partial", "error", "account-limit", "stale-read",
] as const;

export const ACTIVITY_FIXTURE_NAMES = ["empty", "records", "unavailable"] as const;

export const PORTFOLIO_FIXTURE_PATHS: readonly string[] = [
  ...HOLDINGS_FIXTURE_NAMES.map((name) => `/_catalog/portfolio/holdings-${name}`),
  ...ACTIVITY_FIXTURE_NAMES.map((name) => `/_catalog/portfolio/activity-${name}`),
];
