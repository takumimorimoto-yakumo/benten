import { Badge } from "@/components/ui/badge";
import { AccountingTerm } from "@/features/statements/accounting-term";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatScalar } from "@/i18n/format";
import { sourceFiscalYearLabel } from "@/i18n/fiscal-year";
import { messagesFor } from "@/i18n/messages";
import type { PublicWebLocale } from "@/i18n/locales";
import type { FundamentalsField } from "@benten/registry";
import { LEGACY_GROUPS, LEGACY_VALUE_KINDS, type DossierView } from "./dossier-view";

/**
 * A legacy value as text. The fiscal year is the source's own label with no
 * period end, so it is quoted as such rather than shown as a bare year.
 */
function legacyValueText(field: FundamentalsField, value: string | number | null, locale: PublicWebLocale): string {
  if (field === "metrics_fiscal_year" && value !== null && value !== "") return sourceFiscalYearLabel(value, locale, "value");
  return formatScalar(value, locale, LEGACY_VALUE_KINDS[field]);
}

/**
 * The legacy snapshot is secondary, visibly labelled legacy with an unknown
 * source, and never presented as current or as a price.
 */
export function LegacySnapshotSection({ view, locale }: { view: DossierView; locale: PublicWebLocale }) {
  const copy = messagesFor(locale).dossier.legacy;
  const legacy = view.legacy;
  return (
    <Card aria-labelledby="legacy-snapshot-heading" role="region" className="bg-muted/30">
      <CardHeader>
        <CardTitle><h2 id="legacy-snapshot-heading">{copy.heading}</h2></CardTitle>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{copy.unverified}</Badge>
          <Badge variant="outline">{copy.sourceUnknown}</Badge>
        </div>
        <CardDescription>{legacy ? copy.note(sourceFiscalYearLabel(legacy.asOf, locale, "asOf"), copy.source) : copy.unavailable}</CardDescription>
      </CardHeader>
      {legacy ? (
        <CardContent className="grid gap-6 md:grid-cols-2">
          {LEGACY_GROUPS.map((group) => (
            <Table key={group.key}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col"><AccountingTerm>{copy.groups[group.key]}</AccountingTerm></TableHead>
                  <TableHead scope="col" className="text-right">{copy.valueColumn}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.fields.map((field) => (
                  <TableRow key={field}>
                    <TableCell className="whitespace-normal text-muted-foreground">{copy.fields[field]}</TableCell>
                    <TableCell className={LEGACY_VALUE_KINDS[field] === "quantity" ? "text-right font-mono tabular-nums" : "text-right"}>{legacyValueText(field, legacy.values[field], locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
