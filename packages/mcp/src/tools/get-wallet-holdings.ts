import { REGISTRY_AS_OF, RELEASE_PROFILE } from "@benten/registry";
import { buildEnvelope, type Envelope } from "../lib/envelope.js";
import { isValidSolanaAddress } from "../lib/solana-address.js";

export interface GetWalletHoldingsInput {
  address: string;
}

export interface WalletHoldingsUnavailable {
  available: false;
  reason: "wallet_correctness_unverified";
  retryable: false;
  release_profile: "mint_core";
}

export class InvalidSolanaAddressError extends Error {
  constructor(address: string) {
    super(`"${address}" is not a well-formed Solana address`);
    this.name = "InvalidSolanaAddressError";
  }
}

/**
 * Profile A deliberately has no RPC path. A valid address returns a stable
 * unavailable result until the Token-2022 display multiplier gate is proven.
 */
export async function getWalletHoldings(
  input: GetWalletHoldingsInput,
): Promise<Envelope<WalletHoldingsUnavailable>> {
  if (!isValidSolanaAddress(input.address)) {
    throw new InvalidSolanaAddressError(input.address);
  }
  if (RELEASE_PROFILE !== "mint_core") {
    throw new Error("wallet enhanced profile is not implemented");
  }
  return buildEnvelope(
    {
      available: false,
      reason: "wallet_correctness_unverified",
      retryable: false,
      release_profile: "mint_core",
    },
    REGISTRY_AS_OF,
    "Solana read-only wallet lookup",
  );
}
