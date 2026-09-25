import { describe, it, expect, vi, afterEach } from "vitest";
import { getWalletHoldings, InvalidSolanaAddressError } from "./get-wallet-holdings.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getWalletHoldings — invalid address never reaches the network", () => {
  const invalidInputs = ["not-an-address", "", "*"];

  for (const address of invalidInputs) {
    it(`throws InvalidSolanaAddressError and never calls fetch for "${address}"`, async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await expect(getWalletHoldings({ address })).rejects.toThrow(InvalidSolanaAddressError);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("returns Profile A unavailable for a valid address without RPC", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getWalletHoldings({
      address: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    })).resolves.toMatchObject({
      data: {
        available: false,
        reason: "wallet_correctness_unverified",
        retryable: false,
        release_profile: "mint_core",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
