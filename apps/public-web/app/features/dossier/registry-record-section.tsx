import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "@/components/external-link";
import { FactList } from "@/components/fact-list";
import { formatNumber, formatSourceDate } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import type { PublicWebLocale } from "@/i18n/locales";
import type { DossierView } from "./dossier-view";

/** Technical token identity from the registry, with full (never abbreviated) addresses. */
export function RegistryRecordSection({ view, locale }: { view: DossierView; locale: PublicWebLocale }) {
  const messages = messagesFor(locale).dossier;
  const copy = messages.registry;
  const { identity } = view;
  return (
    <Card aria-labelledby="registry-record-heading" role="region">
      <CardHeader>
        <CardTitle><h2 id="registry-record-heading">{copy.heading}</h2></CardTitle>
        <CardDescription>{copy.note}</CardDescription>
      </CardHeader>
      <CardContent>
        <FactList
          items={[
            { label: copy.underlyingTicker, value: identity.ticker },
            ...(identity.secRegistrant ? [{ label: copy.secRegistrant, value: <span data-sec-registrant="">{copy.secRegistrantValue(identity.secRegistrant.name, identity.secRegistrant.cik)}</span> }] : []),
            { label: copy.tokenSymbol, value: identity.symbol },
            { label: copy.tokenName, value: identity.tokenName },
            { label: copy.mint, value: identity.mint, identifier: true },
            { label: copy.issuer, value: identity.issuer, identifier: true },
            { label: copy.issuerVerified, value: identity.issuerVerified ? copy.yes : copy.no },
            { label: copy.tokenDecimals, value: formatNumber(identity.decimals, locale, "identifier") },
            {
              label: copy.source,
              value: (
                <span className="flex flex-col gap-1">
                  <ExternalLink href={identity.registrySourceUrl} newTabLabel={messages.verified.opensNewTab}>
                    {new URL(identity.registrySourceUrl).host}
                  </ExternalLink>
                  <span className="text-muted-foreground">{copy.asOf(formatSourceDate(identity.registryAsOf, locale))}</span>
                </span>
              ),
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
