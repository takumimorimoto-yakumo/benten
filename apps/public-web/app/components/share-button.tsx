import { useRef, useState } from "react";
import { LinkIcon, Share2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PublicWebLocale } from "@/i18n/locales";
import { SHARE_MESSAGES } from "@/i18n/shell-messages";
import { COPY_FEEDBACK_MS, copyText } from "@/lib/clipboard";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

type ShareMode = "share" | "copy";

/** The page's own address: origin and path only, so a filter hash or query never travels with the link. */
export function shareableUrl(location: Pick<Location, "origin" | "pathname">): string {
  return `${location.origin}${location.pathname}`;
}

/** Web Share where the browser offers it for a URL; otherwise Copy link. */
export function shareModeOf(navigatorLike: Partial<Pick<Navigator, "share" | "canShare">>, url: string): ShareMode {
  if (typeof navigatorLike.share !== "function") return "copy";
  if (typeof navigatorLike.canShare === "function" && !navigatorLike.canShare({ url })) return "copy";
  return "share";
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

/**
 * A quiet Share action for company and product pages (app IA sections 3.4
 * and 10). It opens the system share sheet through the Web Share API with the
 * page's title and address; where the browser has no share sheet it is Copy
 * link, with a visible and announced Copied / unavailable outcome. Closing
 * the share sheet is not an error. Before hydration it keeps its place but is
 * invisible and unfocusable, because without JavaScript it would do nothing.
 */
export function ShareButton({ locale, className }: { locale: PublicWebLocale; className?: string }) {
  const copy = SHARE_MESSAGES[locale];
  const hydrated = useHydrated();
  const [outcome, setOutcome] = useState<"idle" | "copied" | "unavailable">("idle");
  const timer = useRef<number | null>(null);
  const url = hydrated ? shareableUrl(window.location) : "";
  const mode: ShareMode = hydrated ? shareModeOf(navigator, url) : "share";

  function show(next: "copied" | "unavailable") {
    if (timer.current) window.clearTimeout(timer.current);
    setOutcome(next);
    timer.current = window.setTimeout(() => setOutcome("idle"), COPY_FEEDBACK_MS);
  }

  async function copyLink() {
    show((await copyText(url)) ? "copied" : "unavailable");
  }

  async function onClick() {
    if (mode === "copy") return copyLink();
    try {
      await navigator.share({ title: document.title, url });
    } catch (error) {
      // Closing the share sheet is the user's choice; any other refusal falls back to copying the link.
      if (!isAbort(error)) await copyLink();
    }
  }

  const label = outcome === "copied" ? copy.copied : outcome === "unavailable" ? copy.unavailable : mode === "share" ? copy.share : copy.copyLink;
  const Icon = mode === "share" ? Share2Icon : LinkIcon;
  return (
    <span className={cn("inline-flex", className)} data-share="" data-share-mode={hydrated ? mode : "pending"}>
      <Button
        type="button"
        variant="ghost"
        className={cn("-ms-2.5 h-(--touch-target-min) md:h-8", !hydrated && "invisible")}
        aria-hidden={hydrated ? undefined : true}
        tabIndex={hydrated ? undefined : -1}
        onClick={() => void onClick()}
      >
        <Icon aria-hidden="true" />
        {label}
      </Button>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{outcome === "idle" ? "" : label}</span>
    </span>
  );
}
