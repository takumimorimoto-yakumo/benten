/**
 * Living Catalog fixtures for the purchase panel: reducer states built by
 * replaying actions through the real reducer, with no RPC and no wallet.
 * Nothing here signs, sends or reads the network.
 *
 * Amounts reuse the G-B1 no-funds build (input 1000000, expected 441982,
 * minimum 437562, fee 2250 with protocol share 250). The wallet address,
 * signature and times are synthetic specimens, not real data.
 */

import { encodeBase58 } from "./base58";
import { PURCHASE_CONFIG } from "./config";
import {
  INITIAL_PURCHASE_STATE,
  INITIAL_SELL_STATE,
  purchaseReducer,
  REFERENCE_STALE,
  type PreviewTerms,
  type PurchaseAction,
  type PurchaseState,
} from "./purchase-machine";

/** Fixture clock: a fixed UTC instant keeps fixtures deterministic. */
export const FIXTURE_BUILT_AT = Date.UTC(2026, 8, 24, 0, 30, 0);
/** Seconds into the preview at which review fixtures are rendered (shows a partly elapsed countdown). */
const FIXTURE_ELAPSED_MS = 6_000;
export const FIXTURE_NOW = FIXTURE_BUILT_AT + FIXTURE_ELAPSED_MS;

const FIXTURE_WALLET_ADDRESS = encodeBase58(new Uint8Array(32).fill(7));
const FIXTURE_SIGNATURE = encodeBase58(new Uint8Array(64).fill(42));
const FIXTURE_MULTIPLIER = { value: "1.001701196801074", readAt: FIXTURE_BUILT_AT };
const WALLET = { id: "Specimen Wallet", name: "Specimen Wallet" };
const SECOND_WALLET = { id: "Second Wallet", name: "Second Wallet" };

function preview(overrides: Partial<Omit<PreviewTerms, "id">> = {}): Omit<PreviewTerms, "id"> {
  return {
    walletAddress: FIXTURE_WALLET_ADDRESS,
    product: "NVDA",
    payToken: "USDC",
    firstLeg: null,
    inputRaw: 1_000_000n,
    consumedInputRaw: 1_000_000n,
    outputRaw: 441_982n,
    minimumOutputRaw: 437_562n,
    feeRaw: 2_250n,
    protocolFeeRaw: 250n,
    feeOnInput: true,
    priceImpactPct: "0",
    builtAt: FIXTURE_BUILT_AT,
    expiresAt: FIXTURE_BUILT_AT + PURCHASE_CONFIG.previewTtlMs,
    nvdaxMultiplier: FIXTURE_MULTIPLIER,
    createsNvdaxAccount: false,
    lastValidBlockHeight: 1,
    wireTransaction: new Uint8Array(0),
    ...overrides,
  };
}

function replay(actions: PurchaseAction[], from: PurchaseState = INITIAL_PURCHASE_STATE): PurchaseState {
  return actions.reduce(purchaseReducer, from);
}

const DETECTED: PurchaseAction[] = [{ type: "walletsDetected", wallets: [WALLET], unsupported: [] }];
const CONNECTED: PurchaseAction[] = [
  ...DETECTED,
  { type: "connectRequested", walletId: WALLET.id },
  { type: "connectSucceeded", walletId: WALLET.id, walletName: WALLET.name, address: FIXTURE_WALLET_ADDRESS },
  { type: "balanceRequested" },
  { type: "balanceLoaded", address: FIXTURE_WALLET_ADDRESS, raw: 5_000_000n },
];
const TYPED: PurchaseAction[] = [...CONNECTED, { type: "amountEdited", text: "1" }];
const PREVIEWING: PurchaseAction[] = [...TYPED, { type: "previewRequested" }];
const READY = (overrides: Partial<Omit<PreviewTerms, "id">> = {}): PurchaseAction[] => [...PREVIEWING, { type: "previewSucceeded", requestId: 1, preview: preview(overrides) }];
const AWAITING: PurchaseAction[] = [...READY(), { type: "approveRequested", now: FIXTURE_BUILT_AT + 8_000 }];
const SUBMITTED: PurchaseAction[] = [...AWAITING, { type: "walletSigned", signature: FIXTURE_SIGNATURE, now: FIXTURE_BUILT_AT + 11_000 }];
const CONFIRMED: PurchaseAction[] = [...SUBMITTED, { type: "statusObserved", signature: FIXTURE_SIGNATURE, status: "confirmed", now: FIXTURE_BUILT_AT + 13_000 }];
const FINALIZED: PurchaseAction[] = [...CONFIRMED, { type: "statusObserved", signature: FIXTURE_SIGNATURE, status: "finalized", now: FIXTURE_BUILT_AT + 26_000 }];
const failure = (kind: "notEnoughSol" | "simulationFailed" | "routeCheck" | "relayBusy" | "relayUnavailable", details: string | null = null, createsNvdaxAccount = false): PurchaseAction[] =>
  [...PREVIEWING, { type: "previewFailed", requestId: 1, failure: kind, details, createsNvdaxAccount }];

