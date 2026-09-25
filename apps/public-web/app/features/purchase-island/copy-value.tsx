import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { COPY_FEEDBACK_MS, copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { PurchaseCopy } from "@/i18n/purchase-messages";

/**
 * A touch-sized hit area through vertical padding, with an equal negative
 * margin so the button does not grow the line it sits in.
 */
const TOUCH_TARGET_INLINE = "my-[calc((1lh-var(--touch-target-min))/2)] py-[calc((var(--touch-target-min)-1lh)/2)]";
/** A real touch-sized box, for lines that sit directly above other buttons so the hit areas never overlap. */
const TOUCH_TARGET_BLOCK = "min-h-(--touch-target-min)";

/**
 * Copies one exact string (an address or signature, never an abbreviation)
 * through `copyText`, with an explicit unavailable state rather than a
 * silent no-op. `inline` (the default) keeps the line height by overhanging
 * its hit area; `block` takes the full height in the layout.
 */
export function CopyValue({ value, copy, label, className, touch = "inline" }: { value: string; copy: PurchaseCopy["copyValue"]; label?: string; className?: string; touch?: "inline" | "block" }) {
  const [state, setState] = useState<"idle" | "copied" | "unavailable">("idle");
  const timer = useRef<number | null>(null);
  async function copyValue() {
    if (timer.current) window.clearTimeout(timer.current);
    const copied = await copyText(value);
    setState(copied ? "copied" : "unavailable");
    timer.current = window.setTimeout(() => setState("idle"), COPY_FEEDBACK_MS);
  }
  const text = state === "copied" ? copy.copied : state === "unavailable" ? copy.unavailable : label ?? copy.copy;
  return (
    <span className="inline-flex">
      <Button variant="link" size="sm" className={cn("h-auto px-0 text-sm underline", touch === "inline" ? TOUCH_TARGET_INLINE : TOUCH_TARGET_BLOCK, className)} onClick={() => void copyValue()}>{text}</Button>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{state === "idle" ? "" : text}</span>
    </span>
  );
}
