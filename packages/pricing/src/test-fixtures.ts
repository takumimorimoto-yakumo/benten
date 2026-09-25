/**
 * Byte-level fixtures for the pricing tests: `PriceUpdateV2` accounts laid
 * out exactly as the Pyth receiver program writes them. Synthetic values.
 */

export interface PriceUpdateSpec {
  feedId: string;
  price: bigint;
  confidence?: bigint;
  exponent: number;
  publishTime: bigint;
  postedSlot?: bigint;
  /** `1` Full (default) or `0` Partial. */
  verification?: 0 | 1;
}

export function priceUpdateData(spec: PriceUpdateSpec): Uint8Array {
  const partial = spec.verification === 0;
  const data = new Uint8Array(134);
  const view = new DataView(data.buffer);
  data.set([0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd], 0);
  data.fill(5, 8, 40);
  let offset = 40;
  data[offset] = partial ? 0 : 1;
  offset += partial ? 2 : 1;
  for (let index = 0; index < 32; index += 1) data[offset + index] = Number.parseInt(spec.feedId.slice(index * 2, index * 2 + 2), 16);
  offset += 32;
  view.setBigInt64(offset, spec.price, true);
  view.setBigUint64(offset + 8, spec.confidence ?? 1n, true);
  view.setInt32(offset + 16, spec.exponent, true);
  view.setBigInt64(offset + 20, spec.publishTime, true);
  view.setBigInt64(offset + 28, spec.publishTime - 1n, true);
  view.setBigInt64(offset + 36, spec.price, true);
  view.setBigUint64(offset + 44, spec.confidence ?? 1n, true);
  view.setBigUint64(offset + 52, spec.postedSlot ?? 7n, true);
  return data;
}
