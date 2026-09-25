import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

export type TrailStepState = "done" | "current" | "notYet";

export interface TrailStep {
  key: string;
  label: string;
  state: TrailStepState;
  /** Absolute time shown for a completed step. */
  time?: string;
  /** Extra line for the current step. */
  detail?: string;
  /** Label for a step that was not observed (tracking stopped). */
  unseen?: boolean;
}

/**
 * Vertical progress trail: a real sequence, so an ordered list. Each step
 * carries its state in words for assistive technology, not only as a dot.
 */
export function PurchaseTrail({ steps, locale }: { steps: TrailStep[]; locale: Locale }) {
  const copy = messagesFor(locale).purchase.trail;
  const stateText: Record<TrailStepState, string> = { done: copy.stateDone, current: copy.stateCurrent, notYet: copy.stateNotYet };
  return (
    <ol className="purchase-trail" aria-label={copy.label}>
      {steps.map((step) => (
        <li key={step.key} className="purchase-trail__step" data-state={step.state}>
          <span className="purchase-trail__dot" aria-hidden="true">
            {step.state === "done" ? (
              <svg className="purchase-trail__check" viewBox="0 0 12 12" focusable="false">
                <path d="M3.4 6.2 5.2 8l3.4-3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </span>
          <span className="purchase-trail__text">
            <span className="purchase-trail__label">{step.label}</span>
            <span className="sr-only">, {stateText[step.state]}</span>
            {step.time ? <span className="purchase-trail__time">{step.time}</span> : null}
            {step.unseen ? <span className="purchase-trail__time">{copy.notSeenYet}</span> : null}
            {step.detail ? <span className="purchase-trail__detail">{step.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
