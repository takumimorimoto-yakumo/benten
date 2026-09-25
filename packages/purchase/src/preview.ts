/**
 * Prepare one swap preview in the browser: read the route mints, build the
 * unsigned exact-in swap, audit the exact wire bytes against the allowlist,
 * and run an unsigned simulation. Only a preview that passes all four reaches
 * the panel's `reviewReady` state; its audited bytes are what the wallet is
 * later asked to approve.
 *
 * Reads only, through the same-origin relay. Nothing is signed or sent here.
 */

import { PublicKey, VersionedTransaction } from "@solana/web3.js";

import { buildNvdaxUsdcExactInSwap, RoutePoolMismatchError } from "./build-swap";
import { buildTwoLegExactInSwap, QuoteOverLimitError, TwoLegRouteMismatchError } from "./build-two-leg";
import { PURCHASE_CONFIG } from "./config";
import { previewExpiry, type PreviewFailure, type PreviewTerms } from "./purchase-machine";
import { PAY_TOKENS, USDC_DECIMALS, type PayTokenId } from "./route";
import { DEFAULT_PRODUCT, productRoute, type ProductTicker } from "./routes-table";
import { createRelayConnection, multiplierReading, readPayMint, readRouteMints, relayFailureOf, type RelayConnection } from "./rpc";
import { classifySimulationError } from "./simulation";
import { auditShapeOf, auditSwapTransaction, auditTwoLegTransaction, quotedFeeFailure, twoLegAmountFailure } from "./tx-allowlist";
import { transactionErrorCode } from "./tracker";

export type PreviewOutcome =
  | { ok: true; preview: Omit<PreviewTerms, "id"> }
  | { ok: false; failure: PreviewFailure; details: string | null; createsNvdaxAccount: boolean };

function relayOutcome(error: unknown, relay: RelayConnection, createsNvdaxAccount: boolean): PreviewOutcome {
  const failure = relayFailureOf(error, relay);
  if (failure === "rateLimited") return { ok: false, failure: "relayBusy", details: null, createsNvdaxAccount };
  if (failure === "unavailable") return { ok: false, failure: "relayUnavailable", details: null, createsNvdaxAccount };
  if (error instanceof RoutePoolMismatchError || error instanceof TwoLegRouteMismatchError) return { ok: false, failure: "routeCheck", details: error.message, createsNvdaxAccount };
  if (error instanceof QuoteOverLimitError) return { ok: false, failure: "overLimit", details: error.usdcOutRaw.toString(), createsNvdaxAccount };
  return { ok: false, failure: "simulationFailed", details: error instanceof Error ? error.message : null, createsNvdaxAccount };
}

/**
 * `product` is a routes-table key (default NVDA): the pool, mint, decimals
 * and token program all come from the table, and the audit re-derives every
 * account from the same entry.
 */
export async function preparePreview(walletAddress: string, inputRaw: bigint, now: () => number = Date.now, payToken: PayTokenId = "USDC", product: ProductTicker = DEFAULT_PRODUCT): Promise<PreviewOutcome> {
  const route = productRoute(product);
  // A Raydium CLMM product loads its own builder and audit on demand; a DLMM product's page never fetches them.
  if (route.dex === "raydium-clmm") return import("./clmm-preview").then(({ prepareClmmPreview }) => prepareClmmPreview(walletAddress, inputRaw, now, payToken, route.ticker));
  if (payToken !== "USDC") return prepareTwoLegPreview(walletAddress, payToken, inputRaw, now, route.ticker);
  const relay = createRelayConnection();
  let createsNvdaxAccount = false;
  try {
    const mints = await readRouteMints(relay, route.ticker);
    if (!mints || mints.usdc.decimals !== USDC_DECIMALS || mints.nvdax.decimals !== route.decimals) {
      return { ok: false, failure: "routeCheck", details: "route mint decimals or token program differ from the verified route", createsNvdaxAccount };
    }
    const nvdaxMultiplier = multiplierReading(mints.nvdax, now());

    const built = await buildNvdaxUsdcExactInSwap({
      connection: relay.connection,
      userPublicKey: new PublicKey(walletAddress),
      product: route.ticker,
      usdcInAmountRaw: inputRaw,
      slippageBps: PURCHASE_CONFIG.slippageBps,
    });
    const minimumOutputRaw = BigInt(built.quote.minimumOutputRaw);
    const feeFailure = quotedFeeFailure(built.quote, "quote");
    if (feeFailure) return { ok: false, failure: "routeCheck", details: feeFailure, createsNvdaxAccount };
    const wireTransaction = Uint8Array.from(built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));

    // Audit the exact bytes the wallet would receive, not the builder's object.
    const audit = auditSwapTransaction(auditShapeOf(wireTransaction), {
      user: walletAddress,
      product: route.ticker,
      inputRaw,
      minimumOutputRaw,
      binArrayIndexes: built.binArrayIndexes,
      hasBitmapExtension: built.pool.hasBitmapExtension,
    });
    if (!audit.ok) return { ok: false, failure: "routeCheck", details: audit.reason, createsNvdaxAccount };
    createsNvdaxAccount = audit.createsNvdaxAccount;

    const simulation = await relay.connection.simulateTransaction(VersionedTransaction.deserialize(wireTransaction), {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });
    if (simulation.value.err !== null && simulation.value.err !== undefined) {
      return {
        ok: false,
        failure: classifySimulationError(simulation.value.err, simulation.value.logs),
        details: transactionErrorCode(simulation.value.err),
        createsNvdaxAccount,
      };
    }

    const builtAt = now();
    return {
      ok: true,
      preview: {
        walletAddress,
        product: route.ticker,
        payToken: "USDC",
        firstLeg: null,
        inputRaw,
        consumedInputRaw: BigInt(built.quote.consumedInputRaw),
        outputRaw: BigInt(built.quote.outputRaw),
        minimumOutputRaw,
        feeRaw: BigInt(built.quote.feeRaw),
        protocolFeeRaw: BigInt(built.quote.protocolFeeRaw),
        feeOnInput: built.quote.feeOnInput,
        priceImpactPct: built.quote.priceImpactPct,
        builtAt,
        expiresAt: previewExpiry(builtAt),
        nvdaxMultiplier,
        createsNvdaxAccount,
        lastValidBlockHeight: built.lastValidBlockHeight,
        wireTransaction,
      },
    };
  } catch (error) {
    return relayOutcome(error, relay, createsNvdaxAccount);
  }
}

