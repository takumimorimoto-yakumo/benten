/**
 * Isomorphic, read-only Solana reader for xStocks token balances.
 *
 * SECURITY INVARIANTS (do not weaken without a security review):
 *  1. This module never imports or calls any signing/sending API. The only
 *     RPC method it issues is `getParsedTokenAccountsByOwner`, which is
 *     read-only.
 *  2. It reads no environment variables and constructs no `Connection` of
 *     its own. The caller owns the RPC endpoint choice and passes an
 *     already-built `Connection`.
 *  3. It returns only mints present in the `@benten/registry` allowlist.
 *     Any other token account the wallet holds is dropped, never echoed
 *     back to the caller.
 *
 * This module is safe to evaluate in a browser: it holds no credentials and
 * touches only public RPC data. Keep it that way.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { productXStocks } from "@benten/registry";
import { TOKEN_2022_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from "./supported-products.js";
export {
  SUPPORTED_PRODUCTS,
  TOKEN_2022_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESSES,
  supportedProductForMint,
} from "./supported-products.js";
export type { SupportedProduct } from "./supported-products.js";
export { inspectAcquisitionPool, resolveAcquisitionRoute } from "./acquisition-pool.js";
export type { AcquisitionIdentifier, AcquisitionPoolInspection, AcquisitionPoolRoute } from "./acquisition-pool.js";

// Well-known SPL token program IDs. These are fixed protocol constants, not
// user input, so hardcoding them here does not bypass the allowlist guard
// (the guard is about ticker/mint/address input, not protocol program ids).
export const TOKEN_PROGRAM_ID = new PublicKey(TOKEN_PROGRAM_ADDRESS);
export const TOKEN_2022_PROGRAM_ID = new PublicKey(TOKEN_2022_PROGRAM_ADDRESS);
// https://solana.com/docs/tokens/basics/create-token-account
// ATA PDA seeds are wallet, token program, mint under this fixed program.
// Program ID: https://solana.com/docs/tools/kora/guides/x402
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// Withheld registry rows (SPCX, VCX) are never reported as holdings.
const mintIndex = new Map(productXStocks.map((e) => [e.mint, e]));

/** One xStocks token balance held by a wallet, joined with its registry entry. */
export interface XStockHolding {
  symbol: string;
  ticker: string;
  name: string;
  mint: string;
  amount: number | null;
  decimals: number;
  fundamentals_available: boolean;
}

export interface XStockHoldingsResult {
  holdings: XStockHolding[];
  /** Highest RPC context slot across the queried token programs. */
  slot: number;
}

/**
 * Read the xStocks token balances held by `owner`.
 *
 * Both the legacy SPL Token program and Token-2022 are queried, because an
 * xStocks mint may live under either one. Results are filtered down to the
 * registry allowlist before being returned.
 *
 * Address validation and response enveloping are deliberately NOT done here;
 * they belong to the caller (the MCP tool validates untrusted string input
 * with `isValidSolanaAddress`, the web client only ever passes a connected
 * wallet's own `PublicKey`).
 */
export async function getXStockHoldings(
  connection: Connection,
  owner: PublicKey,
): Promise<XStockHoldingsResult> {
  const [legacy, token2022] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);

  const slot = Math.max(legacy.context.slot, token2022.context.slot);
  const accounts = [...legacy.value, ...token2022.value];

  const holdings: XStockHolding[] = [];
  for (const { account } of accounts) {
    const info = (account.data as { parsed?: { info?: Record<string, unknown> } }).parsed?.info;
    const mint = info?.mint as string | undefined;
    if (!mint) continue;
    const entry = mintIndex.get(mint);
    if (!entry) continue;

    const tokenAmount = info?.tokenAmount as { uiAmount?: number; decimals?: number } | undefined;
    holdings.push({
      symbol: entry.symbol,
      ticker: entry.ticker,
      name: entry.name,
      mint: entry.mint,
      amount: typeof tokenAmount?.uiAmount === "number" ? tokenAmount.uiAmount : null,
      decimals: typeof tokenAmount?.decimals === "number" ? tokenAmount.decimals : entry.decimals,
      fundamentals_available: entry.fundamentals_available,
    });
  }

  return { holdings, slot };
}
