import { ARTIFACT_REVISION } from "@benten/registry";

export const DISCLAIMER =
  "Factual data only. Not investment advice, a recommendation, or a valuation.";

export const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json",
  "x-benten-artifact-revision": ARTIFACT_REVISION,
} as const;

export const ALLOW = "GET, HEAD, OPTIONS";
