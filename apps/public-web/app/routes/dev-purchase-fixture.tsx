/**
 * Development-only purchase fixture page (see app/lib/dev-catalog-flag.ts):
 * the real NVDA Dossier with the purchase panel rendered from one reducer
 * fixture instead of the live island. No RPC, no wallet; every action is a
 * no-op. Used for screenshot evidence of states that need a wallet or the
 * network. Never part of a build or the prerender list.
 */
import { data, type LoaderFunctionArgs } from "react-router";
import { isPanelFixtureName } from "@benten/purchase/fixtures";
import { SiteShell } from "@/components/site/site-shell";
import { DossierPage } from "@/features/dossier/dossier-page";
import { PurchasePanelFixture } from "@/features/purchase-island/purchase-panel-fixture";
import { DEFAULT_LOCALE, isPublicWebLocale } from "@/i18n/locales";
import { createDossierView } from "../lib/dossier.server.js";

const FIXED_ROUTE_TICKER = "NVDA";

export function loader({ params, request }: LoaderFunctionArgs) {
  const name = params.fixture;
  if (!isPanelFixtureName(name)) throw new Response("Unknown fixture", { status: 404 });
  const requested = new URL(request.url).searchParams.get("locale");
  const locale = isPublicWebLocale(requested) ? requested : DEFAULT_LOCALE;
  return data({ document: { locale }, fixture: name, view: createDossierView(FIXED_ROUTE_TICKER) });
}

type FixtureLoaderData = Awaited<ReturnType<typeof loader>>["data"];

export default function DevPurchaseFixture({ loaderData }: { loaderData: FixtureLoaderData }) {
  const { document, fixture, view } = loaderData;
  return (
    <SiteShell locale={document.locale} page={{ kind: "dossier", ticker: view.identity.ticker }}>
      <DossierPage view={view} locale={document.locale} purchaseFixture={<PurchasePanelFixture name={fixture} locale={document.locale} />} />
    </SiteShell>
  );
}
