import { ArrowLeftIcon } from "lucide-react";

/** The quiet return link at the top of a record page, styled like the Dossier's. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground max-md:min-h-(--touch-target-min)">
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      {children}
    </a>
  );
}
