/**
 * Prepare one sale preview in the browser (NVDAx in, USDC out, the purchase
 * route reversed): read the route mints and the Pyth reference price, refuse
 * a multiplier other than the one the amount was converted with, build the
 * unsigned exact-in sale, bound its amounts, check the quote against the
 * reference value (`reference-price.ts`; without a usable reference price
 * the preview fails as `referenceUnavailable`), audit the exact wire bytes
 * (decoded as a legacy transaction only) and run an unsigned simulation. Only a preview that
 * passes all of them reaches `reviewReady`; its audited bytes are what the
 * wallet is later asked to approve.
 *
 * Reads only, through the same-origin relay. Nothing is signed or sent here.
 */

import { PublicKey, VersionedTransaction } from "@solana/web3.js";

import { buildNvdaxSellExactIn, QuoteOverLimitError, readSellCap } from "./build-sell";
import { PURCHASE_CONFIG } from "./config";
import type { PreviewOutcome } from "./preview";
import { previewExpiry } from "./purchase-machine";
import { InvalidSwapInputError, RoutePoolMismatchError } from "./quote";
import { USDC_DECIMALS } from "./route";
import { SELL_ROUTE } from "./routes-table";
import { readNvdaReferencePrice, saleReferenceCheck, saleReferenceFailure } from "./reference-price";
import { createRelayConnection, multiplierReading, readRouteMints, relayFailureOf, type RelayConnection } from "./rpc";
import { classifySimulationError } from "./simulation";
import { transactionErrorCode } from "./tracker";
import { auditSellWire, sellAmountFailure } from "./tx-allowlist";

const ROUTE_MINTS_DIFFER = "route mint decimals or token program differ from the verified route";
const MULTIPLIER_UNAVAILABLE = "the NVDAx display multiplier could not be read";

function sellFailure(error: unknown, relay: RelayConnection): PreviewOutcome {
  const failure = relayFailureOf(error, relay);
  if (failure === "rateLimited") return { ok: false, failure: "relayBusy", details: null, createsNvdaxAccount: false };
  if (failure === "unavailable") return { ok: false, failure: "relayUnavailable", details: null, createsNvdaxAccount: false };
  if (error instanceof RoutePoolMismatchError) return { ok: false, failure: "routeCheck", details: error.message, createsNvdaxAccount: false };
  if (error instanceof QuoteOverLimitError) return { ok: false, failure: "overLimit", details: error.usdcOutRaw.toString(), createsNvdaxAccount: false };
  if (error instanceof InvalidSwapInputError) return { ok: false, failure: "simulationFailed", details: error.message, createsNvdaxAccount: false };
  return { ok: false, failure: "simulationFailed", details: error instanceof Error ? error.message : null, createsNvdaxAccount: false };
}

export type SellTermsOutcome = { ok: true; multiplier: string; capRaw: bigint } | { ok: false };

/**
 * What the sale field is checked against: the NVDAx display multiplier in
 * effect now (from the mint account) and the cap, the NVDAx amount the pool
 * quotes at the USDC limit. Reads only.
 */
