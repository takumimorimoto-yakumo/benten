/**
 * The buy flow's three steps over the unchanged purchase states (app IA
 * section 5.2). Presentation only: the step never drives a transition, and
 * every state keeps its contract content and actions.
 */
import type { AttemptPhase } from "@benten/purchase/purchase-machine";
import type { PublicWebLocale } from "@/i18n/locales";
import { productMessagesFor } from "@/i18n/product-messages";

export const FLOW_STEPS = ["amount", "review", "result"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

/** Exhaustive over the purchase phases, so a new phase cannot ship without a step. */
const STEP_OF_PHASE = {
  editing: "amount",
  previewing: "amount",
  previewFailed: "amount",
  walletOutcomeUnknown: "amount",
  reviewReady: "review",
  previewExpired: "review",
  awaitingWallet: "review",
  submitted: "result",
  confirmed: "result",
  notFinalized: "result",
  finalized: "result",
  result: "result",
  resultUnreadable: "result",
  failedOnChain: "result",
  dropped: "result",
} as const satisfies Record<AttemptPhase, FlowStep>;

/** The step of a purchase phase; the prerendered frame (`"frame"`) is the amount step. */
export function flowStepOf(phase: AttemptPhase | "frame"): FlowStep {
  return phase === "frame" ? "amount" : STEP_OF_PHASE[phase];
}

/** "Step 2 of 3: Review" in the page locale. */
export function flowStepText(phase: AttemptPhase | "frame", locale: PublicWebLocale): string {
  const copy = productMessagesFor(locale).flow;
  const step = flowStepOf(phase);
  return copy.step(String(FLOW_STEPS.indexOf(step) + 1), String(FLOW_STEPS.length), copy.steps[step]);
}
