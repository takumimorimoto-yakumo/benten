import { describe, expect, it } from "vitest";

import { decodeMint, effectiveMultiplier } from "./mint-info";

const BASE_MINT = 82;
const TOKEN_2022_HEADER = 166;

function baseMint(decimals: number, length = BASE_MINT): Uint8Array {
  const data = new Uint8Array(length);
  data[44] = decimals;
  data[45] = 1;
  return data;
}

function tlv(type: number, value: Uint8Array): Uint8Array {
  const entry = new Uint8Array(4 + value.length);
  const view = new DataView(entry.buffer);
  view.setUint16(0, type, true);
  view.setUint16(2, value.length, true);
  entry.set(value, 4);
  return entry;
}

function scaledUiAmount(multiplier: number, effectiveAt: bigint, newMultiplier: number): Uint8Array {
  const value = new Uint8Array(56);
  const view = new DataView(value.buffer);
  view.setFloat64(32, multiplier, true);
  view.setBigInt64(40, effectiveAt, true);
  view.setFloat64(48, newMultiplier, true);
  return value;
}

function token2022Mint(decimals: number, ...extensions: Uint8Array[]): Uint8Array {
  const body = baseMint(decimals, TOKEN_2022_HEADER);
  body[165] = 1;
  const total = extensions.reduce((sum, entry) => sum + entry.length, body.length);
  const data = new Uint8Array(total);
  data.set(body);
  let offset = body.length;
  for (const entry of extensions) {
    data.set(entry, offset);
    offset += entry.length;
  }
  return data;
}

// Values observed read-only on the NVDAx mint (docs/route-feasibility-2026-09-14.md).
const OBSERVED_MULTIPLIER = 1.0009180758490996;
const OBSERVED_NEW_MULTIPLIER = 1.001701196801074;
const OBSERVED_EFFECTIVE_AT = 1_789_000_200n; // 2026-09-10T00:30:00Z

describe("decodeMint", () => {
  it("reads decimals from a legacy SPL mint without extensions", () => {
    expect(decodeMint(baseMint(6))).toEqual({ decimals: 6, scaledUiAmount: null });
  });

  it("reads the Scaled UI Amount extension after other extensions", () => {
    const data = token2022Mint(
      8,
      tlv(18, new Uint8Array(64)),
      tlv(12, new Uint8Array(32)),
      tlv(25, scaledUiAmount(OBSERVED_MULTIPLIER, OBSERVED_EFFECTIVE_AT, OBSERVED_NEW_MULTIPLIER)),
      tlv(14, new Uint8Array(64)),
    );
    expect(decodeMint(data)).toEqual({
      decimals: 8,
      scaledUiAmount: { multiplier: "1.0009180758490996", newMultiplier: "1.001701196801074", newMultiplierEffectiveTimestamp: OBSERVED_EFFECTIVE_AT },
    });
  });

  it("returns no multiplier when the extension is absent or stores an unusable value", () => {
    expect(decodeMint(token2022Mint(8, tlv(18, new Uint8Array(64))))?.scaledUiAmount).toBeNull();
    expect(decodeMint(token2022Mint(8, tlv(25, scaledUiAmount(0, 0n, 1))))?.scaledUiAmount).toBeNull();
    expect(decodeMint(token2022Mint(8, tlv(25, scaledUiAmount(Number.NaN, 0n, 1))))?.scaledUiAmount).toBeNull();
  });

  it("fails closed on truncated or non-mint data", () => {
    expect(decodeMint(new Uint8Array(10))).toBeNull();
    const uninitialized = baseMint(6);
    uninitialized[45] = 0;
    expect(decodeMint(uninitialized)).toBeNull();
    const wrongType = token2022Mint(8);
    wrongType[165] = 2;
    expect(decodeMint(wrongType)).toBeNull();
    const truncated = token2022Mint(8, tlv(25, scaledUiAmount(1, 0n, 1))).subarray(0, TOKEN_2022_HEADER + 20);
    expect(decodeMint(truncated)).toBeNull();
    expect(decodeMint(token2022Mint(8, tlv(25, new Uint8Array(40))))).toBeNull();
  });
});

describe("effectiveMultiplier", () => {
  const config = { multiplier: "1.0009180758490996", newMultiplier: "1.001701196801074", newMultiplierEffectiveTimestamp: OBSERVED_EFFECTIVE_AT };

  it("uses the new multiplier at and after its effective time, the stored one before", () => {
    const effectiveMs = Number(OBSERVED_EFFECTIVE_AT) * 1000;
    expect(effectiveMultiplier(config, effectiveMs - 1)).toBe("1.0009180758490996");
    expect(effectiveMultiplier(config, effectiveMs)).toBe("1.001701196801074");
    expect(effectiveMultiplier(config, effectiveMs + 86_400_000)).toBe("1.001701196801074");
  });
});
