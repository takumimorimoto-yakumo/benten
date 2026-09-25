import { LayersIcon, ReceiptTextIcon, SearchIcon, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { APP_TABS, tabOf, tabPath, type AppTab } from "@/features/navigation/app-tabs";
import { messagesFor } from "@/i18n/messages";
import type { PublicPage, PublicWebLocale } from "@/i18n/locales";
import { shellMessagesFor } from "@/i18n/shell-messages";

const TAB_ICONS: Record<AppTab, LucideIcon> = { explore: SearchIcon, holdings: LayersIcon, activity: ReceiptTextIcon };

/**
 * The app's three destinations, always with text labels (app IA sections
 * 3.1 and 3.2). One navigation landmark at a time: from `md` it sits in the
 * header (`placement="header"`); below `md` it is the tab bar fixed to the
 * bottom of the viewport, above the bottom safe area (`placement="bar"`),
 * rendered after the page so keyboard focus reaches it after the page, in
 * the order it is seen. The other placement is `display: none`. The current
 * tab is marked with `aria-current` and a filled background, never by
 * colour alone.
 */
const PLACEMENT_CLASS = {
  header: "ms-4 max-md:hidden",
  bar: "fixed inset-x-0 bottom-0 z-40 border-t bg-background ps-(--safe-area-left) pe-(--safe-area-right) pb-(--safe-area-bottom) md:hidden",
} as const;

export function AppNav({ locale, page, placement }: { locale: PublicWebLocale; page: PublicPage; placement: keyof typeof PLACEMENT_CLASS }) {
  const copy = shellMessagesFor(locale).nav;
  const current = tabOf(page);
  return (
    <nav
      aria-label={messagesFor(locale).site.primaryNavigation}
      data-app-tabs={placement}
      className={PLACEMENT_CLASS[placement]}
    >
      <ul className="grid h-(--app-tab-bar-height) grid-cols-3 md:flex md:h-auto md:gap-1">
        {APP_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab];
          const selected = tab === current;
          return (
            <li key={tab} className="flex">
              <Link
                to={tabPath(locale, tab)}
                aria-current={selected ? "page" : undefined}
                data-app-tab={tab}
                className="group/tab flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground outline-none hover:text-foreground aria-[current=page]:text-foreground md:h-8 md:flex-row md:gap-1.5 md:rounded-lg md:px-2.5 md:text-sm md:aria-[current=page]:bg-muted"
              >
                <span className="flex h-(--app-tab-indicator-height) w-(--app-tab-indicator-width) items-center justify-center rounded-full group-aria-[current=page]/tab:bg-muted md:size-auto md:group-aria-[current=page]/tab:bg-transparent">
                  <Icon aria-hidden="true" className="size-5 md:size-4" />
                </span>
                {copy[tab]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
