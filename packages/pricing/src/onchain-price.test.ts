import { describe, expect, it } from "vitest";

import { newYorkTimeToUtc, sessionDates, usdcPerUnderlyingShare, usdcPerUnscaledToken, type SessionCalendar } from "./onchain-price.js";

const NVDA_TRADE = { usdcRaw: "300652925", xstockRaw: "-133072852", usdcDecimals: 6, xstockDecimals: 8 };

describe("usdcPerUnscaledToken", () => {
  it("divides the USDC change by the xStock change in token units, truncated to 6 digits", () => {
    // 300.652925 USDC for 1.33072852 tokens = 225.93107... USDC per token.
    expect(usdcPerUnscaledToken(NVDA_TRADE)).toBe("225.931074");
  });

  it("uses magnitudes, so the side of the trade does not change the price", () => {
    expect(usdcPerUnscaledToken({ ...NVDA_TRADE, usdcRaw: "-300652925", xstockRaw: "133072852" })).toBe("225.931074");
  });

  it("truncates toward zero instead of rounding", () => {
    // 2 / 3 = 0.666666...; rounding would give 0.666667.
    expect(usdcPerUnscaledToken({ usdcRaw: "2000000", xstockRaw: "-300000000", usdcDecimals: 6, xstockDecimals: 8 })).toBe("0.666666");
  });

  it("keeps exact integers exact", () => {
    expect(usdcPerUnscaledToken({ usdcRaw: "-100000000", xstockRaw: "50000000", usdcDecimals: 6, xstockDecimals: 8 })).toBe("200.000000");
  });

  it("rejects zero, non-integer and out-of-range inputs", () => {
    expect(() => usdcPerUnscaledToken({ ...NVDA_TRADE, xstockRaw: "0" })).toThrow();
    expect(() => usdcPerUnscaledToken({ ...NVDA_TRADE, usdcRaw: "1.5" })).toThrow();
    expect(() => usdcPerUnscaledToken({ ...NVDA_TRADE, usdcRaw: "1e6" })).toThrow();
    expect(() => usdcPerUnscaledToken({ ...NVDA_TRADE, xstockDecimals: 19 })).toThrow();
    expect(() => usdcPerUnscaledToken({ ...NVDA_TRADE, usdcDecimals: -1 })).toThrow();
  });
});

describe("usdcPerUnderlyingShare", () => {
  it("divides the unscaled price by the multiplier", () => {
    expect(usdcPerUnderlyingShare({ usdcRaw: "-200000000", xstockRaw: "100000000", usdcDecimals: 6, xstockDecimals: 8 }, "2")).toBe("100.000000");
    expect(usdcPerUnderlyingShare({ usdcRaw: "-200000000", xstockRaw: "100000000", usdcDecimals: 6, xstockDecimals: 8 }, "1.25")).toBe("160.000000");
  });

  it("matches the unscaled price at multiplier 1", () => {
    expect(usdcPerUnderlyingShare(NVDA_TRADE, "1")).toBe(usdcPerUnscaledToken(NVDA_TRADE));
  });

  it("uses the full multiplier decimal without float conversion", () => {
    // 225.931336... / 1.001701196801074, computed on integers.
    expect(usdcPerUnderlyingShare(NVDA_TRADE, "1.001701196801074")).toBe("225.547374");
  });

  it("rejects a zero, negative or malformed multiplier", () => {
    for (const bad of ["0", "-1", "abc", ""]) expect(() => usdcPerUnderlyingShare(NVDA_TRADE, bad)).toThrow();
  });
});

describe("newYorkTimeToUtc", () => {
  it("applies daylight saving time", () => {
    expect(newYorkTimeToUtc("2026-09-23", "16:00")).toBe("2026-09-23T20:00:00Z");
    expect(newYorkTimeToUtc("2026-01-15", "16:00")).toBe("2026-01-15T21:00:00Z");
  });

  it("switches on the DST boundary days", () => {
    // 2026-03-08 DST starts; 2025-11-02 DST ends.
    expect(newYorkTimeToUtc("2026-03-06", "16:00")).toBe("2026-03-06T21:00:00Z");
    expect(newYorkTimeToUtc("2026-03-09", "16:00")).toBe("2026-03-09T20:00:00Z");
    expect(newYorkTimeToUtc("2025-10-31", "16:00")).toBe("2025-10-31T20:00:00Z");
    expect(newYorkTimeToUtc("2025-11-03", "16:00")).toBe("2025-11-03T21:00:00Z");
  });

  it("converts an early close", () => {
    expect(newYorkTimeToUtc("2025-12-24", "13:00")).toBe("2025-12-24T18:00:00Z");
  });

  it("rejects malformed input", () => {
    for (const [date, clock] of [["2026-9-23", "16:00"], ["2026-09-23", "4pm"], ["2026-09-23", "24:00"]]) {
      expect(() => newYorkTimeToUtc(date!, clock!)).toThrow();
    }
  });
});

describe("sessionDates", () => {
  const calendar: SessionCalendar = {
    exchange: "NYSE",
    time_zone: "America/New_York",
    regular_close: "16:00",
    early_close: "13:00",
    full_closures: ["2025-07-04"],
    early_closes: ["2025-07-03"],
  };

  it("keeps weekdays, drops closures and weekends, and marks early closes", () => {
    expect(sessionDates(calendar, "2025-07-01", "2025-07-08")).toEqual([
      { date: "2025-07-01", close: "16:00" },
      { date: "2025-07-02", close: "16:00" },
      { date: "2025-07-03", close: "13:00" },
      { date: "2025-07-07", close: "16:00" },
      { date: "2025-07-08", close: "16:00" },
    ]);
  });

  it("is empty for a weekend-only or reversed range", () => {
    expect(sessionDates(calendar, "2025-07-05", "2025-07-06")).toEqual([]);
    expect(sessionDates(calendar, "2025-07-08", "2025-07-01")).toEqual([]);
  });
});
