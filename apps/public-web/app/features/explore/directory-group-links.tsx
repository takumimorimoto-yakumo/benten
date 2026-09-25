import { buttonVariants } from "@/components/ui/button";
import { companyMessagesFor } from "@/i18n/company-messages";
import { formatNumber } from "@/i18n/format";
import { companiesPath, type PublicWebLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { DIRECTORY_GROUPS, type DirectoryGroup } from "./directory-view";

/**
 * The companies list's groups as links: All, then each group with its count,
 * each opening `/companies` at that group's hash. On the companies list they
 * are its filter (the selected one is current); on Explore they put all three
 * groups and their counts in the first screen, one tap from the full list.
 * Outlined, never filled: the filled style is kept for a page's one action.
 */
export function DirectoryGroupLinks({ counts, selected, label, locale }: { counts: Readonly<Record<DirectoryGroup, number>>; selected: DirectoryGroup | "all" | null; label: string; locale: PublicWebLocale }) {
  const copy = companyMessagesFor(locale);
  const path = companiesPath(locale);
  const links: { key: DirectoryGroup | "all"; href: string; label: string; count: number | null }[] = [
    { key: "all", href: path, label: copy.companies.all, count: null },
    ...DIRECTORY_GROUPS.map((group) => ({ key: group, href: `${path}#${group}`, label: copy.groups.name[group], count: counts[group] })),
  ];
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => {
          const current = link.key === selected;
          return (
            <li key={link.key}>
              <a
                href={link.href}
                aria-current={current ? "true" : undefined}
                data-directory-filter={link.key}
                className={cn(buttonVariants({ variant: current ? "secondary" : "outline" }), "h-auto min-h-(--touch-target-min) px-3.5 text-sm md:min-h-9")}
              >
                {link.label}
                {link.count === null ? null : <span className="text-muted-foreground">{formatNumber(link.count, locale)}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
