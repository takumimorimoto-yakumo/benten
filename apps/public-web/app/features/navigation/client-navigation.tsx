/**
 * Client-side navigation for every internal link (app IA section 3.3).
 *
 * The shell's own links (tabs, header, back, language) are React Router
 * `Link`s. Page content keeps plain anchors, which the prerendered documents
 * need anyway: without JavaScript they are ordinary links. After hydration
 * this one delegated listener turns a plain same-origin click on such an
 * anchor into a router navigation, so the document is not reloaded and the
 * wallet session and a purchase being tracked survive. The router loads the
 * target's prerendered `.data` file; no page component had to change.
 *
 * Left alone (the browser handles them): modified or non-primary clicks,
 * `target` other than `_self`, `download`, other origins, API and asset
 * paths, and a hash-only jump within the same document.
 */
import { useEffect } from "react";
import { useNavigate, type NavigateFunction } from "react-router";
import { SOLANA_RPC_RELAY_PATH } from "@benten/solana-rpc-relay/config";

/** Same-origin paths that are never app documents. */
const NON_DOCUMENT_PREFIXES = ["/api/", "/assets/", "/__"] as const;

export function isClientNavigable(url: URL, current: Location): boolean {
  if (url.origin !== current.origin) return false;
  if (url.pathname === SOLANA_RPC_RELAY_PATH || url.pathname === "/api" || NON_DOCUMENT_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return false;
  const sameDocument = url.pathname === current.pathname && url.search === current.search;
  return !(sameDocument && url.hash !== "");
}

/** The router's navigate function once the shell has hydrated; null in the prerender and outside the app. */
let appNavigate: NavigateFunction | null = null;

/**
 * Open an app path from code (for example a search result): a client-side
 * navigation once the shell is interactive, a document load otherwise.
 */
export function navigateInApp(path: string, options: { replace?: boolean } = {}): void {
  if (appNavigate) {
    void appNavigate(path, { replace: options.replace ?? false });
    return;
  }
  if (options.replace) window.location.replace(path);
  else window.location.assign(path);
}

export function ClientNavigation() {
  const navigate = useNavigate();
  useEffect(() => {
    appNavigate = navigate;
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      if (!isClientNavigable(url, window.location)) return;
      event.preventDefault();
      void navigate(`${url.pathname}${url.search}${url.hash}`);
    }
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      if (appNavigate === navigate) appNavigate = null;
    };
  }, [navigate]);
  return null;
}
