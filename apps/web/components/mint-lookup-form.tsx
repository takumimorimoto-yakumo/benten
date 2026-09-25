"use client";

import { useId, useRef, useState } from "react";
import type { ResultReason } from "@/lib/public-result";
import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

export function MintLookupForm({ defaultMint, locale = "en", loading, onResolve, onInvalid, onEdit, initialError = null }: {
  defaultMint: string; locale?: Locale; loading: boolean;
  onResolve: (mint: string) => Promise<Extract<ResultReason, "invalid_input" | "unknown_mint"> | null>;
  onInvalid: () => void; onEdit: () => void; initialError?: string | null;
}) {
  const copy = messagesFor(locale).home;
  const stateCopy = messagesFor(locale).states;
  const [mint, setMint] = useState(defaultMint);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [error, setError] = useState<string | null>(initialError);

  async function submit(mintToResolve: string) {
    if (!mintToResolve.trim()) {
      setError(stateCopy.invalid); inputRef.current?.focus(); onInvalid(); return;
    }
    setError(null);
    const reason = await onResolve(mintToResolve);
    if (reason === "unknown_mint") { setError(stateCopy.unknown); inputRef.current?.focus(); onInvalid(); }
    if (reason === "invalid_input") { setError(stateCopy.invalid); inputRef.current?.focus(); onInvalid(); }
  }
  return <form className="mint-lookup" onSubmit={(event) => { event.preventDefault(); void submit(mint); }}>
    <label htmlFor="mint-input">{copy.lookupLabel}</label>
    <input id="mint-input" ref={inputRef} name="mint" value={mint}
      onChange={(event) => { setMint(event.target.value); setError(null); onEdit(); }}
      aria-describedby={error ? errorId : undefined} aria-invalid={Boolean(error)} autoComplete="off" spellCheck="false" />
    {error ? <p className="field-error" id={errorId} role="alert">{error}</p> : null}
    <div className="mint-lookup__actions">
      <button className="button button--primary" type="submit" disabled={loading}>{loading ? copy.resolving : copy.resolve}</button>
      <button className="button button--quiet" type="button" disabled={loading} onClick={() => { setMint(defaultMint); onEdit(); void submit(defaultMint); }}>{copy.tryNvda}</button>
    </div>
  </form>;
}
