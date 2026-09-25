import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { INITIAL_PURCHASE_STATE, purchaseReducer, type PurchaseState } from "../../../packages/purchase/src/purchase-machine.ts";
import { SiteShell } from "../app/components/site/site-shell.tsx";
import { ActivityPage } from "../app/features/activity/activity-page.tsx";
import { HoldingsPage } from "../app/features/holdings/holdings-page.tsx";
import { isTabRootPath, tabOf, tabPath } from "../app/features/navigation/app-tabs.ts";
import { isClientNavigable } from "../app/features/navigation/client-navigation.tsx";
import { locksDisconnect, sessionTransitionActions } from "../app/features/purchase-island/session-bridge.ts";
import { createWalletSession, INITIAL_WALLET_SESSION, type WalletSessionAdapter, type WalletSessionState } from "../app/features/wallet-session/wallet-session.ts";
import { activityPath, holdingsPath, PUBLIC_WEB_LOCALES, type PublicWebLocale } from "../app/i18n/locales.ts";
import { purchaseMessagesFor } from "../app/i18n/purchase-messages.ts";
import { LOCALE_SHORT_LABELS, SHELL_MESSAGES, shellMessagesFor } from "../app/i18n/shell-messages.ts";
import { buildAppShellPrerenderPaths } from "../app/lib/prerender-paths.server.ts";
import { createStaticFoundationDocument } from "../app/lib/static-document.server.ts";

const ADDRESS = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const OTHER_ADDRESS = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

function fakeAdapter(outcome: Awaited<ReturnType<WalletSessionAdapter["connectWallet"]>> = { kind: "connected", address: ADDRESS, name: "Phantom" }) {
  let onGone: (() => void) | null = null;
  let emit: ((wallets: { supported: { id: string; name: string }[]; unsupported: string[] }) => void) | null = null;
  const adapter: WalletSessionAdapter = {
    watchWallets: vi.fn((onChange) => {
      emit = onChange;
      onChange({ supported: [{ id: "Phantom", name: "Phantom" }], unsupported: ["Legacy"] });
      return () => undefined;
    }),
    connectWallet: vi.fn(async () => outcome),
    disconnectWallet: vi.fn(async () => undefined),
    watchConnectedAccount: vi.fn((_id, _address, gone) => {
      onGone = gone;
      return () => {
        onGone = null;
      };
    }),
  };
  return { adapter, accountGone: () => onGone?.(), emitWallets: (supported: { id: string; name: string }[]) => emit?.({ supported, unsupported: [] }) };
}

/** Replays a sequence of session states into the unchanged purchase reducer, as the island runtime does. */
function replay(states: WalletSessionState[], from: PurchaseState = INITIAL_PURCHASE_STATE): PurchaseState {
  let previous = INITIAL_WALLET_SESSION;
  let purchase = from;
  for (const next of states) {
    for (const action of sessionTransitionActions(previous, next)) purchase = purchaseReducer(purchase, action);
    previous = next;
  }
  return purchase;
}

