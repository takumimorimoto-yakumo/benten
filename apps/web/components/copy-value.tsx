"use client";

import { useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * Copies one exact string (an address, never an abbreviation) to the clipboard.
 *
 * Same mechanism as the local MCP command panel: clipboard API first, hidden
 * textarea fallback, and an explicit unavailable state rather than a silent no-op.
 */
export function CopyValue({ value, locale = "en", initialState = "idle", label: idleLabel }: { value: string; locale?: Locale; initialState?: "idle" | "copied" | "unavailable"; label?: string }) {
  const copy = messagesFor(locale).providers.page;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "unavailable">(initialState);
  const buttonRef = useRef<HTMLButtonElement>(null); const resetTimer = useRef<number | null>(null);
  async function copyValue() {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    let didCopy = false;
    try { if (navigator.clipboard) { await navigator.clipboard.writeText(value); didCopy = true; } } catch { /* fallback */ }
    if (!didCopy) {
      const fallback = document.createElement("textarea"); fallback.value = value; fallback.setAttribute("readonly", ""); fallback.style.position = "fixed"; fallback.style.opacity = "0";
      document.body.append(fallback); fallback.select();
      try { didCopy = document.execCommand("copy"); } catch { didCopy = false; }
      fallback.remove();
    }
    setCopyState(didCopy ? "copied" : "unavailable"); buttonRef.current?.focus();
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 1800);
  }
  const label = copyState === "copied" ? copy.copied : copyState === "unavailable" ? copy.copyUnavailable : idleLabel ?? copy.copy;
  return <span className="copy-value"><button ref={buttonRef} className="button button--quiet" type="button" onClick={() => void copyValue()}>{label}</button><span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{copyState === "idle" ? "" : label}</span></span>;
}
