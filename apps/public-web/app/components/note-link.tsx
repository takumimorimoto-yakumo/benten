import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One secondary link on its own line, under the content it relates to (for
 * example "See every instrument linked to OpenAI"). Below `md` it keeps the
 * minimum touch target height.
 */
export function NoteLink({ href, children, className, ...attributes }: { href: string; children: ReactNode; className?: string } & Readonly<Record<`data-${string}`, string>>) {
  return (
    <p className={cn("text-sm", className)} {...attributes}>
      <a href={href} className="font-medium underline underline-offset-4 hover:text-muted-foreground max-md:inline-flex max-md:min-h-(--touch-target-min) max-md:items-center">
        {children}
      </a>
    </p>
  );
}