describe("app wallet session", () => {
  it("detects, connects on request and keeps the connected account", async () => {
    const { adapter } = fakeAdapter();
    const session = createWalletSession(adapter);
    expect(session.getState().detection).toBe("pending");
    session.start();
    expect(session.getState()).toMatchObject({ detection: "done", wallets: [{ id: "Phantom", name: "Phantom" }], unsupported: ["Legacy"] });
    session.connect("Unknown");
    expect(adapter.connectWallet).not.toHaveBeenCalled();
    session.connect("Phantom");
    expect(session.getState().connection).toEqual({ kind: "connecting", walletId: "Phantom" });
    await vi.waitFor(() => expect(session.getState().connection).toEqual({ kind: "connected", walletId: "Phantom", walletName: "Phantom", address: ADDRESS }));
    expect(adapter.watchConnectedAccount).toHaveBeenCalledWith("Phantom", ADDRESS, expect.any(Function));
    session.connect("Phantom");
    expect(adapter.connectWallet).toHaveBeenCalledTimes(1);
  });

  it("records a declined connection as a notice and stays disconnected", async () => {
    const { adapter } = fakeAdapter({ kind: "rejected" });
    const session = createWalletSession(adapter);
    session.start();
    session.connect("Phantom");
    await vi.waitFor(() => expect(session.getState().notice).toBe("rejected"));
    expect(session.getState().connection).toEqual({ kind: "disconnected" });
  });

  it("does not disconnect while the purchase panel holds the lock, but follows the wallet removing the account", async () => {
    const { adapter, accountGone } = fakeAdapter();
    const session = createWalletSession(adapter);
    session.start();
    session.connect("Phantom");
    await vi.waitFor(() => expect(session.getState().connection.kind).toBe("connected"));
    session.setDisconnectLocked(true);
    session.disconnect();
    expect(session.getState().connection.kind).toBe("connected");
    expect(adapter.disconnectWallet).not.toHaveBeenCalled();
    accountGone();
    expect(session.getState().connection).toEqual({ kind: "disconnected" });
  });

  it("disconnects on request and tells the wallet", async () => {
    const { adapter } = fakeAdapter();
    const session = createWalletSession(adapter);
    session.start();
    session.connect("Phantom");
    await vi.waitFor(() => expect(session.getState().connection.kind).toBe("connected"));
    session.disconnect();
    expect(session.getState().connection).toEqual({ kind: "disconnected" });
    expect(adapter.disconnectWallet).toHaveBeenCalledWith("Phantom");
  });
});

describe("purchase reducer bridged to the wallet session", () => {
  const detected: WalletSessionState = { ...INITIAL_WALLET_SESSION, detection: "done", wallets: [{ id: "Phantom", name: "Phantom" }], unsupported: [] };
  const connecting: WalletSessionState = { ...detected, connection: { kind: "connecting", walletId: "Phantom" } };
  const connected: WalletSessionState = { ...detected, connection: { kind: "connected", walletId: "Phantom", walletName: "Phantom", address: ADDRESS } };

  it("arrives connected when the wallet was connected on another page before the island loaded", () => {
    const purchase = replay([connected]);
    expect(purchase.connection).toEqual(connected.connection);
    expect(purchase.detection).toBe("done");
  });

  it("follows connecting, connected, disconnect and a failed attempt with the reducer's own actions", () => {
    expect(sessionTransitionActions(connecting, connected).map((action) => action.type)).toEqual(["connectSucceeded"]);
    expect(sessionTransitionActions(connected, detected).map((action) => action.type)).toEqual(["walletDisconnected"]);
    expect(sessionTransitionActions(connecting, { ...detected, notice: "rejected" })).toEqual([{ type: "connectFailed", reason: "rejected" }]);
    expect(replay([detected, connecting, { ...detected, notice: "rejected" }]).connectNotice).toBe("rejected");
    expect(replay([detected, connecting, connected, detected]).connection).toEqual({ kind: "disconnected" });
    const switched: WalletSessionState = { ...connected, connection: { kind: "connected", walletId: "Phantom", walletName: "Phantom", address: OTHER_ADDRESS } };
    expect(replay([connected, switched]).connection).toEqual(switched.connection);
  });

  it("sends nothing when only the lock changes", () => {
    expect(sessionTransitionActions(connected, { ...connected, disconnectLocked: true })).toEqual([]);
  });

  it("locks the header's Disconnect exactly where the panel disables its own, before a send", () => {
    expect(["previewing", "awaitingWallet", "walletOutcomeUnknown"].every((phase) => locksDisconnect(phase as never))).toBe(true);
    expect(["editing", "reviewReady", "submitted", "result", "failedOnChain"].some((phase) => locksDisconnect(phase as never))).toBe(false);
  });
});

