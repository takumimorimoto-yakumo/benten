/**
 * Development-only Holdings and Activity fixture pages (see
 * app/lib/dev-catalog-flag.ts): the real tab layouts with one fixture state
 * each, for the Living Catalog and screenshot evidence of states that need a
 * wallet, the relay or stored records. No RPC, no wallet, nothing stored in
 * this browser. Never part of a build or the prerender list.
 *
 * `/_catalog/portfolio/holdings-<state>` and `/_catalog/portfolio/activity-<state>`,
 * with `?locale=` for the other languages.
 */
import { useMemo } from "react";
import { data, type LoaderFunctionArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { ActivityPage } from "@/features/activity/activity-page";
import { ACTIVITY_FIXTURE_NAMES, activityFixture, type ActivityFixtureName } from "@/features/activity/activity-fixtures";
import { HoldingsPage } from "@/features/holdings/holdings-page";
import { FIXTURE_NOW_MS, FIXTURE_WALLET, HOLDINGS_FIXTURE_NAMES, holdingsFixture, type HoldingsFixtureName } from "@/features/holdings/holdings-fixtures";
import { HoldingsConnected, holdingsStateName } from "@/features/holdings/holdings-view";
import { DEFAULT_LOCALE, isPublicWebLocale } from "@/i18n/locales";
import { shellMessagesFor } from "@/i18n/shell-messages";
import { createActivityCatalog, createHoldingsProducts } from "../lib/portfolio-catalog.server.js";

type Fixture = { tab: "holdings"; name: HoldingsFixtureName } | { tab: "activity"; name: ActivityFixtureName };

function parseFixture(value: string | undefined): Fixture | null {
  if (value?.startsWith("holdings-")) {
    const name = value.slice("holdings-".length);
    return (HOLDINGS_FIXTURE_NAMES as readonly string[]).includes(name) ? { tab: "holdings", name: name as HoldingsFixtureName } : null;
  }
  if (value?.startsWith("activity-")) {
    const name = value.slice("activity-".length);
    return (ACTIVITY_FIXTURE_NAMES as readonly string[]).includes(name) ? { tab: "activity", name: name as ActivityFixtureName } : null;
  }
  return null;
}

export function loader({ params, request }: LoaderFunctionArgs) {
  const fixture = parseFixture(params.fixture);
  if (!fixture) throw new Response("Unknown fixture", { status: 404 });
  const requested = new URL(request.url).searchParams.get("locale");
  const locale = isPublicWebLocale(requested) ? requested : DEFAULT_LOCALE;
  return data({ locale, fixture, products: createHoldingsProducts(locale), catalog: createActivityCatalog(locale) });
}

type LoaderData = Awaited<ReturnType<typeof loader>>["data"];

function HoldingsFixture({ loaderData }: { loaderData: LoaderData }) {
  const { locale, fixture, products } = loaderData;
  const byMint = useMemo(() => new Map(products.map((product) => [product.mint, product])), [products]);
  const screen = fixture.tab === "holdings" ? holdingsFixture(fixture.name, byMint) : null;
  if (!screen) return <HoldingsPage locale={locale} products={products} />;
  return (
    <div className="flex max-w-4xl flex-col gap-4" data-holdings-state="connected" data-holdings-fixture={holdingsStateName(screen)}>
      <h1 className="text-3xl font-semibold tracking-tight">{shellMessagesFor(locale).holdings.heading}</h1>
      <HoldingsConnected locale={locale} address={FIXTURE_WALLET} screen={screen} onRefresh={() => undefined} nowMs={FIXTURE_NOW_MS} />
    </div>
  );
}

function ActivityFixture({ loaderData }: { loaderData: LoaderData }) {
  const { locale, fixture, catalog } = loaderData;
  const seeded = useMemo(() => activityFixture(fixture.tab === "activity" ? fixture.name : "empty", catalog, FIXTURE_NOW_MS), [fixture, catalog]);
  return <ActivityPage locale={locale} catalog={catalog} store={seeded.store} check={seeded.check} nowMs={FIXTURE_NOW_MS} />;
}

export default function DevPortfolioFixture({ loaderData }: { loaderData: LoaderData }) {
  const { locale, fixture } = loaderData;
  return (
    <SiteShell locale={locale} page={{ kind: fixture.tab }}>
      {fixture.tab === "holdings" ? <HoldingsFixture loaderData={loaderData} /> : <ActivityFixture loaderData={loaderData} />}
    </SiteShell>
  );
}
