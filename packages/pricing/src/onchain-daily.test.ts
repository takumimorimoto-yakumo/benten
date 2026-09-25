import { describe, expect, it } from "vitest";

import {
  ONCHAIN_DAILY,
  ONCHAIN_POOLS,
  onchainDailySeries,
  onchainDailyTickers,
  validateOnchainDaily,
  validateOnchainPools,
  type OnchainDailyV1,
} from "./onchain-daily.js";
import { newYorkTimeToUtc, sessionDates, usdcPerUnscaledToken } from "./onchain-price.js";

type Mutable = Record<string, any>;

function copy(): Mutable {
  return structuredClone(ONCHAIN_DAILY) as unknown as Mutable;
}

function nvda(artifact: Mutable): Mutable {
  return artifact.series.find((series: Mutable) => series.ticker === "NVDA");
}

function firstObserved(series: Mutable, predicate: (point: Mutable) => boolean = () => true): Mutable {
  const point = series.points.find((entry: Mutable) => entry.status === "observed" && predicate(entry));
  if (!point) throw new Error("fixture needs an observed point");
  return point;
}

const rejects = (artifact: Mutable) => expect(() => validateOnchainDaily(artifact, ONCHAIN_POOLS)).toThrow(/invalid on-chain daily series/);

describe("bundled on-chain daily series", () => {
  it("covers NVDA from its reviewed pool with one point per NYSE session", () => {
    const series = nvda(copy());
    const pool = ONCHAIN_POOLS.pools.find((entry) => entry.ticker === "NVDA")!;
    expect(series.pool.address).toBe(pool.address);
    const sessions = sessionDates(ONCHAIN_DAILY.session_calendar, series.first_date, series.last_date);
    expect(series.points.map((point: Mutable) => point.date)).toEqual(sessions.map((session) => session.date));
  });

  it("stores every observed price as the exact truncated quotient of its raw amounts", () => {
    for (const series of ONCHAIN_DAILY.series) {
      for (const point of series.points) {
        if (point.status !== "observed") continue;
        expect(point.usdc_per_unscaled_token).toBe(usdcPerUnscaledToken({
          usdcRaw: point.usdc_raw, xstockRaw: point.xstock_raw, usdcDecimals: series.usdc_decimals, xstockDecimals: series.xstock_decimals,
        }));
      }
    }
  });

  it("gives per-share values only from the known multiplier onward", () => {
    for (const series of ONCHAIN_DAILY.series) {
      const knownFrom = series.multiplier_basis?.known_from ? Date.parse(series.multiplier_basis.known_from) : null;
      for (const point of series.points) {
        if (point.status !== "observed") continue;
        const known = knownFrom !== null && Date.parse(point.block_time) >= knownFrom;
        expect(point.usdc_per_underlying_share === null).toBe(!known);
      }
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(ONCHAIN_DAILY)).toBe(true);
    expect(Object.isFrozen(ONCHAIN_DAILY.series[0]!.points[0])).toBe(true);
  });
});

describe("onchainDailySeries read model", () => {
  it("returns each session with price, source trade and reason fields", () => {
    const series = onchainDailySeries("NVDA")!;
    expect(series.ticker).toBe("NVDA");
    expect(series.points.length).toBeGreaterThan(0);
    for (const point of series.points) {
      expect(point.pool).toBe(series.pool.address);
      expect(point.sessionCloseUtc).toBe(newYorkTimeToUtc(point.date, ONCHAIN_DAILY.session_calendar.early_closes.includes(point.date) ? "13:00" : "16:00"));
      if (point.status === "observed") {
        expect(point.usdcPerUnscaledToken).toMatch(/^\d+\.\d{6}$/);
        expect(point.signature).not.toBeNull();
        expect(point.slot).not.toBeNull();
        expect(point.blockTime).toMatch(/Z$/);
        expect(point.reason).toBeNull();
      } else {
        expect([point.usdcPerUnscaledToken, point.usdcPerUnderlyingShare, point.signature, point.slot, point.blockTime]).toEqual([null, null, null, null, null]);
        expect(point.reason).not.toBeNull();
      }
    }
  });

  it("matches tickers exactly and returns nothing for anything else", () => {
    for (const input of ["NVDAx", "nvda", " NVDA", "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", "", undefined, null, 1]) {
      expect(onchainDailySeries(input)).toBeUndefined();
    }
    expect(onchainDailyTickers()).toContain("NVDA");
  });
});

