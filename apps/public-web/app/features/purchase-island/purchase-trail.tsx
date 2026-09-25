import { CheckIcon } from "lucide-react";
import type { PurchaseCopy } from "@/i18n/purchase-messages";
import { cn } from "@/lib/utils";

export type TrailStepState = "done" | "current" | "notYet";

export type TrailStep = {
  readonly key: string;
  readonly label: string;
  readonly state: TrailStepState;
  /** Absolute time shown for a completed step. */
  readonly time?: string;
  /** Extra line for the current step. */
  readonly detail?: string;
  /** Label for a step that was not observed (tracking stopped). */
  readonly unseen?: boolean;
};

/**
 * Vertical progress trail: a real sequence, so an ordered list. Each step
 * carries its state in words for assistive technology, not only as a dot; a
 * completed dot carries a check mark at the same size.
 */
export function PurchaseTrail({ steps, copy }: { steps: readonly TrailStep[]; copy: PurchaseCopy["trail"] }) {
  const stateText: Record<TrailStepState, string> = { done: copy.stateDone, current: copy.stateCurrent, notYet: copy.stateNotYet };
  return (
    <ol aria-label={copy.label} data-purchase-trail="" className="flex flex-col">
      {steps.map((step, index) => (
        <li key={step.key} data-state={step.state} className="relative grid grid-cols-[var(--purchase-trail-dot)_minmax(0,1fr)] gap-x-3 pb-3 last:pb-0">
          {index < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute bottom-0 left-[calc(var(--purchase-trail-dot)/2)] top-[calc(--spacing(1)+var(--purchase-trail-dot))] w-px",
                step.state === "notYet" ? "bg-border" : "bg-(--verified)",
              )}
            />
          ) : null}
          <span
            aria-hidden="true"
            className={cn(
              "mt-1 grid size-(--purchase-trail-dot) place-items-center rounded-full border",
              step.state === "done" && "border-(--verified) bg-(--verified) text-primary-foreground ring-3 ring-(--verified-surface)",
              step.state === "current" && "border-2 border-(--verified) bg-(--verified-surface)",
              step.state === "notYet" && "border-muted-foreground bg-card",
            )}
          >
            {step.state === "done" ? <CheckIcon data-trail-check="" className="size-full p-px" strokeWidth={3} /> : null}
          </span>
          <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2">
            <span className={cn("text-sm", step.state === "notYet" ? "text-muted-foreground" : "font-semibold")}>{step.label}</span>
            <span className="sr-only">, {stateText[step.state]}</span>
            {step.time ? <span className="text-right text-xs text-muted-foreground tabular-nums">{step.time}</span> : null}
            {step.unseen ? <span className="text-right text-xs text-muted-foreground">{copy.notSeenYet}</span> : null}
            {step.detail ? <span className="col-span-full text-sm text-muted-foreground">{step.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
