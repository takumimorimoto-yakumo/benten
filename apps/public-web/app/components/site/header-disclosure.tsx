import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";
import { cn } from "@/lib/utils";

/**
 * The header's icon menu buttons (language, theme): a square control of at
 * least 44px below `md`, where they show their icon alone; from `md` the
 * compact desktop height with the label.
 */
export const HEADER_MENU_BUTTON_CLASS = "size-(--app-header-control-size) px-0 md:h-8 md:w-auto md:px-2 group-open/disclosure:bg-muted";

/**
 * A button that shows or hides one panel of links or actions: the header's
 * language list and wallet menu, and the wallet list on a page. It is a
 * native disclosure (`details` / `summary`), so it opens and its links work
 * without JavaScript and it needs no positioning library. After hydration it
 * also closes on a page change, a click outside and Escape, and `children`
 * receives `close` for the choices that finish it; `closeWhen` closes it when
 * it turns true (an outcome that arrives later, such as a wallet connecting).
 * Every close except a click outside returns focus to its button when focus
 * was in the panel (or was lost with a control that went away).
 *
 * `floating` places the panel over the page under the button (header): from
 * `md` under its own button; below `md` against the viewport, hanging from
 * the header and kept between the page gutters (`static.css`), so at 200%
 * text no panel starts off screen. Otherwise it opens in the flow below the
 * button (a page's primary action).
 */
export function HeaderDisclosure({
  summary,
  summaryClassName,
  panelClassName,
  floating = true,
  closeWhen = false,
  children,
  ...attributes
}: {
  summary: ReactNode;
  summaryClassName?: string;
  panelClassName?: string;
  floating?: boolean;
  closeWhen?: boolean;
  children: (close: () => void) => ReactNode;
} & Readonly<Record<`data-${string}`, string>>) {
  const ref = useRef<HTMLDetailsElement>(null);
  const { pathname } = useLocation();
  const close = useCallback(() => {
    const details = ref.current;
    if (!details?.open) return;
    const active = details.ownerDocument.activeElement;
    const focusInPanel = active === null || active === details.ownerDocument.body || details.contains(active);
    details.open = false;
    if (focusInPanel) details.querySelector("summary")?.focus();
  }, []);

  useEffect(close, [pathname, close]);
  useEffect(() => {
    if (closeWhen) close();
  }, [closeWhen, close]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const details = ref.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    }
    function onKeyDown(event: KeyboardEvent) {
      const details = ref.current;
      if (event.key !== "Escape" || !details?.open) return;
      details.open = false;
      details.querySelector("summary")?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className={cn("group/disclosure", floating ? "relative" : "flex flex-col gap-2")} {...attributes}>
      <summary className={cn("cursor-pointer list-none [&::-webkit-details-marker]:hidden", summaryClassName)}>{summary}</summary>
      <div
        className={cn(
          "rounded-lg bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10",
          floating
            ? "absolute end-0 top-full z-50 mt-1 w-max min-w-(--app-menu-min-width) max-w-(--app-menu-max-width) shadow-md max-md:fixed max-md:end-(--app-menu-narrow-end) max-md:top-(--app-menu-top) max-md:max-h-(--app-menu-narrow-max-height) max-md:min-w-(--app-menu-narrow-min-width) max-md:max-w-(--app-menu-narrow-max-width) max-md:overflow-y-auto"
            : "w-full max-w-(--app-menu-max-width)",
          panelClassName,
        )}
      >
        {children(close)}
      </div>
    </details>
  );
}
