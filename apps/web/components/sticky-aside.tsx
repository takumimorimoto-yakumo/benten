"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Desktop right-column aside that stays in view while the main column scrolls.
 *
 * Why the top offset is computed instead of dropping `position: sticky` when
 * the aside is taller than the viewport: the purchase panel ends with its
 * primary action. With a plain `top` offset, a panel taller than the viewport
 * keeps its lower part below the fold until the page itself ends, so the
 * approve button is effectively unreachable. Turning sticky off would make the
 * button scroll away with the page instead. Anchoring the bottom keeps the
 * action in view in both cases: the CSS sets
 * `top: min(sticky-top, 100dvh - height - sticky-top)`, which is the normal
 * offset when the aside fits and a negative offset (bottom edge held
 * `sticky-top` above the viewport bottom) when it does not.
 *
 * This component only measures: it writes the aside's rendered height to
 * `--purchase-panel-height` and mirrors the outcome in `data-fits` so tests
 * and screenshots can tell which case applies. Without ResizeObserver the
 * variable keeps its `:root` default and the aside behaves as a plain sticky
 * column.
 */
export function StickyAside({ className, labelledBy, children }: { className: string; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => {
      element.style.setProperty("--purchase-panel-height", `${element.offsetHeight}px`);
      // Resolved after the variable changes; negative means the bottom is anchored.
      // Below the desktop breakpoint the aside is in normal flow, so no value applies.
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
  return <aside ref={ref} className={className} aria-labelledby={labelledBy}>{children}</aside>;
}
