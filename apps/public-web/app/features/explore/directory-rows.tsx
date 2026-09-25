import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { companyMessagesFor } from "@/i18n/company-messages";
import { companyPath, dossierPath, type PublicWebLocale } from "@/i18n/locales";
import type { CompanyRow, TokenRow } from "./directory-view";

/** The one text tag a buyable product carries in lists: a capability, not a highlight. */
export function BuyInBentenTag({ locale }: { locale: PublicWebLocale }) {
  return <Badge variant="outline" data-term="buy-in-benten">{companyMessagesFor(locale).buyInBenten}</Badge>;
}

function RowLink({ href, name, aside, attributes }: { href: string; name: string; aside: ReactNode; attributes: Readonly<Record<`data-${string}`, string>> }) {
  return (
    <a
      href={href}
      {...attributes}
      className="flex min-h-(--touch-target-min) items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-muted max-sm:flex-wrap"
    >
      <span className="min-w-0 font-medium break-words">{name}</span>
      <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm text-muted-foreground">{aside}</span>
    </a>
  );
}

/** Letters and digits only, case-folded: "Figure AI" and "FIGUREAI" compare alike. */
function compactName(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** A symbol that only repeats the company name (PreStocks' "ANDURIL") is not shown again. */
export function repeatsName(symbol: string, name: string): boolean {
  return compactName(symbol) === compactName(name);
}

/** A company row: name, then each product's symbol (unless it repeats the name) and issuer. It opens the company page. */
export function CompanyRowLink({ row, locale }: { row: CompanyRow; locale: PublicWebLocale }) {
  const copy = companyMessagesFor(locale);
  return (
    <RowLink
      href={companyPath(locale, row.slug)}
      name={row.name}
      attributes={{ "data-directory-company": row.slug }}
      aside={(
        <>
          {row.buyInBenten ? <BuyInBentenTag locale={locale} /> : null}
          {row.products.map((product) => (
            <span key={`${product.provider}/${product.symbol}`} className="whitespace-nowrap">
              {repeatsName(product.symbol, row.name) ? null : <><span className="text-foreground">{product.symbol}</span> </>}{copy.providers[product.provider]}
            </span>
          ))}
        </>
      )}
    />
  );
}

/** A token row for a token without a company page: token name and symbol. It opens the token page. */
export function TokenRowLink({ row, locale }: { row: TokenRow; locale: PublicWebLocale }) {
  return (
    <RowLink
      href={dossierPath(locale, row.ticker)}
      name={row.name}
      attributes={{ "data-directory-token": row.ticker }}
      aside={(
        <>
          {row.buyInBenten ? <BuyInBentenTag locale={locale} /> : null}
          <span className="whitespace-nowrap text-foreground">{row.symbol}</span>
        </>
      )}
    />
  );
}

/** A bordered list of rows. */
export function RowList({ children, label }: { children: ReactNode; label?: string }) {
  return <ul aria-label={label} className="divide-y overflow-hidden rounded-lg border">{children}</ul>;
}
