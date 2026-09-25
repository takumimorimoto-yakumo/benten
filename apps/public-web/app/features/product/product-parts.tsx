/**
 * Parts shared by the xStock and provider product pages (app IA section
 * 4.5): the title band, the token identity with the full mint, the evidence
 * link, and the capability statements. Static-safe: no island, no wallet.
 */
import type { ReactNode } from "react";
import { InfoIcon } from "lucide-react";
import { Link } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FactList, type FactListItem } from "@/components/fact-list";
import { NoteLink } from "@/components/note-link";
import { ShareButton } from "@/components/share-button";
import { CopyValue } from "@/features/purchase-island/copy-value";
import type { PublicWebLocale } from "@/i18n/locales";
import { productMessagesFor } from "@/i18n/product-messages";
import { cn } from "@/lib/utils";
import type { BuyFlowEntryState } from "@/features/buy-flow/buy-flow";

/** Marks the flow entry as opened from its product page, so the flow's Close goes back instead of stacking a new entry. */
const BUY_ENTRY_STATE: BuyFlowEntryState = { fromProduct: true };

export function ProductHeader({ symbol, name, provider, company, locale }: {
  symbol: string;
  name: string;
  provider: string;
  /** The company line: a link to its page, or plain text when Benten publishes none. */
  company: { name: string; href: string | null; slug: string | null } | null;
  locale: PublicWebLocale;
}) {
  const copy = productMessagesFor(locale).product;
  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="text-3xl font-semibold tracking-tight">{symbol}</h1>
      <p className="text-muted-foreground">{copy.byProvider(name, provider)}</p>
      {company?.href && company.slug ? (
        <NoteLink href={company.href} data-company-page-link={company.slug}>{copy.company(company.name)}</NoteLink>
      ) : company ? (
        <p className="text-sm">{copy.company(company.name)}</p>
      ) : null}
      {/* Quiet, under the title band; required where there is no URL bar (app IA 3.4). */}
      <ShareButton locale={locale} className="self-start" />
    </header>
  );
}

export function SectionCard({ id, heading, children }: { id: string; heading: ReactNode; children: ReactNode }) {
  return (
    <Card aria-labelledby={`${id}-heading`} role="region" id={id}>
      <CardHeader><CardTitle><h2 id={`${id}-heading`}>{heading}</h2></CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">{children}</CardContent>
    </Card>
  );
}

/** Token identity: the full mint with Copy, then the other identity rows and the evidence link. */
export function TokenIdentity({ mint, rows, evidenceHref, locale }: { mint: string; rows: readonly FactListItem[]; evidenceHref: string; locale: PublicWebLocale }) {
  const copy = productMessagesFor(locale).product.identity;
  return (
    <SectionCard id="token-identity" heading={copy.heading}>
      <FactList
        items={[
          { label: copy.mint, value: <span className="flex flex-wrap items-center gap-x-3"><span data-product-mint="">{mint}</span><CopyValue value={mint} copy={copy.copy} /></span>, identifier: true },
          ...rows,
        ]}
      />
      <NoteLink href={evidenceHref} data-evidence-link="">{copy.evidence}</NoteLink>
    </SectionCard>
  );
}

/**
 * The one buyable product's capability: the fact line and the page's one
 * filled button. Below `md` it is the action bar pinned above the tab bar
 * (app IA 4.5); the shell keeps its room at the end of the page
 * (`static.css`). The button is a client-side link to the buy flow, so the
 * flow opens over this page without reloading it.
 */
export function BuyCapability({ symbol, href, locale }: { symbol: string; href: string; locale: PublicWebLocale }) {
  const copy = productMessagesFor(locale).product.capability;
  return (
    <div
      data-term="capability"
      data-product-capability="buyable"
      className="flex flex-col gap-2 max-md:fixed max-md:inset-x-0 max-md:bottom-(--app-tab-bar-space) max-md:z-30 max-md:border-t max-md:bg-background max-md:px-4 max-md:py-3 max-md:ps-[calc(1rem+var(--safe-area-left))] max-md:pe-[calc(1rem+var(--safe-area-right))]"
    >
      <p className="text-sm">{copy.buyable}</p>
      <Link to={href} preventScrollReset state={BUY_ENTRY_STATE} data-cta="buy" className={cn(buttonVariants({ variant: "default", size: "lg" }), "h-(--touch-target-min) w-full")}>
        {copy.buy(symbol)}
      </Link>
    </div>
  );
}

/** A capability stated as fact on a quiet surface, with no link and no button (app IA 4.5 and 11). */
export function CapabilityNote({ kind, heading, body, ...attributes }: { kind: "not-buyable" | "compare-only"; heading: string; body: string } & Readonly<Record<`data-${string}`, string>>) {
  return (
    <div data-term="capability" data-product-capability={kind} {...attributes}>
      <Alert role="note" className="border-0 bg-muted">
        <InfoIcon aria-hidden="true" />
        <AlertTitle><h2>{heading}</h2></AlertTitle>
        <AlertDescription><p>{body}</p></AlertDescription>
      </Alert>
    </div>
  );
}
