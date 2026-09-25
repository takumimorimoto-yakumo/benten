/**
 * Living Catalog fixtures for the Holdings tab (development only; imported by
 * `routes/dev-portfolio-fixture.tsx`). Mints are the registry's own, so rows
 * carry real labels; the wallet, token accounts, amounts, slots and prices
 * are placeholders, not observations.
 */
import { FEED_MAP, PRICING_CONFIG, feedEntry } from "@benten/pricing";
import { valuationFeedForMint, type PriceRead, type PythPriceResult } from "@/features/pricing";
import type { HoldingsObservation, HoldingsReason, ProductHolding } from "@benten/holdings/read-holdings";
import { encodeBase58 } from "@benten/purchase/base58";
import { SUPPORTED_PRODUCTS, TOKEN_2022_PROGRAM_ADDRESS } from "@benten/solana/supported-products";
import { buildHoldingsView, type HoldingsProduct } from "./holdings-model";
import type { HoldingsScreen } from "./holdings-view";
import { HOLDINGS_FIXTURE_NAMES } from "../../lib/portfolio-fixture-names";

export { HOLDINGS_FIXTURE_NAMES };

/** The specimen clock: every fixture time is relative to it. */
export const FIXTURE_NOW_MS = Date.UTC(2026, 8, 24, 5, 35, 12);
const SECOND_MS = 1000;
/** A weekend gap: the US equity feed last published two days before the read. */
const WEEKEND_SECONDS = 2 * 24 * 60 * 60;
/** Seconds between the fixture price's publish time and the read. */
const FRESH_AGE_SECONDS = 7;

/** Placeholder public keys (not anyone's wallet). */
export const FIXTURE_WALLET = encodeBase58(new Uint8Array(32).fill(7));
const FIXTURE_ACCOUNT = (seed: number) => encodeBase58(new Uint8Array(32).fill(seed));

const NVDAX = [...SUPPORTED_PRODUCTS.values()].find((product) => product.kind === "xstock" && product.ticker === "NVDA")!;
/** A PreStocks instrument that the reviewed feed map has no feed for. */
const PRESTOCKS_NO_FEED = [...SUPPORTED_PRODUCTS.values()].find((product) => product.kind === "prestocks" && product.providerAssetId === "SPACEX")!;

function holding(product: typeof NVDAX, overrides: Partial<ProductHolding>): ProductHolding {
  return {
    mint: product.mint,
    product,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    accounts: [FIXTURE_ACCOUNT(product.kind === "xstock" ? 11 : 12)],
    rawAmount: "0",
    decimals: 8,
    hasScaledUiAmount: false,
    scaledUiMultiplier: null,
    displayAmount: null,
    frozenAccounts: 0,
    delegatedAccounts: 0,
    ...overrides,
  };
}

const NVDAX_HOLDING = holding(NVDAX, { rawAmount: "4419820", hasScaledUiAmount: true, scaledUiMultiplier: "1", displayAmount: "0.0441982" });
const PRESTOCKS_HOLDING = holding(PRESTOCKS_NO_FEED, { rawAmount: "2500000000", decimals: 9, displayAmount: "2.5" });

function observation(
  holdings: ProductHolding[],
  other: number,
  status: "available" | "partial" = "available",
  unreadable = 0,
  reason: HoldingsReason = "mint_unavailable",
): Extract<HoldingsObservation, { status: "available" | "partial" }> {
  const observedAt = FIXTURE_NOW_MS - SECOND_MS;
  return {
    status,
    reason: status === "partial" ? reason : null,
    owner: FIXTURE_WALLET,
    requestedAt: observedAt - SECOND_MS,
    observedAt,
    holdingsSlots: { splToken: "369412345", token2022: "369412346" },
    metadataSlot: "369412346",
    clockSlot: "369412346",
    chainUnixTimestamp: String(Math.floor(observedAt / SECOND_MS)),
    holdings,
    coverage: { tokenAccounts: holdings.length + other, productAccounts: holdings.length, otherAccounts: other, unreadableAccounts: unreadable },
  };
}

