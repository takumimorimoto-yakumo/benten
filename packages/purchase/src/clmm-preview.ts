/**
 * Swap preview of a product bought through its pinned Raydium CLMM pool:
 * read the route mints (and the pay mint), build the unsigned transaction
 * (`clmm-build.ts`), audit the exact wire bytes (`clmm-audit.ts`), and run an
 * unsigned simulation. Only a preview that passes all of them reaches the
 * panel; its audited bytes are what the wallet is later asked to approve.
 *
 * Loaded by `preview.ts` on demand, only for a CLMM product, so a DLMM
 * product's page never loads it. Reads only, through the same-origin relay.
 * Nothing is signed or sent here.
 */

import { PublicKey, VersionedTransaction } from "@solana/web3.js";

import { auditClmmSwapTransaction, auditClmmTwoLegTransaction } from "./clmm-audit";
import { buildClmmUsdcExactInSwap } from "./clmm-build";
import { buildClmmTwoLegExactInSwap } from "./clmm-build-two-leg";
import { ClmmUnsupportedError } from "./clmm-math";
import { RoutePoolMismatchError } from "./clmm-quote";
import { QuoteOverLimitError, TwoLegRouteMismatchError } from "./build-two-leg";
import { PURCHASE_CONFIG } from "./config";
import { previewExpiry } from "./purchase-machine";
import type { PreviewOutcome } from "./preview";
import { PAY_TOKENS, USDC_DECIMALS, type PayTokenId } from "./route";
import { productRoute, type ProductTicker } from "./routes-table";
import { createRelayConnection, multiplierReading, readPayMint, readRouteMints, relayFailureOf, type RelayConnection } from "./rpc";
import { classifySimulationError } from "./simulation";
import { legacyAuditShapeOf, twoLegAmountFailure } from "./tx-allowlist";
import { transactionErrorCode } from "./tracker";

function failureOutcome(error: unknown, relay: RelayConnection, createsNvdaxAccount: boolean): PreviewOutcome {
  const failure = relayFailureOf(error, relay);
  if (failure === "rateLimited") return { ok: false, failure: "relayBusy", details: null, createsNvdaxAccount };
  if (failure === "unavailable") return { ok: false, failure: "relayUnavailable", details: null, createsNvdaxAccount };
  if (error instanceof RoutePoolMismatchError || error instanceof TwoLegRouteMismatchError || error instanceof ClmmUnsupportedError) {
    return { ok: false, failure: "routeCheck", details: error.message, createsNvdaxAccount };
  }
  if (error instanceof QuoteOverLimitError) return { ok: false, failure: "overLimit", details: error.usdcOutRaw.toString(), createsNvdaxAccount };
  return { ok: false, failure: "simulationFailed", details: error instanceof Error ? error.message : null, createsNvdaxAccount };
}

async function simulate(relay: RelayConnection, wire: Uint8Array) {
  return relay.connection.simulateTransaction(VersionedTransaction.deserialize(wire), { sigVerify: false, replaceRecentBlockhash: true });
}

