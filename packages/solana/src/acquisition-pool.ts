/**
 * Fail-closed, read-only verification of explicitly reviewed secondary-market
 * xStock pools. This module does not quote, construct, sign, or send a swap.
 * Pool IDs are candidates, not proof of current liquidity; every use must
 * re-read the pool, mint, and vault accounts from one Solana RPC observation.
 *
 * Raydium CLMM PoolState layout and PDA seeds are from the Apache-2.0 onchain
 * program: https://github.com/raydium-io/raydium-clmm/blob/master/programs/amm/src/states/pool.rs
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "./index.js";
import { MAINNET_GENESIS, resolveReviewedRoute, USDC_MINT } from "./venues/route-policy.js";

const usdcMint = new PublicKey(USDC_MINT);
const POOL_DISCRIMINATOR = Uint8Array.from([0xf7, 0xed, 0xe3, 0xf5, 0xd7, 0xc3, 0xde, 0x46]);
const POOL_STATE_LENGTH = 1544;
const POOL_SEED = new TextEncoder().encode("pool");
const VAULT_SEED = new TextEncoder().encode("pool_vault");

export interface AcquisitionPoolRoute {
  ticker: string;
  symbol: string;
  xstockMint: string;
  usdcMint: string;
  poolId: string;
  programId: string;
  sourceUrl: string;
}

export type AcquisitionIdentifier = { ticker: string; mint?: never } | { mint: string; ticker?: never };

export type AcquisitionPoolInspection =
  | { status: "unavailable"; reason: "invalid_input" | "unknown_asset" | "no_verified_pool" | "disabled_by_policy" | "wrong_cluster" | "rpc_unavailable" | "pool_verification_failed" }
  | {
      status: "verified_pool";
      /** RPC context slot for all inspected accounts, not quote freshness. */
      slot: number;
      route: AcquisitionPoolRoute;
      xstockVaultRaw: string;
      usdcVaultRaw: string;
      /** Pool verification alone does not imply a safe quote or executable swap. */
      quoteAvailable: false;
      displayAmountBasis: "raw_only";
    };

function vaultPda(pool: PublicKey, mint: PublicKey, program: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([VAULT_SEED, pool.toBytes(), mint.toBytes()], program)[0];
}

export function resolveAcquisitionRoute(input: unknown):
  | { status: "configured"; route: AcquisitionPoolRoute }
  | { status: "unavailable"; reason: "invalid_input" | "unknown_asset" | "no_verified_pool" | "disabled_by_policy" } {
  const resolved = resolveReviewedRoute(input, "raydium_clmm");
  if (resolved.status === "unavailable") return resolved;
  const reviewed = resolved.route;
  return {
    status: "configured",
    route: {
      ticker: reviewed.ticker,
      symbol: reviewed.symbol,
      xstockMint: reviewed.xstockMint,
      usdcMint: reviewed.usdcMint,
      poolId: reviewed.poolId,
      programId: reviewed.programId,
      sourceUrl: reviewed.sourceUrl,
    },
  };
}

function readKey(data: Buffer, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function validMintAccount(data: Buffer, expectedDecimals: number): boolean {
  return data.length >= 82 && data[44] === expectedDecimals && data[45] === 1;
}

function vaultAmount(data: Buffer, mint: PublicKey, pool: PublicKey): bigint | null {
  if (data.length < 165 || data[108] !== 1) return null;
  if (!readKey(data, 0).equals(mint) || !readKey(data, 32).equals(pool)) return null;
  const raw = data.readBigUInt64LE(64);
  return raw > 0n ? raw : null;
}

/** Verify an explicitly reviewed pool candidate using only public Solana RPC. */
export async function inspectAcquisitionPool(
  connection: Connection,
  input: unknown,
): Promise<AcquisitionPoolInspection> {
  const resolved = resolveAcquisitionRoute(input);
  if (resolved.status === "unavailable") return resolved;
  const route = resolved.route;
  const pool = new PublicKey(route.poolId);
  const program = new PublicKey(route.programId);
  const xstock = new PublicKey(route.xstockMint);
  const policy = resolveReviewedRoute(input, "raydium_clmm");
  if (policy.status !== "configured") return { status: "unavailable", reason: "pool_verification_failed" };
  const xVault = vaultPda(pool, xstock, program);
  const uVault = vaultPda(pool, usdcMint, program);
  if (xVault.toBase58() !== policy.route.xstockVault || uVault.toBase58() !== policy.route.usdcVault) {
    return { status: "unavailable", reason: "pool_verification_failed" };
  }
  try {
    if (await connection.getGenesisHash() !== MAINNET_GENESIS) {
      return { status: "unavailable", reason: "wrong_cluster" };
    }
    const observed = await connection.getMultipleAccountsInfoAndContext([pool, xstock, usdcMint, xVault, uVault], "confirmed");
    if (!Number.isSafeInteger(observed.context.slot) || observed.context.slot <= 0) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    const [poolAccount, xMintAccount, uMintAccount, xVaultAccount, uVaultAccount] = observed.value;
    if (!poolAccount || !xMintAccount || !uMintAccount || !xVaultAccount || !uVaultAccount) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    const data = poolAccount.data;
    if (!poolAccount.owner.equals(program) || data.length !== POOL_STATE_LENGTH) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    if (!POOL_DISCRIMINATOR.every((byte, i) => data[i] === byte)) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    const config = readKey(data, 9);
    const mint0 = readKey(data, 73);
    const mint1 = readKey(data, 105);
    const expectedPool = PublicKey.findProgramAddressSync([POOL_SEED, config.toBytes(), mint0.toBytes(), mint1.toBytes()], program)[0];
    if (!expectedPool.equals(pool) || !mint0.equals(xstock) || !mint1.equals(usdcMint)) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    if (!readKey(data, 137).equals(xVault) || !readKey(data, 169).equals(uVault)) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    if (data[233] !== 8 || data[234] !== 6 || data.readUInt16LE(235) === 0 || (data[389] & (1 << 4)) !== 0) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    const liquidity = data.readBigUInt64LE(237) | (data.readBigUInt64LE(245) << 64n);
    if (liquidity === 0n) return { status: "unavailable", reason: "pool_verification_failed" };
    if (!xMintAccount.owner.equals(TOKEN_2022_PROGRAM_ID) || !uMintAccount.owner.equals(TOKEN_PROGRAM_ID)) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    if (!validMintAccount(xMintAccount.data, 8) || !validMintAccount(uMintAccount.data, 6)) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    if (!xVaultAccount.owner.equals(TOKEN_2022_PROGRAM_ID) || !uVaultAccount.owner.equals(TOKEN_PROGRAM_ID)) {
      return { status: "unavailable", reason: "pool_verification_failed" };
    }
    const xRaw = vaultAmount(xVaultAccount.data, xstock, pool);
    const uRaw = vaultAmount(uVaultAccount.data, usdcMint, pool);
    if (xRaw === null || uRaw === null) return { status: "unavailable", reason: "pool_verification_failed" };
    return {
      status: "verified_pool",
      route,
      slot: observed.context.slot,
      xstockVaultRaw: xRaw.toString(),
      usdcVaultRaw: uRaw.toString(),
      quoteAvailable: false,
      displayAmountBasis: "raw_only",
    };
  } catch {
    return { status: "unavailable", reason: "rpc_unavailable" };
  }
}
