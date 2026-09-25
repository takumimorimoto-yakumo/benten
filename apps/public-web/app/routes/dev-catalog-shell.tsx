/**
 * Living Catalog, app shell section (development only; see
 * app/lib/dev-catalog-flag.ts). The page itself sits in the real shell
 * (header, tabs, wallet, back); below are the shell's own components in
 * their prerendered states and the tab pages. The wallet states that need a
 * wallet (connected, locked) are shown by connecting the browser's own
 * wallet in the header; no fixture wallet is injected here. The theme menu
 * is the one in the header (its radios share one name per document); switch
 * it to see every specimen, and the theme token swatches, in both themes.
 */
import { HeaderDisclosure } from "@/components/site/header-disclosure";
import { buttonVariants } from "@/components/ui/button";
import { ActivityPage } from "@/features/activity/activity-page";
import { HoldingsPage } from "@/features/holdings/holdings-page";
import { WalletMenu } from "@/features/wallet-session/wallet-menu";
import { SiteShell } from "@/components/site/site-shell";
import { ACTIVITY_FIXTURE_NAMES } from "@/features/activity/activity-fixtures";
import { HOLDINGS_FIXTURE_NAMES } from "@/features/holdings/holdings-fixtures";

/** The colour tokens Benten names (static.css), each with a light and a dark value. */
const THEME_SWATCHES = [
  "--verified", "--verified-surface", "--attention-surface", "--control-border", "--focus-ring-color", "--disabled-surface", "--disabled-ink",
  "--chart-price", "--chart-revenue", "--chart-revenue-edge", "--chart-net-income", "--chart-before-listing", "--chart-seam", "--scrim",
] as const;

function Specimen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function DevCatalogShell() {
  const locale = "en";
  return (
    <SiteShell locale={locale} page={{ kind: "home" }} parentHref="/_catalog">
      <div className="flex flex-col gap-10">
        <h1 className="text-3xl font-semibold tracking-tight">Living Catalog: app shell</h1>
        <Specimen title="HeaderDisclosure (floating, and in the flow)">
          <div className="flex flex-wrap items-start gap-6">
            <HeaderDisclosure summaryClassName={buttonVariants({ variant: "outline" })} summary="Floating panel">
              {(close) => <button type="button" className="px-2 py-1.5 text-sm" onClick={close}>Close from inside</button>}
            </HeaderDisclosure>
            <HeaderDisclosure floating={false} summaryClassName={buttonVariants({ variant: "default" })} summary="Panel in the flow">
              {() => <p className="px-2 py-1.5 text-sm text-muted-foreground">Panel content.</p>}
            </HeaderDisclosure>
          </div>
        </Specimen>
        <Specimen title="Theme tokens (switch the header theme menu to compare)">
          <ul className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            {THEME_SWATCHES.map((token) => (
              <li key={token} className="flex items-center gap-2">
                <span aria-hidden="true" className="size-8 shrink-0 rounded-md border" style={{ background: `var(${token})` }} />
                <code className="text-xs">{token}</code>
              </li>
            ))}
          </ul>
        </Specimen>
        <Specimen title="WalletMenu (header and page variants; live session)">
          <div className="flex flex-wrap items-start gap-6">
            <WalletMenu locale={locale} variant="header" />
            <WalletMenu locale={locale} variant="page" />
          </div>
        </Specimen>
        <Specimen title="Holdings page (live session state)">
          <div className="rounded-lg border border-dashed p-4"><HoldingsPage locale={locale} /></div>
        </Specimen>
        <Specimen title="Activity page (this browser's history)">
          <div className="rounded-lg border border-dashed p-4"><ActivityPage locale={locale} /></div>
        </Specimen>
        <Specimen title="Holdings and Activity states (fixture pages in the real shell)">
          <ul className="flex flex-col gap-1 text-sm">
            {HOLDINGS_FIXTURE_NAMES.map((name) => (
              <li key={name}><a className="underline underline-offset-4" href={`/_catalog/portfolio/holdings-${name}`}>Holdings: {name}</a></li>
            ))}
            {ACTIVITY_FIXTURE_NAMES.map((name) => (
              <li key={name}><a className="underline underline-offset-4" href={`/_catalog/portfolio/activity-${name}`}>Activity: {name}</a></li>
            ))}
          </ul>
        </Specimen>
      </div>
    </SiteShell>
  );
}