/**
 * Two-leg preview (pay with SOL or SKR): read the product route mints and the pay
 * mint, build the unsigned two-leg transaction (which refuses a first-leg
 * quote above the USDC limit), audit the exact wire bytes, and simulate.
 */
async function prepareTwoLegPreview(walletAddress: string, payToken: Exclude<PayTokenId, "USDC">, inputRaw: bigint, now: () => number, product: ProductTicker): Promise<PreviewOutcome> {
  const relay = createRelayConnection();
  let createsNvdaxAccount = false;
  try {
    const route = PAY_TOKENS[payToken];
    const productEntry = productRoute(product);
    const [mints, payMint] = await Promise.all([readRouteMints(relay, product), readPayMint(relay, payToken)]);
    if (!mints || mints.usdc.decimals !== USDC_DECIMALS || mints.nvdax.decimals !== productEntry.decimals || !payMint || payMint.decimals !== route.decimals) {
      return { ok: false, failure: "routeCheck", details: "route mint decimals or token program differ from the verified route", createsNvdaxAccount };
    }
    const nvdaxMultiplier = multiplierReading(mints.nvdax, now());

    const built = await buildTwoLegExactInSwap({
      connection: relay.connection,
      userPublicKey: new PublicKey(walletAddress),
      product,
      payToken,
      inAmountRaw: inputRaw,
      slippageBps: PURCHASE_CONFIG.slippageBps,
      maxUsdcRaw: PURCHASE_CONFIG.maxUsdcInRaw,
    });
    const usdcOutRaw = BigInt(built.firstLeg.outputRaw);
    const usdcMinimumRaw = BigInt(built.firstLeg.minimumOutputRaw);
    const outputRaw = BigInt(built.secondLeg.outputRaw);
    const minimumOutputRaw = BigInt(built.secondLeg.minimumOutputRaw);
    // The builder's own limit check reads its quote; bound the amounts the user reviews independently of it.
    const amountFailure = twoLegAmountFailure({ usdcOutRaw, usdcMinimumRaw, outputRaw, minimumOutputRaw });
    if (amountFailure) return { ok: false, failure: "routeCheck", details: amountFailure, createsNvdaxAccount };
    const feeFailure = quotedFeeFailure(built.firstLeg, "first leg") ?? quotedFeeFailure(built.secondLeg, "second leg");
    if (feeFailure) return { ok: false, failure: "routeCheck", details: feeFailure, createsNvdaxAccount };
    const wireTransaction = Uint8Array.from(built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));

    const audit = auditTwoLegTransaction(auditShapeOf(wireTransaction), {
      user: walletAddress,
      product,
      payToken,
      inputRaw,
      usdcOutRaw,
      usdcMinimumRaw,
      outputRaw,
      minimumOutputRaw,
      firstLeg: { binArrayIndexes: built.firstLeg.binArrayIndexes, hasBitmapExtension: built.firstLeg.hasBitmapExtension },
      secondLeg: { binArrayIndexes: built.secondLeg.binArrayIndexes, hasBitmapExtension: built.secondLeg.hasBitmapExtension },
    });
    if (!audit.ok) return { ok: false, failure: "routeCheck", details: audit.reason, createsNvdaxAccount };
    createsNvdaxAccount = audit.createsNvdaxAccount;

    const simulation = await relay.connection.simulateTransaction(VersionedTransaction.deserialize(wireTransaction), {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });
    if (simulation.value.err !== null && simulation.value.err !== undefined) {
      return {
        ok: false,
        failure: classifySimulationError(simulation.value.err, simulation.value.logs),
        details: transactionErrorCode(simulation.value.err),
        createsNvdaxAccount,
      };
    }

    const builtAt = now();
    return {
      ok: true,
      preview: {
        walletAddress,
        product,
        payToken,
        firstLeg: {
          pool: built.firstLeg.pool,
          usdcOutRaw,
          usdcMinimumRaw,
          feeRaw: BigInt(built.firstLeg.feeRaw),
          feeOnInput: built.firstLeg.feeOnInput,
          priceImpactPct: built.firstLeg.priceImpactPct,
        },
        inputRaw,
        consumedInputRaw: BigInt(built.firstLeg.consumedInputRaw),
        outputRaw,
        minimumOutputRaw,
        feeRaw: BigInt(built.secondLeg.feeRaw),
        protocolFeeRaw: BigInt(built.secondLeg.protocolFeeRaw),
        feeOnInput: built.secondLeg.feeOnInput,
        priceImpactPct: built.secondLeg.priceImpactPct,
        builtAt,
        expiresAt: previewExpiry(builtAt),
        nvdaxMultiplier,
        createsNvdaxAccount,
        lastValidBlockHeight: built.lastValidBlockHeight,
        wireTransaction,
      },
    };
  } catch (error) {
    return relayOutcome(error, relay, createsNvdaxAccount);
  }
}
