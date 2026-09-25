/**
 * Browser-side read access to Solana for the purchase panel, only through the
 * same-origin read-only relay. HTTP polling only: no WebSocket subscription is
 * opened, and the web3.js built-in retry on HTTP 429 is disabled so the panel
 * decides (and shows) what happens when the relay is busy.
 *
 * Nothing here signs or submits anything; the relay would reject it anyway.
 */

import { Connection, PublicKey, type FetchFn } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@benten/solana";

import { PURCHASE_CONFIG } from "./config";
import { decodeMint, effectiveMultiplier, type MintInfo } from "./mint-info";
import type { MultiplierReading } from "./purchase-machine";
import type { FinalizedTransactionMeta, TokenBalanceEntry } from "./result";
import { PAY_TOKENS, USDC_MINT, type PayTokenId } from "./route";
import { DEFAULT_PRODUCT, productRoute, SELL_ROUTE, type ProductTicker } from "./routes-table";
import { associatedTokenAddress } from "./tx-allowlist";

export type RelayFailure = "rateLimited" | "unavailable";

/** A relay HTTP failure, recorded by the connection's fetch so callers can tell busy from unavailable. */
export interface RelayConnection {
  connection: Connection;
  lastFailure(): RelayFailure | null;
}

/** Standard SPL / Token-2022 token account layout: mint at 0, raw amount (u64 LE) at 64. */
const TOKEN_ACCOUNT_MINT_OFFSET = 0;
const TOKEN_ACCOUNT_AMOUNT_OFFSET = 64;
const PUBLIC_KEY_BYTES = 32;
const U64_BYTES = 8;

export function createRelayConnection(): RelayConnection {
  let failure: RelayFailure | null = null;
  const fetchThroughRelay: FetchFn = async (input, init) => {
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      failure = "unavailable";
      throw error;
    }
    if (response.status === 429) failure = "rateLimited";
    else if (!response.ok) failure = "unavailable";
    return response;
  };
  // Built lazily in the browser so server rendering never needs `window`.
  const connection = new Connection(`${window.location.origin}${PURCHASE_CONFIG.rpcRelayPath}`, {
    commitment: PURCHASE_CONFIG.readCommitment,
    disableRetryOnRateLimit: true,
    fetch: fetchThroughRelay,
  });
  return { connection, lastFailure: () => failure };
}

/** Classify a thrown error from a relay read: busy (429), unavailable (other HTTP / network), or not a relay failure. */
export function relayFailureOf(error: unknown, relay: RelayConnection): RelayFailure | null {
  const recorded = relay.lastFailure();
  if (recorded) return recorded;
  return error instanceof TypeError ? "unavailable" : null;
}

/** Read a token account's raw amount after checking its program owner and mint. `null` for anything unexpected. */
export function tokenAccountAmount(data: Uint8Array, mint: PublicKey): bigint | null {
  if (data.byteLength < TOKEN_ACCOUNT_AMOUNT_OFFSET + U64_BYTES) return null;
  const accountMint = data.subarray(TOKEN_ACCOUNT_MINT_OFFSET, TOKEN_ACCOUNT_MINT_OFFSET + PUBLIC_KEY_BYTES);
  if (!mint.toBytes().every((byte, index) => byte === accountMint[index])) return null;
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(TOKEN_ACCOUNT_AMOUNT_OFFSET, true);
}

/** The wallet's USDC balance in raw units; a missing token account is a zero balance. */
export async function readUsdcBalance(relay: RelayConnection, walletAddress: string): Promise<bigint> {
  const owner = new PublicKey(walletAddress);
  const account = await relay.connection.getAccountInfo(new PublicKey(associatedTokenAddress(owner, USDC_MINT, TOKEN_PROGRAM_ID)));
  if (!account) return 0n;
  if (!account.owner.equals(TOKEN_PROGRAM_ID)) throw new Error("USDC token account has an unexpected owner program");
  const amount = tokenAccountAmount(account.data, USDC_MINT);
  if (amount === null) throw new Error("USDC token account could not be read");
  return amount;
}

/**
 * The wallet's balance of the selected pay token, raw units: lamports for
 * native SOL (the account's own balance), otherwise the associated token
 * account's amount (a missing account is a zero balance).
 */
