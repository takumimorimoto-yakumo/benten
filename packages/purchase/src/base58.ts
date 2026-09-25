/**
 * Base58 (Bitcoin alphabet) encoding for the 64-byte signature a wallet
 * returns, so it can be looked up over RPC and shown. Encoding only.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE = 58n;

export function encodeBase58(bytes: Uint8Array): string {
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros += 1;
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let encoded = "";
  while (value > 0n) {
    encoded = ALPHABET[Number(value % BASE)] + encoded;
    value /= BASE;
  }
  return "1".repeat(leadingZeros) + encoded;
}