/**
 * Pay-with-SOL and pay-with-SKR fixtures. Amounts reuse the mainnet read-only
 * builds of 2026-09-25 (0.05 SOL quoted at 5.859129 USDC, minimum 5.800537;
 * 200 SKR quoted at 4.075567 USDC, minimum 4.034811).
 */
const SOL_CONNECTED: PurchaseAction[] = [
  ...CONNECTED,
  { type: "payTokenSelected", payToken: "SOL" },
  { type: "balanceRequested" },
  { type: "balanceLoaded", address: FIXTURE_WALLET_ADDRESS, raw: 250_000_000n, payToken: "SOL" },
];
const SOL_PREVIEWING: PurchaseAction[] = [...SOL_CONNECTED, { type: "amountEdited", text: "0.05" }, { type: "previewRequested" }];
const SOL_PREVIEW = preview({
  payToken: "SOL",
  firstLeg: { pool: "5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6", usdcOutRaw: 5_859_129n, usdcMinimumRaw: 5_800_537n, feeRaw: 20_273n, feeOnInput: true, priceImpactPct: "0" },
  inputRaw: 50_000_000n,
  consumedInputRaw: 50_000_000n,
  outputRaw: 2_575_409n,
  minimumOutputRaw: 2_549_654n,
  feeRaw: 13_062n,
  protocolFeeRaw: 1_450n,
  priceImpactPct: "0.044012461658897212272",
  createsNvdaxAccount: true,
});
const SOL_SUBMITTED: PurchaseAction[] = [
  ...SOL_PREVIEWING,
  { type: "previewSucceeded", requestId: 1, preview: SOL_PREVIEW },
  { type: "approveRequested", now: FIXTURE_BUILT_AT + 8_000 },
  { type: "walletSigned", signature: FIXTURE_SIGNATURE, now: FIXTURE_BUILT_AT + 11_000 },
  { type: "statusObserved", signature: FIXTURE_SIGNATURE, status: "finalized", now: FIXTURE_BUILT_AT + 26_000 },
];
const SKR_PREVIEWING: PurchaseAction[] = [
  ...CONNECTED,
  { type: "payTokenSelected", payToken: "SKR" },
  { type: "balanceLoaded", address: FIXTURE_WALLET_ADDRESS, raw: 1_500_000_000n, payToken: "SKR" },
  { type: "amountEdited", text: "200" },
  { type: "previewRequested" },
];
const SKR_PREVIEW = preview({
  payToken: "SKR",
  firstLeg: { pool: "3EFvYXRRchBUbc2c8cwFWzJLttvYRPYq1dUi9yjug6wB", usdcOutRaw: 4_075_567n, usdcMinimumRaw: 4_034_811n, feeRaw: 544_498n, feeOnInput: true, priceImpactPct: "0.49705487843286231245" },
  inputRaw: 200_000_000n,
  consumedInputRaw: 200_000_000n,
  outputRaw: 1_792_241n,
  minimumOutputRaw: 1_774_318n,
  feeRaw: 9_080n,
  protocolFeeRaw: 1_008n,
});