export async function readPayBalance(relay: RelayConnection, walletAddress: string, payToken: PayTokenId): Promise<bigint> {
  if (payToken === "USDC") return readUsdcBalance(relay, walletAddress);
  const owner = new PublicKey(walletAddress);
  const route = PAY_TOKENS[payToken];
  if (route.native) {
    const account = await relay.connection.getAccountInfo(owner);
    return account ? BigInt(account.lamports) : 0n;
  }
  const account = await relay.connection.getAccountInfo(new PublicKey(associatedTokenAddress(owner, route.mint, TOKEN_PROGRAM_ID)));
  if (!account) return 0n;
  if (!account.owner.equals(TOKEN_PROGRAM_ID)) throw new Error(`${route.symbol} token account has an unexpected owner program`);
  const amount = tokenAccountAmount(account.data, route.mint);
  if (amount === null) throw new Error(`${route.symbol} token account could not be read`);
  return amount;
}

/**
 * The wallet's NVDAx balance (the sale route, `SELL_ROUTE`) in raw units (Token-2022 associated token
 * account; a missing account is a zero balance). Raw units of the mint, not
 * the Scaled UI display amount.
 */
export async function readNvdaxBalance(relay: RelayConnection, walletAddress: string): Promise<bigint> {
  const owner = new PublicKey(walletAddress);
  const account = await relay.connection.getAccountInfo(new PublicKey(associatedTokenAddress(owner, SELL_ROUTE.productMint, SELL_ROUTE.tokenProgram)));
  if (!account) return 0n;
  if (!account.owner.equals(SELL_ROUTE.tokenProgram)) throw new Error("NVDAx token account has an unexpected owner program");
  const amount = tokenAccountAmount(account.data, SELL_ROUTE.productMint);
  if (amount === null) throw new Error("NVDAx token account could not be read");
  return amount;
}

/** Read a pay token's mint. `null` when it is missing or not owned by the legacy SPL Token program. */
export async function readPayMint(relay: RelayConnection, payToken: PayTokenId): Promise<MintInfo | null> {
  const account = await relay.connection.getAccountInfo(PAY_TOKENS[payToken].mint);
  if (!account || !account.owner.equals(TOKEN_PROGRAM_ID)) return null;
  return decodeMint(account.data);
}

/** `nvdax` is the product mint of the route read (named for the first product). */
export interface RouteMints {
  usdc: MintInfo;
  nvdax: MintInfo;
}

/**
 * Read both mints of a product's route (default NVDA): USDC and the product
 * mint from the routes table. `null` when either is missing or owned by a
 * token program other than the table's. The product mint's Scaled UI Amount
 * extension, if any, is decoded from the account read here.
 */
export async function readRouteMints(relay: RelayConnection, product: ProductTicker = DEFAULT_PRODUCT): Promise<RouteMints | null> {
  const route = productRoute(product);
  const [usdc, nvdax] = await relay.connection.getMultipleAccountsInfo([USDC_MINT, route.productMint]);
  if (!usdc || !nvdax || !usdc.owner.equals(TOKEN_PROGRAM_ID) || !nvdax.owner.equals(route.tokenProgram)) return null;
  const usdcInfo = decodeMint(usdc.data);
  const nvdaxInfo = decodeMint(nvdax.data);
  return usdcInfo && nvdaxInfo ? { usdc: usdcInfo, nvdax: nvdaxInfo } : null;
}

/** A product's display multiplier in effect now, or `null` when the extension is absent or unreadable. */
export function multiplierReading(mint: MintInfo, now: number): MultiplierReading | null {
  return mint.scaledUiAmount ? { value: effectiveMultiplier(mint.scaledUiAmount, now), readAt: now } : null;
}

/** Re-read a product's multiplier (result time; default NVDA). A failed read is not fatal: amounts fall back to raw units. */
export async function readNvdaxMultiplier(relay: RelayConnection, now: () => number, product: ProductTicker = DEFAULT_PRODUCT): Promise<MultiplierReading | null> {
  try {
    const mints = await readRouteMints(relay, product);
    return mints ? multiplierReading(mints.nvdax, now()) : null;
  } catch {
    return null;
  }
}

