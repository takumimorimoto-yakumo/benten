/**
 * The single place for static-page constants, and the facts the pages state,
 * each read from the config module that owns it (freshness windows, record
 * limit, rate-limit window), so a page never restates a value by hand.
 */
import { PRICING_CONFIG } from "@benten/pricing/config";
import { RATE_LIMIT_WINDOW_MS } from "@benten/solana-rpc-relay/config";
import { ACTIVITY_CONFIG } from "@/features/activity/activity-config";
import { PRICE_DISPLAY_CONFIG } from "@/features/pricing/price-config";
import type { PageFacts, PageSourceKey } from "@/i18n/pages-messages";

export const STATIC_PAGE_CONFIG = {
  /**
   * The public source repository, linked from About (`Open source`). While
   * `null` About states the license without a link.
   */
  sourceRepositoryUrl: "https://github.com/takumimorimoto-yakumo/benten" as string | null,
  /**
   * The issuer's own documents that the learn pages cite, read 2026-09-24.
   * Titles are the documents' own English names and are not translated.
   */
  sources: {
    "xstocks-legal-overview": { title: "xStocks: Product Legal Overview", url: "https://docs.xstocks.fi/docs/product-legal-overview" },
    "backed-restricted-countries": { title: "Backed Assets: Restricted Countries", url: "https://assets.backed.fi/legal-documentation/restricted-countries" },
    "xstocks-multipliers": { title: "xStocks: Multipliers", url: "https://docs.xstocks.fi/developers/multipliers" },
  } satisfies Record<PageSourceKey, { readonly title: string; readonly url: string }>,
} as const;

const MS_PER_SECOND = 1_000;
const BPS_PER_PERCENT = 100;

export const PAGE_FACTS: PageFacts = {
  staleAfterSeconds: PRICING_CONFIG.staleAfterSeconds,
  maxDisplayAgeHours: PRICE_DISPLAY_CONFIG.maxDisplayAgeHours,
  maxValueConfidencePercent: String(PRICE_DISPLAY_CONFIG.maxValueConfidenceBps / BPS_PER_PERCENT),
  activityMaxRecords: ACTIVITY_CONFIG.maxRecords,
  rateLimitWindowSeconds: RATE_LIMIT_WINDOW_MS / MS_PER_SECOND,
};