describe("shell catalog", () => {
  function shape(value: unknown): unknown {
    if (typeof value === "function") return `fn/${value.length}`;
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, shape(nested)]));
    return typeof value;
  }

  it("has one catalog per locale with an identical key structure", () => {
    expect(Object.keys(SHELL_MESSAGES)).toEqual([...PUBLIC_WEB_LOCALES]);
    expect(Object.keys(LOCALE_SHORT_LABELS)).toEqual([...PUBLIC_WEB_LOCALES]);
    for (const locale of PUBLIC_WEB_LOCALES) expect(shape(SHELL_MESSAGES[locale]), locale).toEqual(shape(SHELL_MESSAGES.en));
  });

  it.each(PUBLIC_WEB_LOCALES)("names every wallet action as the purchase panel does in %s", (locale) => {
    const shell = shellMessagesFor(locale).wallet;
    const purchase = purchaseMessagesFor(locale).wallet;
    for (const key of ["connect", "disconnect", "detecting", "listLabel", "notDetectedTitle", "notDetectedBody", "connectRejected", "connectFailed"] as const) expect(shell[key], key).toBe(purchase[key]);
    expect(shell.connectNamed("X")).toBe(purchase.connectNamed("X"));
    expect(shell.unsupported("X")).toBe(purchase.unsupported("X"));
  });
});

describe("app tabs and paths", () => {
  it("has three tab roots per locale, prerendered for Holdings and Activity", () => {
    expect(holdingsPath("en")).toBe("/holdings");
    expect(activityPath("ja")).toBe("/ja/activity");
    expect(tabPath("zh-Hant", "explore")).toBe("/zh-Hant");
    const paths = buildAppShellPrerenderPaths();
    expect(paths).toHaveLength(PUBLIC_WEB_LOCALES.length * 2);
    expect(paths).not.toContain("/en/holdings");
    for (const path of ["/", "/ko", "/holdings", "/zh-Hans/activity"]) expect(isTabRootPath(path), path).toBe(true);
    for (const path of ["/stock/NVDA", "/ja/company/openai", "/en", "/holdings/x"]) expect(isTabRootPath(path), path).toBe(false);
  });

  it("keeps Explore current on every detail page", () => {
    expect(tabOf({ kind: "dossier", ticker: "NVDA" })).toBe("explore");
    expect(tabOf({ kind: "provider", provider: "prestocks", id: "OPENAI" })).toBe("explore");
    expect(tabOf({ kind: "company", slug: "openai" })).toBe("explore");
    expect(tabOf({ kind: "holdings" })).toBe("holdings");
    expect(tabOf({ kind: "not-found" })).toBeNull();
  });

  it("validates the tab documents by exact canonical path", () => {
    expect(createStaticFoundationDocument({ pathname: "/ja/holdings", route: "holdings", locale: "ja" })).toEqual({ kind: "static-foundation-v1", route: "holdings", locale: "ja", canonicalPath: "/ja/holdings" });
    expect(() => createStaticFoundationDocument({ pathname: "/en/activity", route: "activity", locale: "en" })).toThrow();
    expect(() => createStaticFoundationDocument({ pathname: "/activity", route: "activity", ticker: "NVDA" })).toThrow();
  });

  it("navigates in the client only for same-origin app documents", () => {
    const here = new URL("https://benten.test/stock/NVDA") as unknown as Location;
    const url = (path: string) => new URL(path, "https://benten.test");
    expect(isClientNavigable(url("/holdings"), here)).toBe(true);
    expect(isClientNavigable(url("/#xstocks"), here)).toBe(true);
    expect(isClientNavigable(url("/stock/NVDA#purchase-slot"), here)).toBe(false);
    expect(isClientNavigable(url("/api/solana-rpc"), here)).toBe(false);
    expect(isClientNavigable(url("/api/v2/fundamentals"), here)).toBe(false);
    expect(isClientNavigable(url("/assets/x.js"), here)).toBe(false);
    expect(isClientNavigable(new URL("https://www.sec.gov/"), here)).toBe(false);
  });
});

function inRouter(node: React.ReactNode, path = "/"): string {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
}