/**
 * Sale fixtures (NVDAx in, USDC out). 0.0224 NVDAx at the fixture multiplier
 * is 2236195 raw; the pool output (5.0214 USDC) and the NVDA/USD reference
 * (225.24, published four seconds before the build) are specimens chosen to
 * pass the reference check, which values the amount at 5.04 USD.
 */
const SELL_CONNECTED: PurchaseAction[] = [
  ...CONNECTED.filter((action) => action.type !== "balanceLoaded"),
  { type: "balanceLoaded", address: FIXTURE_WALLET_ADDRESS, raw: 20_000_000n },
  { type: "sellTermsRequested" },
  { type: "sellTermsLoaded", address: FIXTURE_WALLET_ADDRESS, multiplier: FIXTURE_MULTIPLIER.value, capRaw: 4_470_655n },
];
const SELL_PREVIEWING: PurchaseAction[] = [...SELL_CONNECTED, { type: "amountEdited", text: "0.0224" }, { type: "previewRequested" }];
const FIXTURE_REFERENCE_PUBLISHED = FIXTURE_BUILT_AT / 1000 - 4;
const SELL_PREVIEW = preview({
  side: "sell",
  inputRaw: 2_236_195n,
  consumedInputRaw: 2_236_195n,
  outputRaw: 5_021_400n,
  minimumOutputRaw: 4_971_186n,
  createsUsdcAccount: false,
  saleReference: {
    feedId: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
    pythSymbol: "Equity.US.NVDA/USD",
    price: "225.24",
    publishTime: FIXTURE_REFERENCE_PUBLISHED,
    valueUsd: "5.04",
  },
});

export interface PurchaseFixture {
  label: string;
  state: PurchaseState;
  /** Clock used to render the fixture (countdowns). */
  now: number;
}

