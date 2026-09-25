import { describe, it, expect } from "vitest";
import { isValidSolanaAddress } from "./solana-address.js";

describe("isValidSolanaAddress", () => {
  it("returns true for a well-formed base58 Solana address", () => {
    expect(isValidSolanaAddress("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh")).toBe(true);
  });

  it("returns false for a non-base58 string", () => {
    expect(isValidSolanaAddress("not-an-address")).toBe(false);
  });

  it("returns false for a string containing base58-excluded characters (0, O, I, l)", () => {
    expect(isValidSolanaAddress("0OIl11111111111111111111111111111")).toBe(false);
  });

  it("returns false for a string that is too short", () => {
    expect(isValidSolanaAddress("abc123")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isValidSolanaAddress("")).toBe(false);
  });

  it("returns false for a wildcard string", () => {
    expect(isValidSolanaAddress("*")).toBe(false);
  });
});
