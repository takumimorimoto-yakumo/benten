import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";

import { encodeBase58 } from "./base58";

describe("encodeBase58", () => {
  it("matches the Solana encoding of 32-byte keys", () => {
    for (const address of ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "11111111111111111111111111111111", "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh"]) {
      expect(encodeBase58(new PublicKey(address).toBytes())).toBe(address);
    }
  });

  it("keeps leading zero bytes and encodes 64-byte signatures", () => {
    expect(encodeBase58(Uint8Array.from([0, 0, 1]))).toBe("112");
    expect(encodeBase58(new Uint8Array(0))).toBe("");
    const signature = encodeBase58(new Uint8Array(64).fill(255));
    expect(signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/);
  });
});
