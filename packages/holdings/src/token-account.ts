/**
 * SDK-free decoding of SPL Token / Token-2022 token accounts for the
 * holdings read. Layouts follow the two token programs: a 165-byte base
 * account (mint, owner, raw `u64` amount, delegate, state, native flag,
 * delegated amount, close authority), then for Token-2022 only a one-byte
 * account type and type-length-value extensions.
 *
 * Every amount stays a `bigint` of raw base units; nothing here converts
 * through a floating-point number.
 */

import { encodeBase58 } from "@benten/purchase/base58";

const BASE_ACCOUNT_LENGTH = 165;
const MINT_OFFSET = 0;
const OWNER_OFFSET = 32;
const AMOUNT_OFFSET = 64;
const DELEGATE_TAG_OFFSET = 72;
const STATE_OFFSET = 108;
const IS_NATIVE_TAG_OFFSET = 109;
const CLOSE_AUTHORITY_TAG_OFFSET = 129;
const PUBLIC_KEY_BYTES = 32;
/** Token-2022 puts the account type right after the 165-byte base account. */
const ACCOUNT_TYPE_OFFSET = BASE_ACCOUNT_LENGTH;
const ACCOUNT_TYPE_ACCOUNT = 2;
const TLV_START = ACCOUNT_TYPE_OFFSET + 1;
const TLV_HEADER_LENGTH = 4;
const EXTENSION_UNINITIALIZED = 0;

const STATE_INITIALIZED = 1;
const STATE_FROZEN = 2;

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface DecodedTokenAccount {
  mint: string;
  owner: string;
  amount: bigint;
  frozen: boolean;
  delegated: boolean;
  /** Token-2022 extension type numbers present on the account, in order. Empty for SPL Token. */
  extensions: number[];
}

/** Strict canonical base64 to bytes. `null` for anything else. */
export function decodeBase64(text: unknown): Uint8Array | null {
  if (typeof text !== "string" || !BASE64.test(text)) return null;
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function optionTagOk(view: DataView, offset: number): boolean {
  const tag = view.getUint32(offset, true);
  return tag === 0 || tag === 1;
}

/**
 * Decode one token account. `token2022` selects which layout rules apply:
 * SPL Token accounts are exactly 165 bytes; Token-2022 accounts are 165
 * bytes or carry the account type and complete TLV entries. Returns `null`
 * for an uninitialized account, a bad option tag or a TLV entry that runs
 * past the data.
 */
export function decodeTokenAccount(data: Uint8Array, token2022: boolean): DecodedTokenAccount | null {
  if (data.byteLength < BASE_ACCOUNT_LENGTH) return null;
  if (!token2022 && data.byteLength !== BASE_ACCOUNT_LENGTH) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const state = view.getUint8(STATE_OFFSET);
  if (state !== STATE_INITIALIZED && state !== STATE_FROZEN) return null;
  if (!optionTagOk(view, DELEGATE_TAG_OFFSET) || !optionTagOk(view, IS_NATIVE_TAG_OFFSET) || !optionTagOk(view, CLOSE_AUTHORITY_TAG_OFFSET)) {
    return null;
  }

  const extensions: number[] = [];
  if (data.byteLength > BASE_ACCOUNT_LENGTH) {
    if (view.getUint8(ACCOUNT_TYPE_OFFSET) !== ACCOUNT_TYPE_ACCOUNT) return null;
    let offset = TLV_START;
    while (offset + TLV_HEADER_LENGTH <= data.byteLength) {
      const type = view.getUint16(offset, true);
      const length = view.getUint16(offset + 2, true);
      if (type === EXTENSION_UNINITIALIZED) break;
      const valueEnd = offset + TLV_HEADER_LENGTH + length;
      if (valueEnd > data.byteLength) return null;
      extensions.push(type);
      offset = valueEnd;
    }
  }

  return {
    mint: encodeBase58(data.subarray(MINT_OFFSET, MINT_OFFSET + PUBLIC_KEY_BYTES)),
    owner: encodeBase58(data.subarray(OWNER_OFFSET, OWNER_OFFSET + PUBLIC_KEY_BYTES)),
    amount: view.getBigUint64(AMOUNT_OFFSET, true),
    frozen: state === STATE_FROZEN,
    delegated: view.getUint32(DELEGATE_TAG_OFFSET, true) === 1,
    extensions,
  };
}

/**
 * Token-2022 account extensions that keep part of the owner's balance outside
 * the base `amount` field. `ConfidentialTransferAccount` (5) holds encrypted
 * pending and available balances, so the public raw amount of such an
 * account is not all it holds; a supported product account carrying it is
 * refused (fail-closed) rather than shown with an understated quantity.
 *
 * Every other extension type, including a type number this code does not
 * know, is accepted on a supported product account as long as its TLV entry
 * is complete: Token-2022 appends extensions after the fixed 165-byte base
 * account, so no extension can change where or how the raw `u64` amount is
 * read. Known account extensions that do not hide balance: transfer-fee
 * withheld amount (2, withheld for the fee authority, not the owner's),
 * immutable owner (7), memo transfer (8), CPI guard (11), non-transferable
 * (13), transfer-hook account (15), confidential-transfer fee amount (17,
 * also withheld for the fee authority) and pausable account (27). Frozen and
 * delegated states are reported, not hidden.
 */
const BALANCE_HIDING_EXTENSIONS: ReadonlySet<number> = new Set([5]);

/** Whether an account's extensions keep part of its balance outside the raw amount. */
export function hidesPartOfBalance(extensions: readonly number[]): boolean {
  return extensions.some((type) => BALANCE_HIDING_EXTENSIONS.has(type));
}

export interface AccountKeys {
  mint: string;
  owner: string;
}

/**
 * Read only the mint and owner of a token account, without validating
 * anything else. Used to classify accounts of mints outside the allowlist,
 * which are counted but never decoded. `null` when the data is too short to
 * hold both keys.
 */
export function readAccountKeys(data: Uint8Array): AccountKeys | null {
  if (data.byteLength < OWNER_OFFSET + PUBLIC_KEY_BYTES) return null;
  return {
    mint: encodeBase58(data.subarray(MINT_OFFSET, MINT_OFFSET + PUBLIC_KEY_BYTES)),
    owner: encodeBase58(data.subarray(OWNER_OFFSET, OWNER_OFFSET + PUBLIC_KEY_BYTES)),
  };
}

/** Clock sysvar layout: slot, epoch start timestamp, epoch, leader schedule epoch, unix timestamp. */
const CLOCK_LENGTH = 40;
const CLOCK_SLOT_OFFSET = 0;
const CLOCK_UNIX_TIMESTAMP_OFFSET = 32;

export interface DecodedClock {
  slot: bigint;
  unixTimestamp: bigint;
}

/** Decode the Clock sysvar. `null` for data of the wrong size. */
export function decodeClock(data: Uint8Array): DecodedClock | null {
  if (data.byteLength !== CLOCK_LENGTH) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { slot: view.getBigUint64(CLOCK_SLOT_OFFSET, true), unixTimestamp: view.getBigInt64(CLOCK_UNIX_TIMESTAMP_OFFSET, true) };
}
