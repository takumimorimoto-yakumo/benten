/**
 * M2's single reviewed-route identity and kill-switch source. These records
 * authorize public-RPC inspection only: neither pool has a verified quote or
 * acquisition capability. Keep this module out of public API/MCP exports.
 */
import { resolveMint, resolveTicker } from "@benten/registry";
import { PublicKey } from "@solana/web3.js";

export const ROUTE_POLICY_REVISION = "m2-2026-09-14-v1";
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const NVDA_XSTOCK_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

export type DirectVenue = "raydium_clmm" | "meteora_dlmm";

export interface ReviewedRoute {
  readonly venue: DirectVenue;
  readonly ticker: "NVDA";
  readonly symbol: string;
  readonly xstockMint: typeof NVDA_XSTOCK_MINT;
  readonly usdcMint: typeof USDC_MINT;
  readonly poolId: string;
  readonly programId: string;
  readonly xstockVault: string;
  readonly usdcVault: string;
  readonly sourceUrl: string;
  readonly policyRevision: typeof ROUTE_POLICY_REVISION;
  readonly inspectionEnabled: boolean;
  readonly quoteAvailable: false;
  readonly acquisitionReady: false;
}

type RouteConfig = Pick<ReviewedRoute, "poolId" | "programId" | "xstockVault" | "usdcVault" | "sourceUrl"> & {
  readonly inspectionEnabled: boolean;
};

const raydiumProgram = new PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
const raydiumPool = new PublicKey("49iMatQtoyabsYAQc8GafVq6aeBFVDxSRH44oiatyyw6");
function raydiumVault(mint: string): string {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("pool_vault"), raydiumPool.toBytes(), new PublicKey(mint).toBytes()],
    raydiumProgram,
  )[0].toBase58();
}

const ROUTES = Object.freeze({
  raydium_clmm: Object.freeze({
    poolId: raydiumPool.toBase58(),
    programId: raydiumProgram.toBase58(),
    xstockVault: raydiumVault(NVDA_XSTOCK_MINT),
    usdcVault: raydiumVault(USDC_MINT),
    sourceUrl: "https://api-v3.raydium.io/pools/info/ids?ids=49iMatQtoyabsYAQc8GafVq6aeBFVDxSRH44oiatyyw6",
    inspectionEnabled: true,
  }),
  meteora_dlmm: Object.freeze({
    poolId: "F4inHs4RQARpASmvLpj45QjGLdkukeGQrtQ22pimVy2a",
    programId: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    xstockVault: "86FWMceL1zy5agA4HxyDAZxRHR86Ky7D6AhDL8VXtvsY",
    usdcVault: "GZj4nNXEZ67eEvbvKzkRc8aSrS2EGH2mu2hmUA3UTeBr",
    sourceUrl: "https://docs.meteora.ag/developer-guides/dlmm",
    inspectionEnabled: true,
  }),
} satisfies Record<DirectVenue, RouteConfig>);

export type RouteResolution =
  | { status: "configured"; route: ReviewedRoute }
  | { status: "unavailable"; reason: "invalid_input" | "unknown_asset" | "no_verified_pool" | "disabled_by_policy" };

/** Resolve an exact allowlisted mint to an observation-only direct-pool record. */
export function resolveReviewedRoute(
  input: unknown,
  venue: unknown,
  options: { inspectionDisabled?: boolean } = {},
): RouteResolution {
  if (venue !== "raydium_clmm" && venue !== "meteora_dlmm") {
    return { status: "unavailable", reason: "invalid_input" };
  }
  if (input === null || typeof input !== "object") {
    return { status: "unavailable", reason: "invalid_input" };
  }
  let selector: "ticker" | "mint";
  let value: unknown;
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      return { status: "unavailable", reason: "invalid_input" };
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length !== 1 || (keys[0] !== "ticker" && keys[0] !== "mint")) {
      return { status: "unavailable", reason: "invalid_input" };
    }
    selector = keys[0];
    const descriptor = Object.getOwnPropertyDescriptor(input, selector);
    if (!descriptor || !("value" in descriptor)) {
      return { status: "unavailable", reason: "invalid_input" };
    }
    value = descriptor.value;
  } catch {
    return { status: "unavailable", reason: "invalid_input" };
  }
  if (typeof value !== "string") return { status: "unavailable", reason: "invalid_input" };
  const entry = selector === "ticker" ? resolveTicker(value) : resolveMint(value);
  if (!entry) return { status: "unavailable", reason: "unknown_asset" };
  if (entry.ticker !== "NVDA" || entry.mint !== NVDA_XSTOCK_MINT) {
    return { status: "unavailable", reason: "no_verified_pool" };
  }
  const config = ROUTES[venue];
  let inspectionDisabled: boolean;
  try { inspectionDisabled = options.inspectionDisabled === true; }
  catch { return { status: "unavailable", reason: "invalid_input" }; }
  if (inspectionDisabled || !config.inspectionEnabled) {
    return { status: "unavailable", reason: "disabled_by_policy" };
  }
  return {
    status: "configured",
    route: {
      venue,
      ticker: "NVDA",
      symbol: entry.symbol,
      xstockMint: NVDA_XSTOCK_MINT,
      usdcMint: USDC_MINT,
      ...config,
      policyRevision: ROUTE_POLICY_REVISION,
      quoteAvailable: false,
      acquisitionReady: false,
    },
  };
}