/** Preview a CLMM product purchase paying with `payToken` (USDC: one leg; SOL / SKR: a DLMM first leg). */
export async function prepareClmmPreview(walletAddress: string, inputRaw: bigint, now: () => number, payToken: PayTokenId, product: ProductTicker): Promise<PreviewOutcome> {
  const relay = createRelayConnection();
  let createsNvdaxAccount = false;
  try {
    const route = productRoute(product);
    const pay = PAY_TOKENS[payToken];
    const [mints, payMint] = await Promise.all([readRouteMints(relay, product), payToken === "USDC" ? Promise.resolve(null) : readPayMint(relay, payToken)]);
    if (!mints || mints.usdc.decimals !== USDC_DECIMALS || mints.nvdax.decimals !== route.decimals || (payToken !== "USDC" && (!payMint || payMint.decimals !== pay.decimals))) {
      return { ok: false, failure: "routeCheck", details: "route mint decimals or token program differ from the verified route", createsNvdaxAccount };
    }
    const nvdaxMultiplier = multiplierReading(mints.nvdax, now());
    const user = new PublicKey(walletAddress);

    if (payToken === "USDC") {
      const built = await buildClmmUsdcExactInSwap({ connection: relay.connection, userPublicKey: user, product, usdcInAmountRaw: inputRaw, slippageBps: PURCHASE_CONFIG.slippageBps });
      const wireTransaction = Uint8Array.from(built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
      const audit = auditClmmSwapTransaction(legacyAuditShapeOf(wireTransaction), {
        user: walletAddress, product, inputRaw, outputRaw: built.reading.outputRaw, minimumOutputRaw: built.reading.minimumOutputRaw,
        tickArrayStarts: built.reading.tickArrayStarts, hasBitmapExtension: built.hasBitmapExtension,
      });
      if (!audit.ok) return { ok: false, failure: "routeCheck", details: audit.reason, createsNvdaxAccount };
      createsNvdaxAccount = audit.createsNvdaxAccount;
      const simulation = await simulate(relay, wireTransaction);
      if (simulation.value.err !== null && simulation.value.err !== undefined) {
        return { ok: false, failure: classifySimulationError(simulation.value.err, simulation.value.logs), details: transactionErrorCode(simulation.value.err), createsNvdaxAccount };
      }
      const builtAt = now();
      const quote = built.reading.quote;
      return {
        ok: true,
        preview: {
          walletAddress, product, payToken: "USDC", firstLeg: null, inputRaw,
          consumedInputRaw: BigInt(quote.consumedInputRaw), outputRaw: built.reading.outputRaw, minimumOutputRaw: built.reading.minimumOutputRaw,
          feeRaw: BigInt(quote.feeRaw), protocolFeeRaw: BigInt(quote.protocolFeeRaw), feeOnInput: quote.feeOnInput, priceImpactPct: quote.priceImpactPct,
          builtAt, expiresAt: previewExpiry(builtAt), nvdaxMultiplier, createsNvdaxAccount, lastValidBlockHeight: built.lastValidBlockHeight, wireTransaction,
        },
      };
    }

    const built = await buildClmmTwoLegExactInSwap({
      connection: relay.connection, userPublicKey: user, product, payToken, inAmountRaw: inputRaw,
      slippageBps: PURCHASE_CONFIG.slippageBps, maxUsdcRaw: PURCHASE_CONFIG.maxUsdcInRaw,
    });
    const usdcOutRaw = BigInt(built.firstLeg.outputRaw);
    const usdcMinimumRaw = BigInt(built.firstLeg.minimumOutputRaw);
    const outputRaw = built.secondLeg.outputRaw;
    const minimumOutputRaw = built.secondLeg.minimumOutputRaw;
    const amountFailure = twoLegAmountFailure({ usdcOutRaw, usdcMinimumRaw, outputRaw, minimumOutputRaw });
    if (amountFailure) return { ok: false, failure: "routeCheck", details: amountFailure, createsNvdaxAccount };
    const wireTransaction = Uint8Array.from(built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
    const audit = auditClmmTwoLegTransaction(legacyAuditShapeOf(wireTransaction), {
      user: walletAddress, product, payToken, inputRaw, usdcOutRaw, usdcMinimumRaw, outputRaw, minimumOutputRaw,
      firstLeg: { binArrayIndexes: built.firstLeg.binArrayIndexes, hasBitmapExtension: built.firstLeg.hasBitmapExtension },
      secondLeg: { tickArrayStarts: built.secondLeg.tickArrayStarts, hasBitmapExtension: built.secondLegHasBitmapExtension },
    });
    if (!audit.ok) return { ok: false, failure: "routeCheck", details: audit.reason, createsNvdaxAccount };
    createsNvdaxAccount = audit.createsNvdaxAccount;
    const simulation = await simulate(relay, wireTransaction);
    if (simulation.value.err !== null && simulation.value.err !== undefined) {
      return { ok: false, failure: classifySimulationError(simulation.value.err, simulation.value.logs), details: transactionErrorCode(simulation.value.err), createsNvdaxAccount };
    }
    const builtAt = now();
    const second = built.secondLeg.quote;
    return {
      ok: true,
      preview: {
        walletAddress, product, payToken,
        firstLeg: { pool: built.firstLeg.pool, usdcOutRaw, usdcMinimumRaw, feeRaw: BigInt(built.firstLeg.feeRaw), feeOnInput: built.firstLeg.feeOnInput, priceImpactPct: built.firstLeg.priceImpactPct },
        inputRaw, consumedInputRaw: BigInt(built.firstLeg.consumedInputRaw), outputRaw, minimumOutputRaw,
        feeRaw: BigInt(second.feeRaw), protocolFeeRaw: BigInt(second.protocolFeeRaw), feeOnInput: second.feeOnInput, priceImpactPct: second.priceImpactPct,
        builtAt, expiresAt: previewExpiry(builtAt), nvdaxMultiplier, createsNvdaxAccount, lastValidBlockHeight: built.lastValidBlockHeight, wireTransaction,
      },
    };
  } catch (error) {
    return failureOutcome(error, relay, createsNvdaxAccount);
  }
}