export async function readSellTerms(now: () => number = Date.now): Promise<SellTermsOutcome> {
  const relay = createRelayConnection();
  try {
    const mints = await readRouteMints(relay, SELL_ROUTE.ticker);
    if (!mints || mints.usdc.decimals !== USDC_DECIMALS || mints.nvdax.decimals !== SELL_ROUTE.decimals) return { ok: false };
    const multiplier = multiplierReading(mints.nvdax, now());
    if (!multiplier) return { ok: false };
    const capRaw = await readSellCap(relay.connection, PURCHASE_CONFIG.maxUsdcOutRaw);
    return capRaw > 0n ? { ok: true, multiplier: multiplier.value, capRaw } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * `inputMultiplier` is the multiplier of the sale terms the NVDAx field was
 * converted with (display to raw). A different multiplier in effect now
 * fails the preview as `sellTermsChanged`, so the terms are read again and
 * the amount converted anew; a raw amount is never valued at another rate.
 */
export async function prepareSellPreview(walletAddress: string, nvdaxInRaw: bigint, inputMultiplier: string, now: () => number = Date.now): Promise<PreviewOutcome> {
  const relay = createRelayConnection();
  try {
    const [mints, reference] = await Promise.all([readRouteMints(relay, SELL_ROUTE.ticker), readNvdaReferencePrice(relay, now)]);
    if (!mints || mints.usdc.decimals !== USDC_DECIMALS || mints.nvdax.decimals !== SELL_ROUTE.decimals) {
      return { ok: false, failure: "routeCheck", details: ROUTE_MINTS_DIFFER, createsNvdaxAccount: false };
    }
    const nvdaxMultiplier = multiplierReading(mints.nvdax, now());
    if (!nvdaxMultiplier) return { ok: false, failure: "routeCheck", details: MULTIPLIER_UNAVAILABLE, createsNvdaxAccount: false };
    if (nvdaxMultiplier.value !== inputMultiplier) {
      return { ok: false, failure: "sellTermsChanged", details: `multiplier ${inputMultiplier} is now ${nvdaxMultiplier.value}`, createsNvdaxAccount: false };
    }
    // Fail closed without a usable reference price: the sale is never bounded by the pool quote alone.
    if (!reference.ok) return { ok: false, failure: "referenceUnavailable", details: reference.reason, createsNvdaxAccount: false };

    const built = await buildNvdaxSellExactIn({
      connection: relay.connection,
      userPublicKey: new PublicKey(walletAddress),
      nvdaxInRaw,
      slippageBps: PURCHASE_CONFIG.slippageBps,
      maxUsdcOutRaw: PURCHASE_CONFIG.maxUsdcOutRaw,
    });
    const usdcOutRaw = BigInt(built.quote.outputRaw);
    const minimumUsdcOutRaw = BigInt(built.quote.minimumOutputRaw);
    // Bound the reviewed amounts independently of the builder's own limit check.
    const amountFailure = sellAmountFailure({ inputRaw: nvdaxInRaw, usdcOutRaw, minimumUsdcOutRaw });
    if (amountFailure) return { ok: false, failure: "routeCheck", details: amountFailure, createsNvdaxAccount: false };
    const referenceInput = { nvdaxInRaw, multiplier: nvdaxMultiplier.value, usdcOutRaw, price: reference.price };
    const referenceFailure = saleReferenceFailure(referenceInput);
    if (referenceFailure) return { ok: false, failure: "routeCheck", details: referenceFailure, createsNvdaxAccount: false };
    const wireTransaction = Uint8Array.from(built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));

    // Audit the exact bytes the wallet would receive, not the builder's object.
    const audit = auditSellWire(wireTransaction, {
      user: walletAddress,
      inputRaw: nvdaxInRaw,
      usdcOutRaw,
      minimumUsdcOutRaw,
      binArrayIndexes: built.binArrayIndexes,
      hasBitmapExtension: built.hasBitmapExtension,
    });
    if (!audit.ok) return { ok: false, failure: "routeCheck", details: audit.reason, createsNvdaxAccount: false };

    const simulation = await relay.connection.simulateTransaction(VersionedTransaction.deserialize(wireTransaction), {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });
    if (simulation.value.err !== null && simulation.value.err !== undefined) {
      return {
        ok: false,
        failure: classifySimulationError(simulation.value.err, simulation.value.logs),
        details: transactionErrorCode(simulation.value.err),
        createsNvdaxAccount: false,
      };
    }

    const builtAt = now();
    return {
      ok: true,
      preview: {
        walletAddress,
        side: "sell",
        product: SELL_ROUTE.ticker,
        payToken: "USDC",
        firstLeg: null,
        inputRaw: nvdaxInRaw,
        consumedInputRaw: BigInt(built.quote.consumedInputRaw),
        outputRaw: usdcOutRaw,
        minimumOutputRaw: minimumUsdcOutRaw,
        feeRaw: BigInt(built.quote.feeRaw),
        protocolFeeRaw: BigInt(built.quote.protocolFeeRaw),
        feeOnInput: built.quote.feeOnInput,
        priceImpactPct: built.quote.priceImpactPct,
        builtAt,
        expiresAt: previewExpiry(builtAt),
        nvdaxMultiplier,
        createsNvdaxAccount: false,
        createsUsdcAccount: audit.createsUsdcAccount,
        // Display only: what the reference check above was run against.
        saleReference: saleReferenceCheck(referenceInput),
        lastValidBlockHeight: built.lastValidBlockHeight,
        wireTransaction,
      },
    };
  } catch (error) {
    return sellFailure(error, relay);
  }
}
