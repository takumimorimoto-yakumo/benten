import { describe, expect, it, vi } from "vitest";
import { encodeBase58 } from "../../../packages/purchase/src/base58.ts";
import { createWalletMemory, WALLET_MEMORY_KEY } from "../app/features/wallet-session/wallet-memory.ts";
import { createWalletSession, type WalletSessionAdapter } from "../app/features/wallet-session/wallet-session.ts";

const FIXTURE_WALLET = encodeBase58(new Uint8Array(32).fill(7));

describe("silent reconnect of the wallet session", () => {
  const ADDRESS = FIXTURE_WALLET;
  function adapter(remembered: string | null, reconnect: WalletSessionAdapter["reconnectWallet"]) {
    let stored = remembered;
    const memory = { read: vi.fn(() => stored), write: vi.fn((value: string | null) => { stored = value; }) };
    const value: WalletSessionAdapter = {
      watchWallets: (onChange) => {
        onChange({ supported: [{ id: "Phantom", name: "Phantom" }], unsupported: [] });
        return () => undefined;
      },
      connectWallet: vi.fn(async () => ({ kind: "connected" as const, address: ADDRESS, name: "Phantom" })),
      disconnectWallet: vi.fn(async () => undefined),
      watchConnectedAccount: vi.fn(() => () => undefined),
      reconnectWallet: reconnect,
      memory,
    };
    return { adapter: value, memory, stored: () => stored };
  }

  it("reconnects the remembered wallet once, silently, when it is detected", async () => {
    const reconnect = vi.fn(async () => ({ kind: "connected" as const, address: ADDRESS, name: "Phantom" }));
    const { adapter: value } = adapter("Phantom", reconnect);
    const session = createWalletSession(value);
    session.start();
    await vi.waitFor(() => expect(session.getState().connection).toEqual({ kind: "connected", walletId: "Phantom", walletName: "Phantom", address: ADDRESS }));
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(value.connectWallet).not.toHaveBeenCalled();
  });

  it("does not try without a remembered wallet, and shows no notice when the wallet does not answer silently", async () => {
    const reconnect = vi.fn(async () => ({ kind: "failed" as const }));
    const none = createWalletSession(adapter(null, reconnect).adapter);
    none.start();
    expect(reconnect).not.toHaveBeenCalled();
    const remembered = createWalletSession(adapter("Phantom", reconnect).adapter);
    remembered.start();
    await vi.waitFor(() => expect(reconnect).toHaveBeenCalledTimes(1));
    expect(remembered.getState()).toMatchObject({ connection: { kind: "disconnected" }, notice: null });
  });

  it("remembers an explicit connect and forgets it on Disconnect, so the next load stays disconnected", async () => {
    const reconnect = vi.fn(async () => ({ kind: "connected" as const, address: ADDRESS, name: "Phantom" }));
    const { adapter: value, stored } = adapter(null, reconnect);
    const session = createWalletSession(value);
    session.start();
    session.connect("Phantom");
    await vi.waitFor(() => expect(session.getState().connection.kind).toBe("connected"));
    expect(stored()).toBe("Phantom");
    session.disconnect();
    expect(stored()).toBeNull();
    const next = createWalletSession(value);
    next.start();
    expect(reconnect).not.toHaveBeenCalled();
    expect(next.getState().connection.kind).toBe("disconnected");
  });

  it("lets a connect the user started win over a silent attempt still pending", async () => {
    let resolve: (outcome: { kind: "connected"; address: string; name: string }) => void = () => undefined;
    const reconnect = vi.fn(() => new Promise<{ kind: "connected"; address: string; name: string }>((done) => { resolve = done; }));
    const { adapter: value } = adapter("Phantom", reconnect);
    const session = createWalletSession(value);
    session.start();
    session.connect("Phantom");
    await vi.waitFor(() => expect(session.getState().connection.kind).toBe("connected"));
    resolve({ kind: "connected", address: "Other", name: "Phantom" });
    await Promise.resolve();
    expect(session.getState().connection).toMatchObject({ address: ADDRESS });
  });

  it("keeps only a short wallet name in storage and survives storage failures", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => void values.set(name, value), removeItem: (name: string) => void values.delete(name) };
    const memory = createWalletMemory(() => storage);
    memory.write("Phantom");
    expect(JSON.parse(values.get(WALLET_MEMORY_KEY)!)).toEqual({ walletId: "Phantom" });
    expect(memory.read()).toBe("Phantom");
    memory.write(null);
    expect(memory.read()).toBeNull();
    const broken = createWalletMemory(() => { throw new Error("SecurityError"); });
    expect(broken.read()).toBeNull();
    expect(() => broken.write("Phantom")).not.toThrow();
    values.set(WALLET_MEMORY_KEY, "{\"walletId\":42}");
    expect(memory.read()).toBeNull();
  });
});