export const PURCHASE_FIXTURES = {
  walletDetecting: { label: "Wallet detection pending", state: INITIAL_PURCHASE_STATE, now: FIXTURE_NOW },
  walletNotDetected: { label: "walletNotDetected", state: replay([{ type: "walletsDetected", wallets: [], unsupported: [] }]), now: FIXTURE_NOW },
  walletDisconnected: { label: "walletDisconnected (one wallet)", state: replay(DETECTED), now: FIXTURE_NOW },
  walletDisconnectedTwo: { label: "walletDisconnected (two wallets, one unsupported)", state: replay([{ type: "walletsDetected", wallets: [WALLET, SECOND_WALLET], unsupported: ["Legacy Wallet"] }]), now: FIXTURE_NOW },
  connectRejected: { label: "Connect rejected", state: replay([...DETECTED, { type: "connectRequested", walletId: WALLET.id }, { type: "connectFailed", reason: "rejected" }]), now: FIXTURE_NOW },
  walletConnecting: { label: "walletConnecting", state: replay([...DETECTED, { type: "connectRequested", walletId: WALLET.id }]), now: FIXTURE_NOW },
  editing: { label: "editing", state: replay(TYPED), now: FIXTURE_NOW },
  editingFormat: { label: "editing: format error", state: replay([...CONNECTED, { type: "amountEdited", text: "1,5" }, { type: "amountCommitted" }]), now: FIXTURE_NOW },
  editingPrecision: { label: "editing: precision error", state: replay([...CONNECTED, { type: "amountEdited", text: "1.1234567" }, { type: "amountCommitted" }]), now: FIXTURE_NOW },
  editingOverBalance: { label: "editing: over balance", state: replay([...CONNECTED, { type: "amountEdited", text: "8" }, { type: "amountCommitted" }]), now: FIXTURE_NOW },
  editingOverLimit: { label: "editing: over the 10 USDC limit", state: replay([...CONNECTED, { type: "amountEdited", text: "15" }, { type: "amountCommitted" }]), now: FIXTURE_NOW },
  editingEmpty: { label: "editing: empty on preview", state: replay([...CONNECTED, { type: "previewRequested" }]), now: FIXTURE_NOW },
  previewing: { label: "previewing", state: replay(PREVIEWING), now: FIXTURE_NOW },
  reviewReady: { label: "reviewReady", state: replay(READY()), now: FIXTURE_NOW },
  reviewReadyAccountCreation: { label: "reviewReady: creates the NVDAx token account", state: replay(READY({ createsNvdaxAccount: true })), now: FIXTURE_NOW },
  reviewReadyRawOnly: { label: "reviewReady: multiplier unavailable", state: replay(READY({ nvdaxMultiplier: null })), now: FIXTURE_NOW },
  reviewReadyRejected: { label: "reviewReady after a wallet rejection", state: replay([...AWAITING, { type: "walletRejected", now: FIXTURE_BUILT_AT + 9_000 }]), now: FIXTURE_BUILT_AT + 9_000 },
  previewExpired: { label: "previewExpired", state: replay([...READY(), { type: "tick", now: FIXTURE_BUILT_AT + PURCHASE_CONFIG.previewTtlMs }]), now: FIXTURE_BUILT_AT + PURCHASE_CONFIG.previewTtlMs },
  awaitingWallet: { label: "awaitingWallet", state: replay(AWAITING), now: FIXTURE_BUILT_AT + 8_000 },
  walletOutcomeUnknown: { label: "walletOutcomeUnknown", state: replay([...AWAITING, { type: "walletFailed" }]), now: FIXTURE_BUILT_AT + 9_000 },
  reviewReadyAfterUnknown: {
    label: "reviewReady: new preview after an unknown wallet outcome",
    state: replay([...AWAITING, { type: "walletFailed" }, { type: "startNew" }, { type: "amountEdited", text: "1" }, { type: "previewRequested" }, { type: "previewSucceeded", requestId: 2, preview: preview() }]),
    now: FIXTURE_NOW,
  },
  submitted: { label: "submitted", state: replay(SUBMITTED), now: FIXTURE_BUILT_AT + 12_000 },
  confirmed: { label: "confirmed", state: replay(CONFIRMED), now: FIXTURE_BUILT_AT + 14_000 },
  notFinalized: { label: "notFinalized (tracking cap)", state: replay([...CONFIRMED, { type: "trackingStopped", signature: FIXTURE_SIGNATURE, reason: "cap" }]), now: FIXTURE_BUILT_AT + 131_000 },
  notFinalizedRelay: { label: "notFinalized (relay error while tracking)", state: replay([...SUBMITTED, { type: "trackingStopped", signature: FIXTURE_SIGNATURE, reason: "relay" }]), now: FIXTURE_BUILT_AT + 131_000 },
  finalized: { label: "finalized (reading result)", state: replay(FINALIZED), now: FIXTURE_BUILT_AT + 26_000 },
  result: {
    label: "result",
    state: replay([...FINALIZED, { type: "resultRead", signature: FIXTURE_SIGNATURE, result: { nvdaxDeltaRaw: 441_982n, usdcPaidRaw: 1_000_000n, payToken: "USDC", paidRaw: 1_000_000n, nvdaxMultiplier: { value: FIXTURE_MULTIPLIER.value, readAt: FIXTURE_BUILT_AT + 27_000 } } }]),
    now: FIXTURE_BUILT_AT + 27_000,
  },
  resultUnreadable: { label: "resultUnreadable", state: replay([...FINALIZED, { type: "resultUnavailable", signature: FIXTURE_SIGNATURE }]), now: FIXTURE_BUILT_AT + 27_000 },
  failedOnChain: { label: "failedOnChain", state: replay([...SUBMITTED, { type: "statusFailed", signature: FIXTURE_SIGNATURE, errorCode: "{\"InstructionError\":[2,{\"Custom\":6004}]}" }]), now: FIXTURE_BUILT_AT + 14_000 },
  dropped: { label: "dropped", state: replay([...SUBMITTED, { type: "droppedDetected", signature: FIXTURE_SIGNATURE }]), now: FIXTURE_BUILT_AT + 90_000 },
  notEnoughSol: { label: "previewFailed: not enough SOL (with account deposit)", state: replay(failure("notEnoughSol", "InsufficientFundsForRent", true)), now: FIXTURE_NOW },
  simulationFailed: { label: "previewFailed: simulation failed", state: replay(failure("simulationFailed", "{\"InstructionError\":[2,{\"Custom\":6004}]}")), now: FIXTURE_NOW },
  routeCheck: { label: "previewFailed: route check failed", state: replay(failure("routeCheck", "swap: account 0 is not the expected account")), now: FIXTURE_NOW },
  relayBusy: { label: "previewFailed: relay busy (429)", state: replay(failure("relayBusy")), now: FIXTURE_NOW },
  relayUnavailable: { label: "previewFailed: relay unavailable", state: replay(failure("relayUnavailable")), now: FIXTURE_NOW },
  payWithSol: { label: "pay with SOL: editing (fee and deposit reserve shown)", state: replay([...SOL_CONNECTED, { type: "amountEdited", text: "0.05" }]), now: FIXTURE_NOW },
  payWithSolOverBalance: { label: "pay with SOL: over the spendable balance", state: replay([...SOL_CONNECTED, { type: "amountEdited", text: "0.245" }, { type: "amountCommitted" }]), now: FIXTURE_NOW },
  payWithSolReviewReady: { label: "pay with SOL: reviewReady (two legs)", state: replay([...SOL_PREVIEWING, { type: "previewSucceeded", requestId: 1, preview: SOL_PREVIEW }]), now: FIXTURE_NOW },
  payWithSolOverLimit: { label: "pay with SOL: quoted above the 10 USDC limit", state: replay([...SOL_PREVIEWING, { type: "previewFailed", requestId: 1, failure: "overLimit", details: "12226665" }]), now: FIXTURE_NOW },
  payWithSolResult: {
    label: "pay with SOL: result",
    state: replay([...SOL_SUBMITTED, { type: "resultRead", signature: FIXTURE_SIGNATURE, result: { nvdaxDeltaRaw: 2_575_409n, usdcPaidRaw: -58_592n, payToken: "SOL", paidRaw: 52_045_000n, nvdaxMultiplier: { value: FIXTURE_MULTIPLIER.value, readAt: FIXTURE_BUILT_AT + 27_000 } } }]),
    now: FIXTURE_BUILT_AT + 27_000,
  },
  payWithSkrReviewReady: { label: "pay with SKR: reviewReady (two legs)", state: replay([...SKR_PREVIEWING, { type: "previewSucceeded", requestId: 1, preview: SKR_PREVIEW }]), now: FIXTURE_NOW },
} satisfies Record<string, PurchaseFixture>;

