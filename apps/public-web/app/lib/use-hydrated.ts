import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/** False in the prerender and during hydration, true once the page is interactive. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
