/**
 * An independent bound on a sale, beside the pool quote: the NVDAx sold is
 * valued at the key-free Pyth reference price (`NVDA_REFERENCE_FEED`, one
 * underlying share in USD) times the Scaled UI multiplier in effect, the
 * same valuation Holdings uses (`@benten/pricing/value`). A sale passes only
 * when that value is within the per-sale limit plus its headroom and the
 * quoted USDC output is not below it by more than the tolerance.
 *
 * The price accounts are read through the same-origin read-only relay with
 * the price reader's own rules (`@benten/pricing/observe`): a receiver-owned,
 * fully verified update for that feed id, newest shard first, refused when
 * published in the future and judged stale on the prices API's bound. A
 * price that cannot be read, is stale or is not positive fails the sale
 * closed. Reads only; nothing is signed or sent.
 */

import { PublicKey } from "@solana/web3.js";
import { isStaleAt, observeFeedAccounts } from "@benten/pricing/observe";
import { referenceValue } from "@benten/pricing/value";

import { BPS_DENOMINATOR, PURCHASE_CONFIG } from "./config";
import { NVDA_REFERENCE_FEED, NVDAX_DECIMALS, USDC_DECIMALS } from "./route";
import type { RelayConnection } from "./rpc";

/** One reference price as Pyth publishes it: `priceRaw x 10^exponent` USD, at `publishTime` (Unix seconds). */
export interface ReferencePrice {
  priceRaw: bigint;
  exponent: number;
  publishTime: number;
}

export type ReferencePriceRead = { ok: true; price: ReferencePrice } | { ok: false; reason: string };

type PriceAccount = { owner: string; data: Uint8Array } | null;

/** Judge the read price accounts (in `NVDA_REFERENCE_FEED.priceAccounts` order) at `nowMs`. */
export function referencePriceOf(accounts: ReadonlyArray<PriceAccount>, nowMs: number): ReferencePriceRead {
  const observation = observeFeedAccounts(NVDA_REFERENCE_FEED, accounts, nowMs);
  if (!observation.ok) return { ok: false, reason: observation.reason };
  const { update } = observation;
  const publishTime = Number(update.publishTime);
  if (isStaleAt(publishTime, nowMs)) return { ok: false, reason: "stale" };
  if (update.price <= 0n) return { ok: false, reason: "not_positive" };
  return { ok: true, price: { priceRaw: update.price, exponent: update.exponent, publishTime } };
}

/** Read the NVDA/USD reference price through the relay. A relay failure throws, like every other preview read. */
export async function readNvdaReferencePrice(relay: RelayConnection, now: () => number): Promise<ReferencePriceRead> {
  const infos = await relay.connection.getMultipleAccountsInfo(NVDA_REFERENCE_FEED.priceAccounts.map((ref) => new PublicKey(ref.address)));
  const accounts = NVDA_REFERENCE_FEED.priceAccounts.map((_, index) => {
    const info = infos[index];
    return info ? { owner: info.owner.toBase58(), data: Uint8Array.from(info.data) } : null;
  });
  return referencePriceOf(accounts, now());
}

export interface SaleReferenceInput {
  /** NVDAx sold, raw units (8 decimals). */
  nvdaxInRaw: bigint;
  /** The Scaled UI multiplier the sale amount was converted with (decimal string). */
  multiplier: string;
  /** The pool's quoted USDC output, raw units (6 decimals). */
  usdcOutRaw: bigint;
  price: ReferencePrice;
}

/**
 * `null` when the sale passes both reference checks, otherwise the reason.
 * Exact on `bigint`: with the value `V = digits / 10^scale` USD, the limit
 * `L` and the quote `Q` in raw USDC, it requires
 * `V x 10^6 <= L x (1 + headroom)` and `Q >= V x 10^6 x (1 - tolerance)`.
 */
export function saleReferenceFailure(input: SaleReferenceInput): string | null {
  const valued = referenceValue(
    { rawAmount: input.nvdaxInRaw.toString(), decimals: NVDAX_DECIMALS, hasScaledUiAmount: true, scaledUiMultiplier: input.multiplier },
    { price_raw: input.price.priceRaw.toString(), exponent: input.price.exponent },
  );
  if (valued.status !== "valued") return `reference value unavailable: ${valued.reason}`;
  const bps = BigInt(BPS_DENOMINATOR);
  const scale = 10n ** BigInt(valued.exact.scale);
  // The reference value in raw USDC units, still over 10^scale: V x 10^6 = valueRaw / scale.
  const valueRaw = valued.exact.digits * 10n ** BigInt(USDC_DECIMALS);
  const headroom = BigInt(PURCHASE_CONFIG.saleReferenceValueHeadroomBps);
  if (valueRaw * bps > PURCHASE_CONFIG.maxUsdcOutRaw * scale * (bps + headroom)) {
    return `the NVDAx sold is worth ${valued.value} USD at the reference price, above the per-sale limit`;
  }
  const tolerance = BigInt(PURCHASE_CONFIG.saleReferenceToleranceBps);
  if (input.usdcOutRaw * scale * bps < valueRaw * (bps - tolerance)) {
    return `the pool quotes ${input.usdcOutRaw} raw USDC, below the reference value of ${valued.value} USD by more than the tolerance`;
  }
  return null;
}
