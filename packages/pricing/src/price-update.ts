/**
 * SDK-free decoding of a Pyth `PriceUpdateV2` account on Solana: the account
 * the Pyth Solana receiver program owns for each price feed and shard, which
 * anyone may keep current. Reading one needs no API key and no signature.
 *
 * Layout (Anchor): 8-byte discriminator, write authority (32), verification
 * level (tag `0` Partial + one byte of signature count, or tag `1` Full),
 * then the price message: feed id (32), price i64, confidence u64, exponent
 * i32, publish time i64, previous publish time i64, EMA price i64, EMA
 * confidence u64, and finally the posted slot u64.
 */

const DISCRIMINATOR = [0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd] as const;
const WRITE_AUTHORITY_END = 8 + 32;
const VERIFICATION_FULL = 1;
/** Bytes after the verification level: feed id, 7 numeric fields, posted slot. */
const MESSAGE_LENGTH = 32 + 8 + 8 + 4 + 8 + 8 + 8 + 8 + 8;

export interface DecodedPriceUpdate {
  feedId: string;
  price: bigint;
  confidence: bigint;
  exponent: number;
  publishTime: bigint;
  postedSlot: bigint;
}

function hex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/**
 * Decode one price update account. Only fully verified updates are
 * accepted: a partially verified update (fewer guardian signatures checked)
 * is reported as `null`, like any other malformed data.
 */
export function decodePriceUpdate(data: Uint8Array): DecodedPriceUpdate | null {
  if (data.byteLength < WRITE_AUTHORITY_END + 1 + MESSAGE_LENGTH) return null;
  if (DISCRIMINATOR.some((byte, index) => data[index] !== byte)) return null;
  if (data[WRITE_AUTHORITY_END] !== VERIFICATION_FULL) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = WRITE_AUTHORITY_END + 1;
  const feedId = hex(data.subarray(offset, offset + 32));
  offset += 32;
  const price = view.getBigInt64(offset, true);
  const confidence = view.getBigUint64(offset + 8, true);
  const exponent = view.getInt32(offset + 16, true);
  const publishTime = view.getBigInt64(offset + 20, true);
  // Previous publish time, EMA price and EMA confidence are not used.
  const postedSlot = view.getBigUint64(offset + 20 + 8 + 8 + 8 + 8, true);
  if (exponent < -18 || exponent > 18 || publishTime <= 0n) return null;
  return { feedId, price, confidence, exponent, publishTime, postedSlot };
}
