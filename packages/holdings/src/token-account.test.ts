import { describe, expect, it } from "vitest";

import { OTHER_OWNER, OWNER, clockData, tokenAccountData } from "./fixtures.test-helpers";
import { decodeBase64, decodeClock, decodeTokenAccount, hidesPartOfBalance, readAccountKeys } from "./token-account";

const NVDAX_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

describe("decodeTokenAccount", () => {
  it("decodes mint, owner and the raw u64 amount without floating point", () => {
    const decoded = decodeTokenAccount(tokenAccountData({ mint: NVDAX_MINT, amount: 18_446_744_073_709_551_615n }), false);
    expect(decoded).toEqual({ mint: NVDAX_MINT, owner: OWNER, amount: 18_446_744_073_709_551_615n, frozen: false, delegated: false, extensions: [] });
  });

  it("reports frozen and delegated accounts explicitly", () => {
    expect(decodeTokenAccount(tokenAccountData({ mint: NVDAX_MINT, amount: 1n, state: 2, delegate: true }), false)).toMatchObject({ frozen: true, delegated: true });
  });

  it("walks complete Token-2022 TLV entries", () => {
    const data = tokenAccountData({ mint: NVDAX_MINT, amount: 1n, extensions: [{ type: 7, length: 0 }, { type: 2, length: 8 }] });
    expect(decodeTokenAccount(data, true)?.extensions).toEqual([7, 2]);
    expect(decodeTokenAccount(tokenAccountData({ mint: NVDAX_MINT, amount: 1n }), true)?.extensions).toEqual([]);
  });

  it.each([
    ["short data", new Uint8Array(164), false],
    ["an SPL account longer than 165 bytes", tokenAccountData({ mint: NVDAX_MINT, amount: 1n, token2022Layout: true }), false],
    ["an uninitialized account", tokenAccountData({ mint: NVDAX_MINT, amount: 1n, state: 0 }), false],
    ["an unknown state", tokenAccountData({ mint: NVDAX_MINT, amount: 1n, state: 3 }), false],
    ["a TLV entry past the data", tokenAccountData({ mint: NVDAX_MINT, amount: 1n, extensions: [{ type: 7, length: 0, declaredLength: 1 }] }), true],
  ])("rejects %s", (_name, data, token2022) => {
    expect(decodeTokenAccount(data, token2022)).toBeNull();
  });

  it("rejects a Token-2022 account whose account type is not Account", () => {
    const data = tokenAccountData({ mint: NVDAX_MINT, amount: 1n, token2022Layout: true });
    data[165] = 1;
    expect(decodeTokenAccount(data, true)).toBeNull();
  });

  it("rejects a bad option tag", () => {
    const data = tokenAccountData({ mint: NVDAX_MINT, amount: 1n });
    data[72] = 2;
    expect(decodeTokenAccount(data, false)).toBeNull();
  });
});

describe("decodeBase64 and decodeClock", () => {
  it("accepts only canonical base64", () => {
    expect(decodeBase64("AAEC")).toEqual(new Uint8Array([0, 1, 2]));
    expect(decodeBase64("AAE=")).toEqual(new Uint8Array([0, 1]));
    for (const bad of ["AAE", "A===", "AA E", "AA-_", 1]) expect(decodeBase64(bad)).toBeNull();
  });

  it("reads the Clock slot and unix timestamp", () => {
    expect(decodeClock(clockData(7n, 1_790_000_000n))).toEqual({ slot: 7n, unixTimestamp: 1_790_000_000n });
    expect(decodeClock(new Uint8Array(39))).toBeNull();
  });
});

describe("readAccountKeys", () => {
  it("reads only the mint and owner positions, whatever else the data holds", () => {
    const data = tokenAccountData({ mint: NVDAX_MINT, owner: OTHER_OWNER, amount: 1n, state: 0 });
    expect(readAccountKeys(data)).toEqual({ mint: NVDAX_MINT, owner: OTHER_OWNER });
    expect(readAccountKeys(data.subarray(0, 64))).toEqual({ mint: NVDAX_MINT, owner: OTHER_OWNER });
  });

  it("gives nothing for data too short to hold both keys", () => {
    expect(readAccountKeys(new Uint8Array(63))).toBeNull();
  });
});

describe("hidesPartOfBalance", () => {
  it("names the confidential transfer account extension, and no other known or unknown type", () => {
    expect(hidesPartOfBalance([7, 5])).toBe(true);
    expect(hidesPartOfBalance([])).toBe(false);
    expect(hidesPartOfBalance([2, 7, 8, 11, 13, 15, 17, 27, 999])).toBe(false);
  });
});