function price(ageSeconds: number): PythPriceResult {
  const feed = valuationFeedForMint(NVDAX.mint)!;
  const account = feedEntry(feed.feed_id)!.price_accounts[0]!.address;
  const publishUnix = Math.floor(FIXTURE_NOW_MS / SECOND_MS) - ageSeconds;
  return {
    kind: "pyth_reference",
    feed_id: feed.feed_id,
    pyth_symbol: feed.pyth_symbol,
    role: feed.role,
    observed_at: new Date(FIXTURE_NOW_MS).toISOString(),
    status: ageSeconds > PRICING_CONFIG.staleAfterSeconds ? "stale" : "fresh",
    price: "182.41",
    confidence: "0.05",
    exponent: -5,
    price_raw: "18241000",
    confidence_raw: "5000",
    currency: "USD",
    publish_time: new Date(publishUnix * SECOND_MS).toISOString(),
    publish_time_unix: publishUnix,
    stale_after_seconds: PRICING_CONFIG.staleAfterSeconds,
    source: { network: "solana-mainnet", program: FEED_MAP.source.receiver_program, account, shard: 0, posted_slot: "369412300", verification: "full" },
    not_quote: true,
  };
}

/** Price reads as the shared client returns them, read at the fixture clock. */
export function fixtureReads(prices: readonly PythPriceResult[]): ReadonlyMap<string, PriceRead> {
  return new Map(prices.map((entry) => [entry.feed_id, { result: entry, readAtMs: FIXTURE_NOW_MS }]));
}

export type HoldingsFixtureName = (typeof HOLDINGS_FIXTURE_NAMES)[number];

/** The screen of one fixture; `null` for `not-connected`, which is the real prerendered page. */
export function holdingsFixture(name: HoldingsFixtureName, products: ReadonlyMap<string, HoldingsProduct>): HoldingsScreen | null {
  const read = (obs: ReturnType<typeof observation>, prices: PythPriceResult[], extra: Partial<Extract<HoldingsScreen, { kind: "read" }>> = {}): HoldingsScreen => ({
    kind: "read",
    observation: obs,
    view: buildHoldingsView(obs, products, fixtureReads(prices), FIXTURE_NOW_MS),
    prices: "loaded",
    stale: false,
    reading: false,
    ...extra,
  });
  switch (name) {
    case "not-connected":
      return null;
    case "reading":
      return { kind: "not-read", reading: true };
    case "not-read":
      return { kind: "not-read", reading: false };
    case "none-held":
      return read(observation([], 2), []);
    case "nvdax-fresh":
      return read(observation([NVDAX_HOLDING], 3), [price(FRESH_AGE_SECONDS)]);
    case "nvdax-stale":
      return read(observation([NVDAX_HOLDING], 3), [price(WEEKEND_SECONDS)]);
    case "prestocks-no-feed":
      return read(observation([NVDAX_HOLDING, PRESTOCKS_HOLDING], 3), [price(FRESH_AGE_SECONDS)]);
    case "other-unreadable":
      return read(observation([NVDAX_HOLDING], 4, "available", 1), [price(FRESH_AGE_SECONDS)]);
    case "unidentified":
      return read(observation([NVDAX_HOLDING], 4, "partial", 2, "unidentified_accounts"), [price(FRESH_AGE_SECONDS)]);
    case "partial":
      return read(observation([{ ...NVDAX_HOLDING, decimals: null, hasScaledUiAmount: null, displayAmount: null }], 1, "partial"), [price(FRESH_AGE_SECONDS)]);
    case "error":
      return { kind: "unavailable", reason: "rate_limited", reading: false };
    case "account-limit":
      return { kind: "unavailable", reason: "account_limit", reading: false };
    case "stale-read":
      return read(observation([NVDAX_HOLDING], 3), [price(FRESH_AGE_SECONDS)], { stale: true });
  }
}
