import type { ReactNode } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { withTrailingMark } from "./text-breaks";

/**
 * A link to a primary source outside Benten. Always opens a new tab and says
 * so. The icon stays on the line of the link's last word, so it never wraps
 * alone.
 */
export function ExternalLink({ href, children, newTabLabel, className }: { href: string; children: ReactNode; newTabLabel: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground", className)}
    >
      {/* One wrapper, so a flex link (the purchase panel's) keeps the space before the last word. */}
      <span>{withTrailingMark(children, <ExternalLinkIcon aria-hidden="true" className="ms-1 inline size-3.5 align-text-bottom" />)}</span>
      <span className="sr-only">{newTabLabel}</span>
    </a>
  );
}
