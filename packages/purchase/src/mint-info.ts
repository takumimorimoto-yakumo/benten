/**
 * Read-only decoding of SPL Token / Token-2022 mint accounts for the purchase
 * panel: decimals, and the Token-2022 Scaled UI Amount multiplier that turns
 * NVDAx raw units into the display amount (design contract section 4).
 *
 * The multiplier is always read from the mint account at the time it is
 * shown, never from a stored constant. Layouts follow the SPL Token and
 * Token-2022 programs: an 82-byte base mint, then (Token-2022 only) padding
 * to 165 bytes, a one-byte account type and type-length-value extensions.
 */

const BASE_MINT_LENGTH = 82;
const DECIMALS_OFFSET = 44;
const IS_INITIALIZED_OFFSET = 45;
/** Token-2022 puts the account type right after the 165-byte base account area. */
const ACCOUNT_TYPE_OFFSET = 165;
const ACCOUNT_TYPE_MINT = 1;
const TLV_START = ACCOUNT_TYPE_OFFSET + 1;
const TLV_HEADER_LENGTH = 4;
const EXTENSION_UNINITIALIZED = 0;
/** `ExtensionType::ScaledUiAmount` in the Token-2022 program. */
const EXTENSION_SCALED_UI_AMOUNT = 25;
/** authority (32) + multiplier f64 (8) + new_multiplier_effective_timestamp i64 (8) + new_multiplier f64 (8). */
const SCALED_UI_AMOUNT_LENGTH = 56;
const SCALED_MULTIPLIER_OFFSET = 32;
const SCALED_TIMESTAMP_OFFSET = 40;
const SCALED_NEW_MULTIPLIER_OFFSET = 48;

export interface ScaledUiAmountConfig {
  /** The stored multiplier, as the shortest decimal string for the stored f64. */
  multiplier: string;
  /** The scheduled multiplier and the Unix time (seconds) from which it applies. */
  newMultiplier: string;
  newMultiplierEffectiveTimestamp: bigint;
}

export interface MintInfo {
  decimals: number;
  /** `null` when the mint has no Scaled UI Amount extension. */
  scaledUiAmount: ScaledUiAmountConfig | null;
}

/**
 * Shortest round-trip decimal text for a stored f64 multiplier. This is a
 * formatting step for a value the chain itself stores as a float; every
 * amount computed from it afterwards uses integer arithmetic.
 */
function multiplierText(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return String(value);
}

/** Decode a mint account's data. Returns `null` for anything that is not an initialized mint. */
export function decodeMint(data: Uint8Array): MintInfo | null {
  if (data.byteLength < BASE_MINT_LENGTH) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint8(IS_INITIALIZED_OFFSET) !== 1) return null;
  const decimals = view.getUint8(DECIMALS_OFFSET);
  if (data.byteLength === BASE_MINT_LENGTH) return { decimals, scaledUiAmount: null };
  if (data.byteLength < TLV_START || view.getUint8(ACCOUNT_TYPE_OFFSET) !== ACCOUNT_TYPE_MINT) return null;

  let scaledUiAmount: ScaledUiAmountConfig | null = null;
  let offset = TLV_START;
  while (offset + TLV_HEADER_LENGTH <= data.byteLength) {
    const type = view.getUint16(offset, true);
    const length = view.getUint16(offset + 2, true);
    if (type === EXTENSION_UNINITIALIZED) break;
    const valueStart = offset + TLV_HEADER_LENGTH;
    if (valueStart + length > data.byteLength) return null;
    if (type === EXTENSION_SCALED_UI_AMOUNT) {
      if (length < SCALED_UI_AMOUNT_LENGTH) return null;
      const multiplier = multiplierText(view.getFloat64(valueStart + SCALED_MULTIPLIER_OFFSET, true));
      const newMultiplier = multiplierText(view.getFloat64(valueStart + SCALED_NEW_MULTIPLIER_OFFSET, true));
      scaledUiAmount = multiplier && newMultiplier
        ? { multiplier, newMultiplier, newMultiplierEffectiveTimestamp: view.getBigInt64(valueStart + SCALED_TIMESTAMP_OFFSET, true) }
        : null;
    }
    offset = valueStart + length;
  }
  return { decimals, scaledUiAmount };
}

/**
 * The multiplier in effect at `nowMs`: `newMultiplier` once the current time
 * is at or after its effective timestamp, otherwise `multiplier`.
 */
export function effectiveMultiplier(config: ScaledUiAmountConfig, nowMs: number): string {
  const nowSeconds = BigInt(Math.floor(nowMs / 1000));
  return nowSeconds >= config.newMultiplierEffectiveTimestamp ? config.newMultiplier : config.multiplier;
}