describe("prerendered shell markup", () => {
  it.each(PUBLIC_WEB_LOCALES)("renders the header, three labelled tabs and the back link only on detail pages in %s", (locale: PublicWebLocale) => {
    const copy = shellMessagesFor(locale);
    const detail = inRouter(<SiteShell locale={locale} page={{ kind: "dossier", ticker: "NVDA" }} parentHref="/">content</SiteShell>);
    expect(detail).toMatch(/data-app-back=""/);
    expect(detail).toContain(`aria-label="${copy.nav.back}"`);
    for (const tab of ["explore", "holdings", "activity"] as const) expect(detail).toContain(`>${copy.nav[tab]}</a>`);
    expect(detail).toMatch(/aria-current="page"[^>]*data-app-tab="explore"/);
    // The header wallet is outlined and inert until hydration; the page's primary action is never in the header.
    const wallet = /<details[^>]*data-wallet-menu="header"[^>]*><summary class="([^"]*)"/.exec(detail);
    expect(wallet?.[1]).toContain("border-border");
    expect(wallet?.[1]).not.toContain("bg-primary");
    const root = inRouter(<SiteShell locale={locale} page={{ kind: "holdings" }}>content</SiteShell>);
    expect(root).not.toContain("data-app-back");
    expect(root).toMatch(/aria-current="page"[^>]*data-app-tab="holdings"/);
  });

  it("renders Holdings as not connected with a no-JavaScript note, and Activity as empty", () => {
    const holdings = inRouter(<HoldingsPage locale="en" />);
    expect(holdings).toContain('data-holdings-state="not-connected"');
    expect(holdings).toContain(shellMessagesFor("en").holdings.notConnected);
    expect(holdings).toContain("<noscript>");
    // The page's one primary action: the filled Connect wallet, opening its wallet list in the flow.
    expect(/<details[^>]*data-wallet-menu="page"[^>]*><summary class="([^"]*)"/.exec(holdings)?.[1]).toContain("bg-primary");
    const activity = inRouter(<ActivityPage locale="ko" />);
    expect(activity).toContain('data-activity-state="empty"');
    expect(activity).toContain('href="/ko"');
  });

  it("places every header menu against the viewport below md, between the page gutters", () => {
    const html = inRouter(<SiteShell locale="en" page={{ kind: "home" }}>content</SiteShell>);
    for (const menu of ["data-language-menu=\"\"", "data-theme-menu=\"\"", "data-wallet-menu=\"header\""]) {
      const panel = new RegExp(`<details[^>]*${menu}[^>]*>[\\s\\S]*?</summary><div class="([^"]*)"`).exec(html)?.[1] ?? "";
      for (const utility of ["max-md:fixed", "max-md:top-(--app-menu-top)", "max-md:end-(--app-menu-narrow-end)", "max-md:max-w-(--app-menu-narrow-max-width)", "max-md:min-w-(--app-menu-narrow-min-width)"]) expect(panel).toContain(utility);
    }
  });

  it("works without JavaScript: the language list is a native disclosure of plain links", () => {
    const html = inRouter(<SiteShell locale="ja" page={{ kind: "company", slug: "openai" }} parentHref="/ja">content</SiteShell>);
    const menu = /<details[^>]*data-language-menu=""[\s\S]*?<\/details>/.exec(html)?.[0] ?? "";
    expect(menu).toContain("<summary");
    for (const href of ["/company/openai", "/ja/company/openai", "/ko/company/openai", "/zh-Hans/company/openai", "/zh-Hant/company/openai"]) expect(menu).toContain(`href="${href}"`);
    expect(html).toMatch(/data-app-back=""[^>]*href="\/ja"/);
  });
});

describe("wallet request boundary", () => {
  function sources(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }

  it("asks a wallet to approve only from the purchase island, through approveOnce", () => {
    const app = new URL("../app", import.meta.url).pathname;
    const callers = sources(app).filter((path) => readFileSync(path, "utf8").includes("requestWalletApproval"));
    expect(callers.map((path) => path.slice(app.length))).toEqual(["/features/purchase-island/purchase-island.tsx"]);
    const island = readFileSync(join(app, "features/purchase-island/purchase-island.tsx"), "utf8");
    expect(island.match(/requestWalletApproval/g)).toHaveLength(2);
    expect(island).toContain("approveOnce(store, requestWalletApproval)");
  });

  it("keeps the shell's wallet session free of the Solana SDK and the purchase island", () => {
    for (const file of ["features/wallet-session/wallet-session.ts", "features/wallet-session/app-session.tsx", "features/wallet-session/wallet-menu.tsx", "components/site/site-header.tsx", "root.tsx"]) {
      const source = readFileSync(new URL(`../app/${file}`, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/@solana\/|@benten\/purchase\/(route|rpc|preview|build-swap|tracker|result|amount)|features\/purchase-island/);
    }
  });
});
