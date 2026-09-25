/**
 * Byte-level fixtures for the holdings tests: token accounts, mints and the
 * Clock sysvar built exactly as the token programs lay them out. Synthetic
 * specimens only; no real wallet appears here.
 */

import { encodeBase58 } from "@benten/purchase/base58";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function decodeBase58(text: string): Uint8Array {
  let value = 0n;
  for (const character of text) value = value * 58n + BigInt(ALPHABET.indexOf(character));
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  let leading = 0;
  while (text[leading] === "1") leading += 1;
  const out = new Uint8Array(leading + bytes.length);
  out.set(bytes, leading);
  return out;
}

export const OWNER = encodeBase58(new Uint8Array(32).fill(7));
export const OTHER_OWNER = encodeBase58(new Uint8Array(32).fill(9));
export const accountAddress = (seed: number) => encodeBase58(new Uint8Array(32).fill(seed));

export interface TokenAccountSpec {
  mint: string;
  owner?: string;
  amount: bigint;
  state?: number;
  delegate?: boolean;
  /** Token-2022 TLV entries appended after the account type byte. */
  extensions?: Array<{ type: number; length: number; declaredLength?: number }>;
  /** Force the Token-2022 layout (account type byte) even without extensions. */
  token2022Layout?: boolean;
}

export function tokenAccountData(spec: TokenAccountSpec): Uint8Array {
  const extensions = spec.extensions ?? [];
  const tlvLength = extensions.reduce((sum, entry) => sum + 4 + entry.length, 0);
  const withType = spec.token2022Layout || extensions.length > 0;
  const data = new Uint8Array(165 + (withType ? 1 + tlvLength : 0));
  const view = new DataView(data.buffer);
  data.set(decodeBase58(spec.mint), 0);
  data.set(decodeBase58(spec.owner ?? OWNER), 32);
  view.setBigUint64(64, spec.amount, true);
  if (spec.delegate) {
    view.setUint32(72, 1, true);
    data.fill(3, 76, 108);
  }
  data[108] = spec.state ?? 1;
  if (withType) {
    data[165] = 2;
    let offset = 166;
    for (const entry of extensions) {
      view.setUint16(offset, entry.type, true);
      view.setUint16(offset + 2, entry.declaredLength ?? entry.length, true);
      offset += 4 + entry.length;
    }
  }
  return data;
}

export function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** A mint account: SPL base mint (82 bytes), or Token-2022 with an optional Scaled UI Amount extension. */
export function mintData(decimals: number, scaled?: { multiplier: number; effectiveAt: bigint; newMultiplier: number }): Uint8Array {
  if (!scaled) {
    const data = new Uint8Array(82);
    data[44] = decimals;
    data[45] = 1;
    return data;
  }
  const data = new Uint8Array(166 + 4 + 56);
  const view = new DataView(data.buffer);
  data[44] = decimals;
  data[45] = 1;
  data[165] = 1;
  view.setUint16(166, 25, true);
  view.setUint16(168, 56, true);
  view.setFloat64(170 + 32, scaled.multiplier, true);
  view.setBigInt64(170 + 40, scaled.effectiveAt, true);
  view.setFloat64(170 + 48, scaled.newMultiplier, true);
  return data;
}

export function clockData(slot: bigint, unixTimestamp: bigint): Uint8Array {
  const data = new Uint8Array(40);
  const view = new DataView(data.buffer);
  view.setBigUint64(0, slot, true);
  view.setBigInt64(32, unixTimestamp, true);
  return data;
}

export function keyedAccount(pubkey: string, programOwner: string, data: Uint8Array) {
  return { pubkey, account: { owner: programOwner, lamports: 2_039_280, executable: false, rentEpoch: 0, space: data.length, data: [base64(data), "base64"] } };
}
