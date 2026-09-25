import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

/**
 * After a client-side page change, focus moves to the new page's `h1` (app
 * IA section 3.3), so screen reader and keyboard users start at the top of
 * the new content. The first load is left alone, and so is a hash-only
 * change within one page. The heading is focusable only programmatically.
 */
export function RouteFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const heading = document.querySelector("main h1");
    if (!(heading instanceof HTMLElement)) return;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
