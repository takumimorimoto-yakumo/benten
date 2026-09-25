"use client";

import { useRef, useState } from "react";
import { MCP_COMMANDS } from "@/lib/site-copy";
import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

export function McpSetupPanel({ locale = "en", initiallyCopied = false }: { locale?: Locale; initiallyCopied?: boolean }) {
  const copy = messagesFor(locale).mcp;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "unavailable">(initiallyCopied ? "copied" : "idle");
  const buttonRef = useRef<HTMLButtonElement>(null); const resetTimer = useRef<number | null>(null);
  async function copyCommands() {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    let didCopy = false;
    try { if (navigator.clipboard) { await navigator.clipboard.writeText(MCP_COMMANDS); didCopy = true; } } catch { /* fallback */ }
    if (!didCopy) {
      const fallback = document.createElement("textarea"); fallback.value = MCP_COMMANDS; fallback.setAttribute("readonly", ""); fallback.style.position = "fixed"; fallback.style.opacity = "0";
      document.body.append(fallback); fallback.select();
      try { didCopy = document.execCommand("copy"); } catch { didCopy = false; }
      fallback.remove();
    }
    setCopyState(didCopy ? "copied" : "unavailable"); buttonRef.current?.focus();
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 1800);
  }
  const copyLabel = copyState === "copied" ? copy.copied : copyState === "unavailable" ? copy.unavailable : copy.copy;
  return <aside className="mcp-panel" aria-labelledby="mcp-heading"><p className="eyebrow">{copy.eyebrow}</p><h2 id="mcp-heading">{copy.heading}</h2><p>{copy.description}</p><pre><code>{MCP_COMMANDS}</code></pre><button ref={buttonRef} className="button button--inverse" type="button" onClick={() => void copyCommands()}>{copyLabel}</button><p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{copyState === "idle" ? "" : copyLabel}</p></aside>;
}
