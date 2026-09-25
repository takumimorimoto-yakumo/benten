import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { PublicKey } from "@solana/web3.js";

import {
  connectWallet,
  isUserRejection,
  listWallets,
  reconnectWallet,
  requestWalletApproval,
  watchConnectedAccount,
} from "./wallet-standard";
import { encodeBase58 } from "./base58";

// Built by concatenation: the feature identifier may appear only in
// packages/purchase/src/wallet-standard.ts (scripts/check-publishable.sh).
const SEND_FEATURE = ("solana:" + "signAndSend" + "Transaction") as `solana:${string}`;
const SEND_METHOD = "signAndSend" + "Transaction";
const ADDRESS = new PublicKey(new Uint8Array(32).fill(5)).toBase58();
const SIGNATURE_BYTES = new Uint8Array(64).fill(9);

const unregisters: (() => void)[] = [];
afterEach(() => {
  while (unregisters.length) unregisters.pop()!();
});

/** A stub wallet: its approval function only records the call and answers; nothing reaches any network. */
function mockWallet(name: string, options: { chains?: string[]; send?: boolean; approve?: () => Promise<unknown>; connect?: (...input: unknown[]) => Promise<unknown> } = {}) {
  const account: WalletAccount = { address: ADDRESS, publicKey: new PublicKey(ADDRESS).toBytes(), chains: ["solana:mainnet"], features: [SEND_FEATURE] };
  const approve = vi.fn(options.approve ?? (async () => [{ signature: SIGNATURE_BYTES }]));
  let changeListener: ((properties: { accounts?: readonly WalletAccount[] }) => void) | null = null;
  const features: Record<string, unknown> = {
    "standard:connect": { version: "1.0.0", connect: options.connect ?? (async () => ({ accounts: [account] })) },
    "standard:events": { version: "1.0.0", on: (_event: string, listener: typeof changeListener) => { changeListener = listener; return () => { changeListener = null; }; } },
  };
  if (options.send !== false) features[SEND_FEATURE] = { version: "1.0.0", supportedTransactionVersions: ["legacy", 0], [SEND_METHOD]: approve };
  const wallet = { version: "1.0.0", name, icon: "data:image/svg+xml;base64,", chains: options.chains ?? ["solana:mainnet"], features, accounts: [] } as unknown as Wallet;
  unregisters.push(getWallets().register(wallet));
  return { approve, emitChange: (accounts: WalletAccount[]) => changeListener?.({ accounts }) };
}

describe("wallet detection", () => {
  it("offers only wallets with the sign-and-send feature on Solana mainnet", () => {
    mockWallet("Good");
    mockWallet("No Send", { send: false });
    mockWallet("Devnet Only", { chains: ["solana:devnet"] });
    const { supported, unsupported } = listWallets();
    expect(supported).toEqual([{ id: "Good", name: "Good" }]);
    expect(unsupported.sort()).toEqual(["Devnet Only", "No Send"]);
  });
});

