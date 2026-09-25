/**
 * The app wallet control (app IA section 3.2). One disclosure for every
 * state of the shell's wallet session:
 * - not connected: `Connect wallet` opens the list of detected wallets (or
 *   says none was found);
 * - connecting: `Connecting...` while the wallet answers;
 * - connected: the short address opens the panel with the short address
 *   (read whole by screen readers), `Copy address` (the full address),
 *   `Switch wallet` and `Disconnect`.
 * Choosing a wallet keeps the panel open on `Connecting...` (a declined or
 * failed attempt is told there); the panel closes, and focus returns to its
 * button, once the wallet connects, whether from the list or a silent
 * reconnect that finished while it was open.
 * `header` is outlined and floats under the button (the header never
 * carries the page's primary action); below `md` it shows the wallet icon
 * alone, and from `md` its label is truncated at a maximum width; `page` is the filled primary button of
 * a page such as Holdings, opening in the flow. Connecting is never required
 * to read anything, and it needs JavaScript: without it the panel says so.
 */
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { WalletIcon } from "lucide-react";
import { ShortAddress } from "@/components/short-address";
import { HeaderDisclosure } from "@/components/site/header-disclosure";
import { buttonVariants } from "@/components/ui/button";
import type { PublicWebLocale } from "@/i18n/locales";
import { shellMessagesFor, type ShellCopy } from "@/i18n/shell-messages";
import { COPY_FEEDBACK_MS, copyText } from "@/lib/clipboard";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { useAppSession, useWalletSessionState } from "./app-session";
import { walletAppMissing } from "./mobile-wallet";
import type { WalletSessionState } from "./wallet-session";

/** Text rows inside the panel that are not actions. */
const NOTE_CLASS = "px-2 py-1.5 text-sm text-muted-foreground";
/** Disabled actions keep readable ink (the muted foreground, about 4.7:1) instead of fading by opacity. */
const ACTION_CLASS = "flex min-h-(--touch-target-min) w-full items-center rounded-md px-2 text-start text-sm hover:bg-accent disabled:pointer-events-none disabled:text-muted-foreground md:min-h-8";

function PanelAction({ onClick, disabled, children, ...attributes }: { onClick: () => void; disabled?: boolean; children: ReactNode } & Readonly<Record<`data-${string}`, string>>) {
  return (
    <button type="button" className={ACTION_CLASS} onClick={onClick} disabled={disabled} {...attributes}>
      {children}
    </button>
  );
}

function ConnectList({ state, copy, hydrated, onConnect }: { state: WalletSessionState; copy: ShellCopy["wallet"]; hydrated: boolean; onConnect: (walletId: string) => void }) {
  const appMissing = useSyncExternalStore(walletAppMissing.subscribe, walletAppMissing.get, () => false);
  if (!hydrated) return <noscript><p className={NOTE_CLASS}>{copy.needsJavaScript}</p></noscript>;
  if (state.detection === "pending") return <p className={NOTE_CLASS}>{copy.detecting}</p>;
  return (
    <>
      {state.wallets.length === 0 ? (
        <div className={cn(NOTE_CLASS, "flex flex-col gap-1")} data-wallet-menu-none="">
          <p className="font-medium text-popover-foreground">{copy.notDetectedTitle}</p>
          <p>{copy.notDetectedBody}</p>
        </div>
      ) : (
        <div role="group" aria-label={copy.listLabel}>
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground" aria-hidden="true">{copy.listLabel}</p>
          {state.wallets.map((wallet) => (
            <PanelAction key={wallet.id} onClick={() => onConnect(wallet.id)} data-wallet-option={wallet.id}>{copy.connectNamed(wallet.name)}</PanelAction>
          ))}
        </div>
      )}
      {state.unsupported.map((name) => <p key={name} className={NOTE_CLASS}>{copy.unsupported(name)}</p>)}
      {state.notice ? <p className={NOTE_CLASS} role="status">{state.notice === "rejected" ? copy.connectRejected : copy.connectFailed}</p> : null}
      {/* Android only: the Mobile Wallet Adapter found no wallet app on this device. */}
      {appMissing ? <p className={NOTE_CLASS} data-wallet-app-missing="">{copy.walletAppMissing}</p> : null}
    </>
  );
}