export type PurchaseFixtureName = keyof typeof PURCHASE_FIXTURES;

/** Sale (sell side) fixtures, kept apart from the purchase fixtures whose checks assume the buy side. */
export const SALE_FIXTURES = {
  sellReviewReady: { label: "sell: reviewReady (checked against the Pyth reference)", state: replay([...SELL_PREVIEWING, { type: "previewSucceeded", requestId: 1, preview: SELL_PREVIEW }], INITIAL_SELL_STATE), now: FIXTURE_NOW },
  sellReferenceStale: { label: "sell: previewFailed, the Pyth reference is stale", state: replay([...SELL_PREVIEWING, { type: "previewFailed", requestId: 1, failure: "referenceUnavailable", details: REFERENCE_STALE }], INITIAL_SELL_STATE), now: FIXTURE_NOW },
  sellReferenceUnreadable: { label: "sell: previewFailed, no usable Pyth reference", state: replay([...SELL_PREVIEWING, { type: "previewFailed", requestId: 1, failure: "referenceUnavailable", details: "malformed_price_account" }], INITIAL_SELL_STATE), now: FIXTURE_NOW },
} satisfies Record<string, PurchaseFixture>;

/** Every panel fixture (purchase and sale), as the Living Catalog lists and opens them. */
export const PANEL_FIXTURES = { ...PURCHASE_FIXTURES, ...SALE_FIXTURES };

export type PanelFixtureName = keyof typeof PANEL_FIXTURES;

export function isPanelFixtureName(value: string | undefined): value is PanelFixtureName {
  return value !== undefined && Object.prototype.hasOwnProperty.call(PANEL_FIXTURES, value);
}
