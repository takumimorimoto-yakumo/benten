/**
 * The one place where Benten talks to the user's wallet.
 *
 * 2026-09-24 user decision (plan section 2): the browser purchase panel may
 * ask the user's own wallet, through the Wallet Standard sign-and-send
 * feature, to approve and send one transaction. This file is the only path
 * where `scripts/check-publishable.sh` allows that feature's identifier.
 *
 * INVARIANTS (do not weaken without a security review):
 *  1. The wallet signs and sends; Benten never holds a key, never signs,
 *     never calls a send RPC. This module never imports a key type, never
 *     reads a secret or seed phrase, and never uses any other signing feature.
 *  2. Only wallets that offer the sign-and-send feature on Solana mainnet are
 *     offered; others are listed as unsupported.
 *  3. `requestWalletApproval` makes exactly one wallet request per call and
 *     never retries. The panel calls it only on the state machine's single
 *     `reviewReady -> awaitingWallet` transition. No send options are passed,
 *     so the wallet's default behaviour is unchanged.
 *  4. No wallet is asked for a new approval without an explicit user action.
 *     The one wallet call made without one is `reconnectWallet`: a Wallet
 *     Standard `connect({ silent: true })` to the one wallet the user
 *     connected in this browser before and has not disconnected since.
 *     `silent` asks the wallet to return only accounts it has already
 *     authorized for this page and to show no prompt, so it restores an
 *     approval the user already gave and never obtains a new one. Why this
 *     changed (2026-09-24, app IA section 3.5): with client-side navigation a
 *     reload or a shared link opened in the same browser must not drop the
 *     user back to "Connect wallet" every time; an attempt that the wallet
 *     cannot answer silently simply leaves the page disconnected.
 *
 * Detection, connect and disconnect are also used by the app shell's
 * lifted wallet session, so this module imports no Solana SDK: it stays in
 * the shell's small static graph, and only the purchase island (through
 * `approveOnce`) ever calls `requestWalletApproval`.
 */

import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";

import { encodeBase58 } from "./base58";
import { PURCHASE_CONFIG } from "./config";
import type { WalletOption } from "./purchase-machine";

const SIGN_AND_SEND_FEATURE = "solana:signAndSendTransaction";
const CONNECT_FEATURE = "standard:connect";
const DISCONNECT_FEATURE = "standard:disconnect";
const EVENTS_FEATURE = "standard:events";

type ConnectFeature = { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }> };
type DisconnectFeature = { disconnect(): Promise<void> };
type EventsFeature = { on(event: "change", listener: (properties: { accounts?: readonly WalletAccount[] }) => void): () => void };
type SignAndSendFeature = {
  signAndSendTransaction(...inputs: { account: WalletAccount; chain: string; transaction: Uint8Array }[]): Promise<readonly { signature: Uint8Array }[]>;
};

/**
 * Structured "the user declined before anything was sent" signals. A rejection
 * lets the panel offer the same preview again, so only signals that mean the
 * request never left the approval prompt count; message text never does (a
 * wallet may word a post-send failure with "cancel" or "denied").
 *
 * - `code: 4001`: EIP-1193 `userRejectedRequest`, the code Phantom documents
 *   for a declined request and that other Solana wallets reuse.
 * - `name: "WalletStandardError"` with `context.__code: 4001000`:
 *   `WALLET_STANDARD_ERROR__USER__REQUEST_REJECTED` from `@wallet-standard/errors`
 *   (checked structurally, the way that package's `isWalletStandardError` does).
 */
const EIP1193_USER_REJECTED_CODE = 4001;
const WALLET_STANDARD_ERROR_NAME = "WalletStandardError";
const WALLET_STANDARD_USER_REQUEST_REJECTED = 4001000;

function feature<T>(wallet: Wallet, name: string): T | null {
  return (wallet.features as Record<string, unknown>)[name] as T | undefined ?? null;
}

export function isSupportedWallet(wallet: Wallet): boolean {
  return wallet.chains.includes(PURCHASE_CONFIG.chain) && feature(wallet, SIGN_AND_SEND_FEATURE) !== null && feature(wallet, CONNECT_FEATURE) !== null;
}

/** Byte length of a Solana account public key. */
const PUBLIC_KEY_BYTES = 32;

/**
 * The account's address is the base58 form of its own 32-byte public key.
 * Checked without a Solana SDK so this module stays out of the SDK chunk.
 */
function isSolanaAccountAddress(account: WalletAccount): boolean {
  const bytes = account.publicKey;
  if (!bytes || bytes.length !== PUBLIC_KEY_BYTES) return false;
  return encodeBase58(Uint8Array.from(bytes)) === account.address;
}

function usableAccount(accounts: readonly WalletAccount[]): WalletAccount | null {
  return accounts.find((account) => {
    const onMainnet = account.chains.length === 0 || account.chains.includes(PURCHASE_CONFIG.chain);
    const canSend = account.features.length === 0 || account.features.includes(SIGN_AND_SEND_FEATURE);
    return onMainnet && canSend && isSolanaAccountAddress(account);
  }) ?? null;
}