export function WalletMenu({ locale, variant }: { locale: PublicWebLocale; variant: "header" | "page" }) {
  const copy = shellMessagesFor(locale).wallet;
  const { session } = useAppSession();
  const state = useWalletSessionState();
  const hydrated = useHydrated();
  const [copied, setCopied] = useState<"idle" | "copied" | "unavailable">("idle");
  const timer = useRef<number | null>(null);
  const connection = state.connection;

  async function copyAddress(address: string) {
    if (timer.current) window.clearTimeout(timer.current);
    setCopied((await copyText(address)) ? "copied" : "unavailable");
    timer.current = window.setTimeout(() => setCopied("idle"), COPY_FEEDBACK_MS);
  }

  const filled = variant === "page" && connection.kind !== "connected";
  const header = variant === "header";
  const copyLabel = copied === "copied" ? copy.addressCopied : copied === "unavailable" ? copy.copyUnavailable : copy.copyAddress;

  return (
    <HeaderDisclosure
      floating={variant === "header"}
      closeWhen={connection.kind === "connected"}
      data-wallet-menu={variant}
      data-wallet-state={connection.kind}
      summaryClassName={cn(
        buttonVariants({ variant: filled ? "default" : "outline" }),
        "h-(--touch-target-min) w-fit md:h-8",
        filled ? null : "group-open/disclosure:bg-muted",
        connection.kind === "connected" ? "font-mono" : null,
        header ? "relative max-w-(--app-header-wallet-max-width) max-md:size-(--app-header-control-size) max-md:px-0" : null,
      )}
      summary={
        <>
          {header ? <WalletIcon aria-hidden="true" /> : null}
          {/* Below md the header shows the wallet icon alone, with a dot once connected; the label stays for screen readers. */}
          {header && connection.kind === "connected" ? <span aria-hidden="true" data-wallet-connected-dot="" className="absolute top-2 end-2 size-2 rounded-full bg-(--verified) ring-2 ring-background md:hidden" /> : null}
          {connection.kind === "connected" ? (
            <ShortAddress address={connection.address} label={copy.account(connection.address)} className="contents" visibleClassName={header ? "min-w-0 truncate max-md:hidden" : undefined} />
          ) : connection.kind === "connecting" ? (
            <span aria-live="polite" className={header ? "min-w-0 truncate max-md:sr-only" : undefined}>{copy.connecting}</span>
          ) : (
            <span className={header ? "min-w-0 truncate max-md:sr-only" : undefined}>{copy.connect}</span>
          )}
        </>
      }
    >
      {(close) =>
        connection.kind === "connected" ? (
          <div className="flex flex-col" role="group" aria-label={copy.menuLabel}>
            {/* The short address; Copy takes the full one, and a screen reader reads it whole. */}
            <p className="px-2 py-1.5 text-xs text-muted-foreground"><ShortAddress address={connection.address} data-wallet-address="" /></p>
            <PanelAction onClick={() => void copyAddress(connection.address)} data-wallet-copy="">{copyLabel}</PanelAction>
            <span className="sr-only" role="status" aria-live="polite">{copied === "idle" ? "" : copyLabel}</span>
            <div className="-mx-1 my-1 h-px bg-border" role="separator" />
            {/* Switching keeps the panel open: it shows the wallet list once the current one is disconnected. */}
            <PanelAction onClick={() => session.disconnect()} disabled={state.disconnectLocked} data-wallet-switch="">{copy.switchWallet}</PanelAction>
            <PanelAction onClick={() => { session.disconnect(); close(); }} disabled={state.disconnectLocked} data-wallet-disconnect="">{copy.disconnect}</PanelAction>
            {state.disconnectLocked ? <p className={NOTE_CLASS}>{copy.disconnectLocked}</p> : null}
          </div>
        ) : connection.kind === "connecting" ? (
          <p className={NOTE_CLASS}>{copy.connecting}</p>
        ) : (
          <ConnectList state={state} copy={copy} hydrated={hydrated} onConnect={(walletId) => { walletAppMissing.set(false); session.connect(walletId); }} />
        )
      }
    </HeaderDisclosure>
  );
}