describe("validateOnchainDaily fails closed", () => {
  it("accepts the bundled artifact", () => {
    expect(() => validateOnchainDaily(copy(), ONCHAIN_POOLS)).not.toThrow();
  });

  it("rejects unknown keys at every level", () => {
    const top = copy();
    top.extra = 1;
    rejects(top);
    const point = copy();
    firstObserved(nvda(point)).extra = 1;
    rejects(point);
  });

  it("rejects a price that is not its raw amounts' price", () => {
    const artifact = copy();
    const point = firstObserved(nvda(artifact));
    point.usdc_per_unscaled_token = "1.000000";
    rejects(artifact);
  });

  it("rejects raw amounts that do not move in opposite directions", () => {
    const artifact = copy();
    const point = firstObserved(nvda(artifact));
    point.xstock_raw = point.xstock_raw.replace(/^-/, "");
    point.usdc_raw = point.usdc_raw.replace(/^-/, "");
    rejects(artifact);
  });

  it("rejects a per-share value where the multiplier is unknown", () => {
    const artifact = copy();
    const series = nvda(artifact);
    const knownFrom = series.multiplier_basis?.known_from ? Date.parse(series.multiplier_basis.known_from) : Infinity;
    const point = firstObserved(series, (entry) => Date.parse(entry.block_time) < knownFrom);
    point.usdc_per_underlying_share = point.usdc_per_unscaled_token;
    rejects(artifact);
  });

  it("rejects a missing or extra session", () => {
    const missing = copy();
    nvda(missing).points.splice(1, 1);
    rejects(missing);
    const renamed = copy();
    nvda(renamed).points[0].date = "2025-07-05";
    rejects(renamed);
  });

  it("rejects a pool that is not the reviewed pool", () => {
    const artifact = copy();
    nvda(artifact).pool.usdc_vault = "11111111111111111111111111111111";
    rejects(artifact);
  });

  it("rejects a mint or ticker that disagrees with the registry", () => {
    const ticker = copy();
    nvda(ticker).ticker = "TSLA";
    rejects(ticker);
    const mint = copy();
    nvda(mint).mint = "11111111111111111111111111111111";
    rejects(mint);
  });

  it("rejects slots that do not increase and repeated signatures", () => {
    const artifact = copy();
    const observed = nvda(artifact).points.filter((point: Mutable) => point.status === "observed");
    observed[1].signature = observed[0].signature;
    rejects(artifact);
    const slots = copy();
    const points = nvda(slots).points;
    points[1].close_slot = points[0].close_slot;
    rejects(slots);
  });

  it("rejects an unknown unavailable reason or status", () => {
    const artifact = copy();
    nvda(artifact).points[0] = { date: nvda(artifact).points[0].date, status: "unavailable", close_slot: nvda(artifact).points[0].close_slot, reason: "guessed" };
    rejects(artifact);
    const status = copy();
    firstObserved(nvda(status)).status = "quoted";
    rejects(status);
  });

  it("rejects a multiplier basis that claims a multiplier not yet in effect", () => {
    const artifact = copy();
    const basis = nvda(artifact).multiplier_basis;
    if (!basis) return;
    basis.next_multiplier_effective_at = "2099-01-01T00:00:00Z";
    rejects(artifact);
  });

  it("rejects a trade outside the search window", () => {
    const artifact = copy() as unknown as OnchainDailyV1 & Mutable;
    const point = firstObserved(nvda(artifact));
    point.slot = point.close_slot + artifact.method.max_slot_distance;
    rejects(artifact);
  });
});

describe("validateOnchainPools fails closed", () => {
  it("rejects a second pool for a ticker and a non-USDC quote", () => {
    const pools = structuredClone(ONCHAIN_POOLS) as unknown as Mutable;
    pools.pools.push({ ...pools.pools[0], address: "11111111111111111111111111111111" });
    expect(() => validateOnchainPools(pools)).toThrow();
    const quote = structuredClone(ONCHAIN_POOLS) as unknown as Mutable;
    quote.pools[0].usdc_decimals = 9;
    expect(() => validateOnchainPools(quote)).toThrow();
  });

  it("rejects a pool for a mint that is not a supported xStock", () => {
    const pools = structuredClone(ONCHAIN_POOLS) as unknown as Mutable;
    pools.pools[0].xstock_mint = "11111111111111111111111111111111";
    expect(() => validateOnchainPools(pools)).toThrow();
  });
});
