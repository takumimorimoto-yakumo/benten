import { describe, expect, it } from "vitest";
import { referenceValue, sumReferenceValues } from "./value.js";

const NVDAX = { rawAmount: "4419820", decimals: 8, hasScaledUiAmount: true, scaledUiMultiplier: "1" };
const PRICE = { price_raw: "18241000000", exponent: -8 };

describe("referenceValue", () => {
  it("values raw ÷ 10^decimals × multiplier × price, truncated to cents", () => {
    const result = referenceValue(NVDAX, PRICE);
    expect(result.status).toBe("valued");
    if (result.status !== "valued") return;
    expect(result.shareEquivalent).toBe("0.0441982");
    // 0.0441982 × 182.41 = 8.062293... → 8.06 (never rounded up)
    expect(result.value).toBe("8.06");
    expect(referenceValue({ ...NVDAX, scaledUiMultiplier: "1.5" }, PRICE)).toMatchObject({ status: "valued", value: "12.09", multiplier: "1.5" });
  });

  it("gives no value without decimals, the extension or a positive multiplier", () => {
    expect(referenceValue({ ...NVDAX, decimals: null }, PRICE)).toEqual({ status: "unavailable", reason: "holding_metadata_unavailable" });
    expect(referenceValue({ ...NVDAX, hasScaledUiAmount: null }, PRICE)).toEqual({ status: "unavailable", reason: "holding_metadata_unavailable" });
    expect(referenceValue({ ...NVDAX, rawAmount: "1.5" }, PRICE)).toEqual({ status: "unavailable", reason: "holding_metadata_unavailable" });
    expect(referenceValue({ ...NVDAX, hasScaledUiAmount: false }, PRICE)).toEqual({ status: "unavailable", reason: "multiplier_unavailable" });
    expect(referenceValue({ ...NVDAX, scaledUiMultiplier: null }, PRICE)).toEqual({ status: "unavailable", reason: "multiplier_unavailable" });
    expect(referenceValue({ ...NVDAX, scaledUiMultiplier: "0" }, PRICE)).toEqual({ status: "unavailable", reason: "multiplier_unavailable" });
  });

  it("sums exact values before truncating", () => {
    const one = referenceValue({ ...NVDAX, rawAmount: "2741" }, { price_raw: "1000000000", exponent: -8 });
    if (one.status !== "valued") throw new Error("expected a value");
    // 0.00002741 × 10 = 0.0002741 each; truncated alone 0.00, summed 100 times 0.02741 → 0.02
    expect(sumReferenceValues(Array.from({ length: 100 }, () => one.exact))).toBe("0.02");
    expect(sumReferenceValues([])).toBe("0.00");
  });
});
