import { PublicKey } from "@solana/web3.js";

/**
 * Base58 alphabet used by Solana addresses (Bitcoin's base58, i.e. without
 * 0/O/I/l). Solana public keys are 32-byte ed25519 points, which base58-encode
 * to somewhere between 32 and 44 characters.
 */
const BASE58_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Strictly validate that `input` is a well-formed Solana address, WITHOUT
 * ever touching the network.
 *
 * Two independent checks, both required:
 *   1. A base58 charset + length regex (cheap, rejects garbage immediately).
 *   2. Construction of an actual `PublicKey` (catches values that pass the
 *      regex but do not decode to a valid 32-byte key). `PublicKey`
 *      construction is a pure local computation — it never makes an RPC call.
 */
export function isValidSolanaAddress(input: string): boolean {
  if (typeof input !== "string" || !BASE58_ADDRESS_RE.test(input)) {
    return false;
  }
  try {
    new PublicKey(input);
    return true;
  } catch {
    return false;
  }
}
