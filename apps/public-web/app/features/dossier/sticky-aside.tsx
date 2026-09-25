import { useEffect, useRef, type ReactNode } from "react";

/**
 * The Dossier's purchase rail. From the desktop breakpoint it stays in view
 * while the main column scrolls, and the CSS in `static.css` sets
 * `top: min(sticky-top, 100dvh - height - sticky-top)`: the normal offset when
 * the rail fits, and its bottom edge held above the viewport bottom when it
 * does not, so the panel's primary action (near its end) stays reachable
 * instead of sitting below the fold until the page ends.
 *
 * This component only measures: it writes the rendered height to
 * `--purchase-panel-height` and mirrors the outcome in `data-fits`. Without
 * ResizeObserver the variable keeps its default and the rail is a plain
 * sticky column.
 */
export function StickyAside({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => {
      element.style.setProperty("--purchase-panel-height", `${element.offsetHeight}px`);
      const style = getComputedStyle(element);
      if (style.position === "sticky") element.dataset.fits = String(Number.parseFloat(style.top) >= 0);
      else delete element.dataset.fits;
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <aside ref={ref} aria-label={label} data-sticky-aside="" className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-2">
      {children}
    </aside>
  );
}
