import { describe, expect, it } from "vitest";
import { formatSourceDate } from "@/lib/i18n/format";

describe("source date formatting", () => {
  it("formats valid ISO dates in UTC without changing the source day", () => {
    expect(formatSourceDate("2025-01-31", "en")).toContain("2025");
    expect(formatSourceDate("2025-01-31", "ja")).toContain("2025");
  });
  it("keeps invalid or non-ISO source values verbatim instead of normalizing them", () => {
    expect(formatSourceDate("2025-02-29", "en")).toBe("2025-02-29");
    expect(formatSourceDate("2025-13-01", "en")).toBe("2025-13-01");
    expect(formatSourceDate("2025-1-1", "en")).toBe("2025-1-1");
  });
});

import { formatCurrencyForLocale } from "@/lib/i18n/format";
it("keeps the accepted Latin B abbreviation across locales without introducing a local unit", () => {
  for (const locale of ["en", "ja", "ko", "zh-Hans", "zh-Hant"] as const) {
    expect(formatCurrencyForLocale(215938000000, "USD", locale)).toContain("215.938B");
    expect(formatCurrencyForLocale(215938000000, "USD", locale)).not.toMatch(/[\u5104\uc5b5\u4ebf]/);
  }
});