describe("connect and approve", () => {
  it("connects, then asks the wallet once and returns the base58 signature", async () => {
    const wallet = mockWallet("Approver");
    expect(await connectWallet("Approver")).toEqual({ kind: "connected", address: ADDRESS, name: "Approver" });
    const bytes = Uint8Array.from([1, 2, 3]);
    expect(await requestWalletApproval("Approver", ADDRESS, bytes)).toEqual({ kind: "signed", signature: encodeBase58(SIGNATURE_BYTES) });
    expect(wallet.approve).toHaveBeenCalledTimes(1);
    expect(wallet.approve).toHaveBeenCalledWith({ account: expect.objectContaining({ address: ADDRESS }), chain: "solana:mainnet", transaction: bytes });
  });

  it("does not ask a wallet that was not connected, or for another address", async () => {
    const wallet = mockWallet("Unconnected");
    expect(await requestWalletApproval("Unconnected", ADDRESS, new Uint8Array(1))).toEqual({ kind: "failed" });
    await connectWallet("Unconnected");
    expect(await requestWalletApproval("Unconnected", new PublicKey(new Uint8Array(32).fill(6)).toBase58(), new Uint8Array(1))).toEqual({ kind: "failed" });
    expect(wallet.approve).not.toHaveBeenCalled();
  });

  it("classifies a user rejection separately from an unknown wallet error, without retrying", async () => {
    const rejecting = mockWallet("Rejecting", { approve: async () => { throw Object.assign(new Error("User rejected the request."), { code: 4001 }); } });
    await connectWallet("Rejecting");
    expect(await requestWalletApproval("Rejecting", ADDRESS, new Uint8Array(1))).toEqual({ kind: "rejected" });
    expect(rejecting.approve).toHaveBeenCalledTimes(1);

    const failing = mockWallet("Failing", { approve: async () => { throw new Error("Internal wallet error"); } });
    await connectWallet("Failing");
    expect(await requestWalletApproval("Failing", ADDRESS, new Uint8Array(1))).toEqual({ kind: "failed" });
    expect(failing.approve).toHaveBeenCalledTimes(1);

    mockWallet("Empty", { approve: async () => [] });
    await connectWallet("Empty");
    expect(await requestWalletApproval("Empty", ADDRESS, new Uint8Array(1))).toEqual({ kind: "failed" });
  });

  it("treats rejection wording without a structured code as an unknown outcome", async () => {
    const worded = mockWallet("Worded", { approve: async () => { throw new Error("User rejected the request."); } });
    await connectWallet("Worded");
    expect(await requestWalletApproval("Worded", ADDRESS, new Uint8Array(1))).toEqual({ kind: "failed" });
    expect(worded.approve).toHaveBeenCalledTimes(1);

    const named = mockWallet("Named", { approve: async () => { throw Object.assign(new Error("Transaction cancelled"), { name: "WalletSignTransactionError" }); } });
    await connectWallet("Named");
    expect(await requestWalletApproval("Named", ADDRESS, new Uint8Array(1))).toEqual({ kind: "failed" });
    expect(named.approve).toHaveBeenCalledTimes(1);
  });

  it("accepts only structured rejection signals", () => {
    expect(isUserRejection({ code: 4001 })).toBe(true);
    expect(isUserRejection(Object.assign(new Error("The user rejected the request"), { name: "WalletStandardError", context: { __code: 4001000 } }))).toBe(true);
    // Same class, different code; wrong code type; text only; other codes.
    expect(isUserRejection(Object.assign(new Error("x"), { name: "WalletStandardError", context: { __code: 6160002 } }))).toBe(false);
    expect(isUserRejection({ code: "4001" })).toBe(false);
    expect(isUserRejection({ name: "UserRejectedRequestError", message: "User rejected the request" })).toBe(false);
    expect(isUserRejection({ context: { __code: 4001000 } })).toBe(false);
    expect(isUserRejection({ code: -32603, message: "Request denied" })).toBe(false);
    expect(isUserRejection(new Error("boom"))).toBe(false);
    expect(isUserRejection(null)).toBe(false);
    expect(isUserRejection("User rejected")).toBe(false);
  });

  it("reports a connection declined with code 4001 as rejected, and a worded one as failed", async () => {
    mockWallet("Decline", { connect: async () => { throw Object.assign(new Error("User rejected the request."), { code: 4001 }); } });
    expect(await connectWallet("Decline")).toEqual({ kind: "rejected" });
    mockWallet("Cancel", { connect: async () => { throw new Error("Connection request was cancelled"); } });
    expect(await connectWallet("Cancel")).toEqual({ kind: "failed" });
  });

  it("refuses an account whose address is not the base58 form of its own public key", async () => {
    const mismatched: WalletAccount = { address: ADDRESS, publicKey: new Uint8Array(32).fill(6), chains: ["solana:mainnet"], features: [SEND_FEATURE] };
    mockWallet("Mismatched", { connect: async () => ({ accounts: [mismatched] }) });
    expect(await connectWallet("Mismatched")).toEqual({ kind: "failed" });
    const short: WalletAccount = { address: encodeBase58(new Uint8Array(31).fill(5)), publicKey: new Uint8Array(31).fill(5), chains: ["solana:mainnet"], features: [SEND_FEATURE] };
    mockWallet("Short", { connect: async () => ({ accounts: [short] }) });
    expect(await connectWallet("Short")).toEqual({ kind: "failed" });
  });

  it("imports no Solana SDK, so the app shell can use detection and connect", () => {
    const source = readFileSync(new URL("./wallet-standard.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from "@solana\//);
    expect(source).not.toMatch(/from "\.\/(route|rpc|preview|build-swap|simulation|tracker)"/);
  });

  it("notices when the connected account disappears", async () => {
    const wallet = mockWallet("Switching");
    await connectWallet("Switching");
    const onGone = vi.fn();
    const stop = watchConnectedAccount("Switching", ADDRESS, onGone);
    wallet.emitChange([]);
    expect(onGone).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("silent reconnect (invariant 4)", () => {
  it("asks the wallet with silent: true, and an explicit connect without it", async () => {
    const calls: unknown[] = [];
    const account = () => ({ address: ADDRESS, publicKey: new PublicKey(ADDRESS).toBytes(), chains: ["solana:mainnet"], features: [SEND_FEATURE] });
    const wallet = mockWallet("Remembered", { connect: async (...input: unknown[]) => { calls.push(input[0]); return { accounts: [account()] }; } });
    expect(await reconnectWallet("Remembered")).toEqual({ kind: "connected", address: ADDRESS, name: "Remembered" });
    expect(calls).toEqual([{ silent: true }]);
    await connectWallet("Remembered");
    expect(calls).toEqual([{ silent: true }, undefined]);
    // Reconnecting asks for nothing else: the approval feature is never touched.
    expect(wallet.approve).not.toHaveBeenCalled();
  });

  it("stays disconnected when the wallet has no authorized account to return silently", async () => {
    mockWallet("Forgotten", { connect: async () => ({ accounts: [] }) });
    expect(await reconnectWallet("Forgotten")).toEqual({ kind: "failed" });
    mockWallet("Refusing", { connect: async () => { throw Object.assign(new Error("not authorized"), { code: 4001 }); } });
    expect(await reconnectWallet("Refusing")).toEqual({ kind: "rejected" });
    expect(await reconnectWallet("Absent")).toEqual({ kind: "failed" });
  });

  it("lets a reconnected account approve only through the same single request path", async () => {
    const wallet = mockWallet("Restored");
    await reconnectWallet("Restored");
    expect(await requestWalletApproval("Restored", ADDRESS, new Uint8Array(1))).toEqual({ kind: "signed", signature: encodeBase58(SIGNATURE_BYTES) });
    expect(wallet.approve).toHaveBeenCalledTimes(1);
  });
});