/** Detected wallets, split into those this page can use and the names of those it cannot. */
export function listWallets(): { supported: WalletOption[]; unsupported: string[] } {
  const wallets = getWallets().get();
  return {
    supported: wallets.filter(isSupportedWallet).map((wallet) => ({ id: wallet.name, name: wallet.name })),
    unsupported: wallets.filter((wallet) => !isSupportedWallet(wallet)).map((wallet) => wallet.name),
  };
}

/** Call `onChange` now and whenever a wallet registers or unregisters. Returns an unsubscribe function. */
export function watchWallets(onChange: (wallets: { supported: WalletOption[]; unsupported: string[] }) => void): () => void {
  const registry = getWallets();
  const notify = () => onChange(listWallets());
  const offRegister = registry.on("register", notify);
  const offUnregister = registry.on("unregister", notify);
  notify();
  return () => {
    offRegister();
    offUnregister();
  };
}

function walletById(id: string): Wallet | null {
  return getWallets().get().find((wallet) => wallet.name === id && isSupportedWallet(wallet)) ?? null;
}

/** True only for a structured user rejection (see above). Everything else is an unknown outcome. */
export function isUserRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; name?: unknown; context?: unknown };
  if (record.code === EIP1193_USER_REJECTED_CODE) return true;
  if (record.name !== WALLET_STANDARD_ERROR_NAME || !record.context || typeof record.context !== "object") return false;
  return (record.context as { __code?: unknown }).__code === WALLET_STANDARD_USER_REQUEST_REJECTED;
}

/** The account in use per wallet after an explicit connect. */
const connectedAccounts = new Map<string, WalletAccount>();

export type ConnectOutcome = { kind: "connected"; address: string; name: string } | { kind: "rejected" } | { kind: "failed" };

async function connectWith(id: string, input: { silent: true } | undefined): Promise<ConnectOutcome> {
  const wallet = walletById(id);
  const connect = wallet ? feature<ConnectFeature>(wallet, CONNECT_FEATURE) : null;
  if (!wallet || !connect) return { kind: "failed" };
  try {
    const { accounts } = await (input ? connect.connect(input) : connect.connect());
    const account = usableAccount(accounts.length ? accounts : wallet.accounts);
    if (!account) return { kind: "failed" };
    connectedAccounts.set(id, account);
    return { kind: "connected", address: account.address, name: wallet.name };
  } catch (error) {
    return isUserRejection(error) ? { kind: "rejected" } : { kind: "failed" };
  }
}

/** Ask the wallet to connect (user action only). The wallet may show its approval prompt. */
export function connectWallet(id: string): Promise<ConnectOutcome> {
  return connectWith(id, undefined);
}

/**
 * Restore the connection to a wallet the user connected in this browser
 * before (invariant 4): `connect({ silent: true })`, which the Wallet
 * Standard defines as returning already-authorized accounts without
 * prompting. Anything but a usable authorized account leaves the page
 * disconnected; the caller shows no notice for it.
 */
export function reconnectWallet(id: string): Promise<ConnectOutcome> {
  return connectWith(id, { silent: true });
}

export async function disconnectWallet(id: string): Promise<void> {
  connectedAccounts.delete(id);
  const wallet = walletById(id);
  const disconnect = wallet ? feature<DisconnectFeature>(wallet, DISCONNECT_FEATURE) : null;
  await disconnect?.disconnect().catch(() => undefined);
}

/** Call `onGone` when the connected account disappears from the wallet (locked, switched or disconnected). */
export function watchConnectedAccount(id: string, address: string, onGone: () => void): () => void {
  const wallet = walletById(id);
  const events = wallet ? feature<EventsFeature>(wallet, EVENTS_FEATURE) : null;
  if (!events) return () => undefined;
  return events.on("change", ({ accounts }) => {
    if (accounts && !accounts.some((account) => account.address === address)) {
      connectedAccounts.delete(id);
      onGone();
    }
  });
}

export type ApprovalOutcome = { kind: "signed"; signature: string } | { kind: "rejected" } | { kind: "failed" };

/**
 * Ask the wallet, once, to approve and send the audited unsigned transaction.
 * No retry, no options. Only a structured rejection is reported as
 * `rejected`; any other error without a signature is `failed` (the outcome
 * is unknown to Benten, and the same preview must not be approved again).
 */
export async function requestWalletApproval(id: string, address: string, wireTransaction: Uint8Array): Promise<ApprovalOutcome> {
  const wallet = walletById(id);
  const account = connectedAccounts.get(id);
  const signAndSend = wallet ? feature<SignAndSendFeature>(wallet, SIGN_AND_SEND_FEATURE) : null;
  if (!wallet || !account || account.address !== address || !signAndSend) return { kind: "failed" };
  try {
    const [output] = await signAndSend.signAndSendTransaction({ account, chain: PURCHASE_CONFIG.chain, transaction: wireTransaction });
    return output?.signature?.length ? { kind: "signed", signature: encodeBase58(Uint8Array.from(output.signature)) } : { kind: "failed" };
  } catch (error) {
    return isUserRejection(error) ? { kind: "rejected" } : { kind: "failed" };
  }
}
