import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept current. `false` in the prerender and
 * during hydration, so the first client render equals the static document.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
