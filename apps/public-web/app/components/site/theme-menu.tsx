import { useEffect, useRef } from "react";
import { CheckIcon, ChevronDownIcon, MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from "lucide-react";
import { HEADER_MENU_BUTTON_CLASS, HeaderDisclosure } from "@/components/site/header-disclosure";
import { buttonVariants } from "@/components/ui/button";
import { syncThemeInputs } from "@/features/theme/theme-boot";
import { THEME_BOOT_CONFIG, THEME_CHOICES, type ThemeChoice } from "@/features/theme/theme-config";
import type { PublicWebLocale } from "@/i18n/locales";
import { shellMessagesFor } from "@/i18n/shell-messages";
import { cn } from "@/lib/utils";

const THEME_ICONS: Record<ThemeChoice, LucideIcon> = { system: MonitorIcon, light: SunIcon, dark: MoonIcon };

/**
 * The header's theme menu: System, Light or Dark, as one native radio group
 * in the same disclosure as the language list. The theme boot script in the
 * document head does the work (it stores and applies a choice on the radios'
 * `change` event and checks the applied one), so the menu needs no React
 * state and works in documents that do not hydrate. The button shows the
 * choice's icon through CSS on `data-theme-choice` (`static.css`), so the
 * prerender and the hydrated page never differ. After hydration a choice
 * closes the menu and returns focus to its button: a click or Space on an
 * option, or Enter. The arrow keys only move through the options (each one
 * applies as it is checked), so a keyboard user can compare them first.
 */
export function ThemeMenu({ locale }: { locale: PublicWebLocale }) {
  const copy = shellMessagesFor(locale).theme;
  const group = useRef<HTMLFieldSetElement>(null);
  // Set by an arrow key, whose default action checks the next radio: that change moves, it does not choose.
  const arrowKey = useRef(false);
  // A page change renders fresh, unchecked radios: check the applied choice again.
  useEffect(() => {
    if (group.current) syncThemeInputs(group.current.ownerDocument);
  });
  return (
    <HeaderDisclosure
      data-theme-menu=""
      summaryClassName={cn(buttonVariants({ variant: "ghost" }), HEADER_MENU_BUTTON_CLASS)}
      summary={
        <>
          {THEME_CHOICES.map((choice) => {
            const Icon = THEME_ICONS[choice];
            return <Icon key={choice} aria-hidden="true" data-theme-icon={choice} />;
          })}
          <span className="sr-only">{copy.label}</span>
          <ChevronDownIcon aria-hidden="true" className="text-muted-foreground max-md:hidden" />
        </>
      }
    >
      {(close) => (
        <fieldset
          ref={group}
          className="flex flex-col"
          onKeyDown={(event) => {
            arrowKey.current = event.key.startsWith("Arrow");
            if (event.key !== "Enter") return;
            // Without this the same Enter would reach the button that now has focus and open the menu again.
            event.preventDefault();
            close();
          }}
          onKeyUp={() => { arrowKey.current = false; }}
          onChange={() => {
            if (arrowKey.current) arrowKey.current = false;
            else close();
          }}
        >
          <legend className="sr-only">{copy.label}</legend>
          {THEME_CHOICES.map((choice) => {
            const Icon = THEME_ICONS[choice];
            return (
              <label
                key={choice}
                data-theme-option={choice}
                className="group/option flex min-h-(--touch-target-min) cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent has-checked:font-medium md:min-h-8"
              >
                <input type="radio" name={THEME_BOOT_CONFIG.inputName} value={choice} className="sr-only" />
                <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                <span className="flex-1">{copy[choice]}</span>
                <CheckIcon aria-hidden="true" className="invisible size-4 group-has-checked/option:visible" />
              </label>
            );
          })}
        </fieldset>
      )}
    </HeaderDisclosure>
  );
}
