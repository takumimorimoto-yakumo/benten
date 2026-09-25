/**
 * M2 identity inspection only. One caller-injected read-only Connection, one
 * confirmed account batch, no quote, transaction, signing or submission.
 * Meteora DLMM layout offsets were cross-checked against the public IDL/SDK
 * during the dated no-send spike: docs/route-feasibility-2026-09-14.md.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../index.js";
import { inspectAcquisitionPool } from "../acquisition-pool.js";
import {
  MAINNET_GENESIS,
  resolveReviewedRoute,
  type ReviewedRoute,
} from "./route-policy.js";

const METEORA_DISCRIMINATOR = Uint8Array.from([0x21, 0x0b, 0x31, 0x62, 0xb5, 0x65, 0xb1, 0x0d]);

export type RouteObservation =
  | { status: "unavailable"; reason: "invalid_input" | "unknown_asset" | "no_verified_pool" | "disabled_by_policy" | "wrong_cluster" | "rpc_unavailable" | "pool_verification_failed" }
  | {
      status: "verified_identity";
      route: ReviewedRoute;
      /** Confirmed context slot for one account batch, never a quote slot. */
      slot: number;
      xstockVaultRaw: string;
      usdcVaultRaw: string;
      quoteAvailable: false;
      acquisitionReady: false;
      displayAmountBasis: "raw_only";
    };

function key(data: Buffer, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function validMint(data: Buffer, decimals: number): boolean {
  return data.length >= 82 && data[44] === decimals && data[45] === 1;
}

function reserveRaw(data: Buffer, mint: PublicKey, pool: PublicKey): bigint | null {
  if (data.length < 165 || data[108] !== 1) return null;
  if (!key(data, 0).equals(mint) || !key(data, 32).equals(pool)) return null;
  const amount = data.readBigUInt64LE(64);
  return amount > 0n ? amount : null;
}

/** A verified identity remains non-acquisition-ready for all sizes. */
export async function inspectReviewedRoute(
  connection: Connection,
  venue: unknown,
  identifier: unknown,
  options: { inspectionDisabled?: boolean } = {},
): Promise<RouteObservation> {
  const resolved = resolveReviewedRoute(identifier, venue, options);
  if (resolved.status === "unavailable") return resolved;
  const route = resolved.route;
  if (route.venue === "raydium_clmm") {
    const inspected = await inspectAcquisitionPool(connection, identifier);
    if (inspected.status === "unavailable") return inspected;
    if (!Number.isSafeInteger(inspected.slot) || inspected.slot <= 0 ||
        inspected.route.poolId !== route.poolId || inspected.route.programId !== route.programId ||
        inspected.route.xstockMint !== route.xstockMint || inspected.route.usdcMint !== route.usdcMint) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    return {
      status: "verified_identity", route, slot: inspected.slot,
      xstockVaultRaw: inspected.xstockVaultRaw,
      usdcVaultRaw: inspected.usdcVaultRaw,
      quoteAvailable: false, acquisitionReady: false, displayAmountBasis: "raw_only",
    };
  }

  try {
    if (await connection.getGenesisHash() !== MAINNET_GENESIS) {
      return { status: "unavailable", reason: "wrong_cluster" };
    }
  } catch {
    return { status: "unavailable", reason: "rpc_unavailable" };
  }

  const pool = new PublicKey(route.poolId);
  const xstock = new PublicKey(route.xstockMint);
  const usdc = new PublicKey(route.usdcMint);
  const xVault = new PublicKey(route.xstockVault);
  const uVault = new PublicKey(route.usdcVault);
  let observed;
  try {
    observed = await connection.getMultipleAccountsInfoAndContext(
      [pool, xstock, usdc, xVault, uVault], "confirmed",
    );
  } catch {
    return { status: "unavailable", reason: "rpc_unavailable" };
  }
  try {
    if (!Number.isSafeInteger(observed.context.slot) || observed.context.slot <= 0) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    const [poolAccount, xMintAccount, uMintAccount, xVaultAccount, uVaultAccount] = observed.value;
    if (!poolAccount || !xMintAccount || !uMintAccount || !xVaultAccount || !uVaultAccount) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    const data = poolAccount.data;
    if (poolAccount.executable || !poolAccount.owner.equals(new PublicKey(route.programId)) || data.length !== 904 ||
        !METEORA_DISCRIMINATOR.every((byte, index) => data[index] === byte) || data[82] !== 0 ||
        !key(data, 88).equals(xstock) || !key(data, 120).equals(usdc) ||
        !key(data, 152).equals(xVault) || !key(data, 184).equals(uVault)) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    if (!xMintAccount.owner.equals(TOKEN_2022_PROGRAM_ID) || !uMintAccount.owner.equals(TOKEN_PROGRAM_ID) ||
        !validMint(xMintAccount.data, 8) || !validMint(uMintAccount.data, 6) ||
        !xVaultAccount.owner.equals(TOKEN_2022_PROGRAM_ID) || !uVaultAccount.owner.equals(TOKEN_PROGRAM_ID)) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    const xRaw = reserveRaw(xVaultAccount.data, xstock, pool);
    const uRaw = reserveRaw(uVaultAccount.data, usdc, pool);
    if (xRaw === null || uRaw === null) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    return {
      status: "verified_identity", route, slot: observed.context.slot,
      xstockVaultRaw: xRaw.toString(), usdcVaultRaw: uRaw.toString(),
      quoteAvailable: false, acquisitionReady: false, displayAmountBasis: "raw_only",
    };
  } catch {
    return { status: "unavailable", reason: "pool_verification_failed" };
  }
}