export interface SignatureStatusRead {
  confirmationStatus: "processed" | "confirmed" | "finalized" | null;
  err: unknown;
}

export interface PurchaseRpc {
  signatureStatus(signature: string, searchTransactionHistory: boolean): Promise<SignatureStatusRead | null>;
  blockHeight(): Promise<number>;
  finalizedTransactionMeta(signature: string): Promise<FinalizedTransactionMeta | null>;
}

/** The tracking reads over the relay. */
export function relayPurchaseRpc(relay: RelayConnection): PurchaseRpc {
  return {
    async signatureStatus(signature, searchTransactionHistory) {
      const response = await relay.connection.getSignatureStatuses([signature], { searchTransactionHistory });
      const value = response.value[0];
      return value ? { confirmationStatus: value.confirmationStatus ?? null, err: value.err } : null;
    },
    blockHeight: () => relay.connection.getBlockHeight(PURCHASE_CONFIG.readCommitment),
    finalizedTransactionMeta: (signature) => readFinalizedTransactionMeta(relay.connection.rpcEndpoint, signature),
  };
}

/** A JSON-RPC error answered for a read (for example -32015, an unsupported transaction version). */
export class RelayRpcError extends Error {
  constructor(readonly code: number) {
    super(`relay JSON-RPC error ${code}`);
    this.name = "RelayRpcError";
  }
}

const RAW_TOKEN_AMOUNT = /^\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One token balance entry, keeping only the fields the result needs. `undefined` when malformed. */
function tokenBalanceEntry(value: unknown): TokenBalanceEntry | undefined {
  if (!isRecord(value) || !Number.isInteger(value.accountIndex) || typeof value.mint !== "string" || !isRecord(value.uiTokenAmount)) return undefined;
  const amount = value.uiTokenAmount.amount;
  if (typeof amount !== "string" || !RAW_TOKEN_AMOUNT.test(amount)) return undefined;
  if (value.owner !== undefined && value.owner !== null && typeof value.owner !== "string") return undefined;
  return { accountIndex: value.accountIndex as number, mint: value.mint, owner: (value.owner as string | null | undefined) ?? null, uiTokenAmount: { amount } };
}

/** Lamport balances as a list of safe integers; `null` when absent or malformed (never fatal: only the SOL paid line needs them). */
function lamportBalances(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.every((entry) => Number.isSafeInteger(entry) && (entry as number) >= 0)) return null;
  return value as number[];
}

function tokenBalances(value: unknown): TokenBalanceEntry[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw new Error("token balances are not a list");
  return value.map((entry) => {
    const parsed = tokenBalanceEntry(entry);
    if (!parsed) throw new Error("token balance entry is malformed");
    return parsed;
  });
}

/**
 * Read the finalized transaction's status meta with one `getTransaction`
 * call through the relay. The transaction itself is requested as base64 and
 * never parsed, so the read works for every message version up to
 * `maxSupportedTransactionVersion` without depending on a client library's
 * message decoder; only `meta.err` and the pre/post token balances are
 * taken, strictly. `null` when the transaction is not (yet) available.
 */
export async function readFinalizedTransactionMeta(endpoint: string, signature: string, fetchImpl: typeof fetch = fetch): Promise<FinalizedTransactionMeta | null> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { commitment: "finalized", encoding: "base64", maxSupportedTransactionVersion: PURCHASE_CONFIG.maxSupportedTransactionVersion }],
    }),
  });
  if (!response.ok) throw new Error(`relay HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error("relay answered a non-object");
  if (isRecord(body.error)) throw new RelayRpcError(typeof body.error.code === "number" ? body.error.code : 0);
  const result = body.result;
  if (result === null || result === undefined) return null;
  if (!isRecord(result)) throw new Error("getTransaction result is malformed");
  const meta = result.meta;
  if (meta === null || meta === undefined) return null;
  if (!isRecord(meta) || !("err" in meta)) throw new Error("getTransaction meta is malformed");
  return {
    err: meta.err,
    preTokenBalances: tokenBalances(meta.preTokenBalances),
    postTokenBalances: tokenBalances(meta.postTokenBalances),
    preBalances: lamportBalances(meta.preBalances),
    postBalances: lamportBalances(meta.postBalances),
  };
}
