import assert from "node:assert/strict";
import { test } from "node:test";
import { isWithheldFromProduct, productXStocks, xstocks } from "@benten/registry";
import {
  ROUTE_POLICY_REVISION,
  resolveReviewedRoute,
} from "./route-policy.js";

const NVDA_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

test("only the exact allowlisted NVDAx mint has two observation-only records", () => {
  assert.match(ROUTE_POLICY_REVISION, /^m2-[a-z0-9-]+$/);
  for (const venue of ["raydium_clmm", "meteora_dlmm"] as const) {
    const byTicker = resolveReviewedRoute({ ticker: "NVDA" }, venue);
    const byMint = resolveReviewedRoute({ mint: NVDA_MINT }, venue);
    assert.equal(byTicker.status, "configured");
    assert.deepEqual(byTicker, byMint);
    if (byTicker.status !== "configured") continue;
    assert.equal(byTicker.route.xstockMint, NVDA_MINT);
    assert.equal(byTicker.route.usdcMint, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    assert.equal(byTicker.route.quoteAvailable, false);
    assert.equal(byTicker.route.policyRevision, ROUTE_POLICY_REVISION);
    assert.equal(byTicker.route.inspectionEnabled, true);
  }
  for (const entry of productXStocks.filter((entry) => entry.mint !== NVDA_MINT)) {
    assert.deepEqual(resolveReviewedRoute({ mint: entry.mint }, "meteora_dlmm"), {
      status: "unavailable", reason: "no_verified_pool",
    });
  }
  // Rows withheld from the product never resolve, so no route can name them.
  for (const entry of xstocks.filter(isWithheldFromProduct)) {
    assert.deepEqual(resolveReviewedRoute({ mint: entry.mint }, "meteora_dlmm"), {
      status: "unavailable", reason: "unknown_asset",
    });
  }
});

test("route policy rejects malformed, unknown, and disabled requests", () => {
  assert.deepEqual(resolveReviewedRoute({ ticker: "NVDA", mint: NVDA_MINT }, "raydium_clmm"), {
    status: "unavailable", reason: "invalid_input",
  });
  assert.deepEqual(resolveReviewedRoute({ mint: NVDA_MINT + "x" }, "raydium_clmm"), {
    status: "unavailable", reason: "unknown_asset",
  });
  assert.deepEqual(resolveReviewedRoute({ ticker: "NVDA" }, "jupiter_metis_build"), {
    status: "unavailable", reason: "invalid_input",
  });
  assert.deepEqual(resolveReviewedRoute({ ticker: "NVDA" }, "meteora_dlmm", { inspectionDisabled: true }), {
    status: "unavailable", reason: "disabled_by_policy",
  });
});

test("getter and throwing Proxy input return typed invalid_input without RPC or exception", () => {
  const getter = Object.defineProperty({}, "ticker", {
    enumerable: true,
    get() { throw new Error("getter must never run"); },
  });
  const throwingProxy = new Proxy({}, {
    getPrototypeOf() { throw new Error("prototype trap"); },
  });
  const descriptorProxy = new Proxy({ ticker: "NVDA" }, {
    getOwnPropertyDescriptor() { throw new Error("descriptor trap"); },
  });
  for (const input of [getter, throwingProxy, descriptorProxy]) {
    assert.deepEqual(resolveReviewedRoute(input, "raydium_clmm"), {
      status: "unavailable", reason: "invalid_input",
    });
  }
});
