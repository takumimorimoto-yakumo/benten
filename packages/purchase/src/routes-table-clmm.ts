/**
 * The Raydium CLMM part of the purchase routes table: products bought
 * through one pinned CLMM xStock/USDC pool each, merged into
 * `PRODUCT_ROUTES` (`routes-table.ts`) with `dex: "raydium-clmm"`.
 *
 * The entries between the generated markers are written by
 * `scripts/generate-clmm-routes.mjs`, which read each pool read-only on
 * mainnet and kept only pools whose token A is the registry mint (Token-2022,
 * 8 decimals, Scaled UI Amount, no transfer fee or hook) and token B USDC,
 * whose vaults are the program's vault addresses, whose state the quote
 * models (fee on the input, no dynamic fee), and whose 2 and 10 USDC quotes
 * both fill with a price impact of at most 3%. Unlisted-company tokens are
 * refused by the generator. The browser and the server read every pool again
 * before quoting and stop when it no longer carries these pins.
 *
 * Besides the pool, each entry pins the accounts the `swap_v2` instruction
 * names that the audit cannot derive from the pool address alone: the config,
 * the observation account and both vaults, and the tick spacing that tick
 * array addresses depend on.
 */

import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@benten/solana";

import type { ProductRoute, ProductTicker } from "./routes-table";

// <generated-tickers>
export const CLMM_PRODUCT_TICKERS = ["COIN", "AMZN", "MSFT", "QQQ", "GLD", "BRK.B", "AVGO", "MCD", "KO", "INTC", "UNH", "XOM", "PLTR", "GME", "STRC", "WMT"] as const;
// </generated-tickers>
export type ClmmProductTicker = (typeof CLMM_PRODUCT_TICKERS)[number];

/** Accounts of a pinned CLMM pool that its `swap_v2` names. */
export interface ClmmPoolPins {
  readonly ammConfig: PublicKey;
  readonly observation: PublicKey;
  /** The pool's token A vault (the product). */
  readonly productVault: PublicKey;
  /** The pool's token B vault (USDC). */
  readonly usdcVault: PublicKey;
  readonly tickSpacing: number;
}

export interface ClmmProductRoute extends ProductRoute {
  readonly dex: "raydium-clmm";
  readonly clmm: ClmmPoolPins;
}

const PRODUCT_DECIMALS = 8;

function clmmRoute(ticker: ClmmProductTicker, symbol: string, productMint: string, pool: string, pins: { ammConfig: string; observation: string; productVault: string; usdcVault: string; tickSpacing: number }): ClmmProductRoute {
  return Object.freeze({
    ticker: ticker as ProductTicker,
    symbol,
    productMint: new PublicKey(productMint),
    pool: new PublicKey(pool),
    // Token A of the pool is the product and token B USDC: the same order as the DLMM routes' X and Y.
    orientation: "product_x_usdc_y",
    decimals: PRODUCT_DECIMALS,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    dex: "raydium-clmm",
    clmm: Object.freeze({
      ammConfig: new PublicKey(pins.ammConfig),
      observation: new PublicKey(pins.observation),
      productVault: new PublicKey(pins.productVault),
      usdcVault: new PublicKey(pins.usdcVault),
      tickSpacing: pins.tickSpacing,
    }),
  });
}

export const CLMM_PRODUCT_ROUTES: Readonly<Record<ClmmProductTicker, ClmmProductRoute>> = Object.freeze({
  // <generated-routes>
  "COIN": clmmRoute("COIN", "COINx", "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu", "w7SGmPeXoMCsjvXqgsAmUn56uypyDsjAtsxeVkaiqxa", {
    ammConfig: "DQeN7dZyQvXKT7YwmgqyuC7AYFkwMoP7RwtucsDEdfYZ", observation: "CwMBmZXbBo7KKR6wCbDHBfh9QGTi2sQzTDk2Dn8VqSv",
    productVault: "8iYt6azJsp6z6zz3scVomSgiJ25MogcFLTLperGnobFB", usdcVault: "4oXbG42T4NYJz4oBEBnpVoXauSkdrzNTM16CXsepXyhJ", tickSpacing: 60,
  }),
  "AMZN": clmmRoute("AMZN", "AMZNx", "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", "6m5aXAve4uh6Kt4ytKyCLWNMjd8PYP5vujwNCtycrUiD", {
    ammConfig: "E64NGkDLLCdQ2yFNPcavaKptrEgmiQaNykUuLC1Qgwyp", observation: "8TXPxJtpNwfeuuLDMYG3sPajd7MqBcHtFXcMTVejEj7Z",
    productVault: "DWQnWAPHQWhUoM4NXwyyf4N2xQ1PECxHAQ88t3LL9pTF", usdcVault: "5BSujhdVKPx3QE361BJGzHqbDF3B4sNHy8cMRJGD5x6g", tickSpacing: 60,
  }),
  "MSFT": clmmRoute("MSFT", "MSFTx", "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", "D6bRhQUcR9B7bPbbqgxpE17MjyUjBtr8hHQCcJoHrrv1", {
    ammConfig: "DrdecJVzkaRsf1TQu1g7iFncaokikVTHqpzPjenjRySY", observation: "5gmNT8ZMydTA7yFyXWXAUCvKJaKDvY3s6JSZQ63wmVe6",
    productVault: "Djw4PRPBZ9BzYjCBokJRkiVH7QoMujjYvLqgx2CACTX", usdcVault: "EcptmyX43M5M6PF7inLbwRuLKNKZnKLfp26G9TMosj4M", tickSpacing: 10,
  }),
  "QQQ": clmmRoute("QQQ", "QQQx", "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", "GMjGLWzvK75LPetrgAmdeXnvxc4fUuQPwJxeQqTDU1aG", {
    ammConfig: "DrdecJVzkaRsf1TQu1g7iFncaokikVTHqpzPjenjRySY", observation: "4YcxTrxoZShRUwb45DKXnXFS8NNTdqxbXv7SEtVmEi95",
    productVault: "4RWQkhLbmgQ4xeQyY2iqAqiEFkRNWB5gdChZkXaFUVxY", usdcVault: "D3JT9Uam9DAuBysFvpYDTxQqLuTxRrVwuj5je1XCLLU7", tickSpacing: 10,
  }),
  "GLD": clmmRoute("GLD", "GLDx", "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re", "78ReVNMLGRWmjtf2HmBoHUe2pRcsctXTTbxJnbhchyze", {
    ammConfig: "DrdecJVzkaRsf1TQu1g7iFncaokikVTHqpzPjenjRySY", observation: "DQCHc73k3EWdPZJAERRVRnwuuwB5xNUwzDSSkK9w6wnW",
    productVault: "Qf2BrMGurzSMiqeXNKQdG6XzbWeWG9FCP7tndHNikNj", usdcVault: "8BECXqsvkZcWD1MpzYV4p7NXD8xu5ZzquQ52NNGFqUsm", tickSpacing: 10,
  }),
  "BRK.B": clmmRoute("BRK.B", "BRK.Bx", "Xs6B6zawENwAbWVi7w92rjazLuAr5Az59qgWKcNb45x", "B4UdLnvzCrnfRndLdgGTYZjcKTDsaFKB54cmKb2GoSne", {
    ammConfig: "E64NGkDLLCdQ2yFNPcavaKptrEgmiQaNykUuLC1Qgwyp", observation: "AGJcjXbG1neCyzNN4WqRu72NCVeAhBYx5dxCB8aJna4n",
    productVault: "AVNjMHaSNiA7v7FdhDCQwbCynVMSfw6q82p2Ls9beWRZ", usdcVault: "Gg5qCmVHd8S4oEoBHVAG8zK2ePsAmhkLhYVQqLT9vvpS", tickSpacing: 60,
  }),
  "AVGO": clmmRoute("AVGO", "AVGOx", "XsgSaSvNSqLTtFuyWPBhK9196Xb9Bbdyjj4fH3cPJGo", "EkpbWmPzrzFsv2xkJRdvWs61aRuDBVdrJK7WQmctBFnB", {
    ammConfig: "A1BBtTYJd4i3xU8D6Tc2FzU6ZN4oXZWXKZnCxwbHXr8x", observation: "9XJwL5wrfzyYqfNKkSGqCivWdcXZsS8p2Tpebmzoj1VQ",
    productVault: "EYzM5dtsr1ccyAmHud3mKrB8ndRP4aprzXSnPZ9Kmsga", usdcVault: "DCAaJgog8wYZSdztuVbYfaj9dcyduLgTsDjdDyXtu94P", tickSpacing: 120,
  }),
  "MCD": clmmRoute("MCD", "MCDx", "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2", "5MGvNj9RNKNmzwp1LtZuQkZonEYtKJ3JuiyNQEUU2DsF", {
    ammConfig: "A1BBtTYJd4i3xU8D6Tc2FzU6ZN4oXZWXKZnCxwbHXr8x", observation: "GcCWS9Mp77x9VPvwnr1p6Q9AaMwfpud91ac81vpVJMR6",
    productVault: "DGM1Ve9TaD3yQaXhfkj6FCtk46hv1TvGGsbncXA6EfN4", usdcVault: "2njj6WrCb558AoVBa2WnSPi7HM9Myb7qENejtwW5TjYb", tickSpacing: 120,
  }),
  "KO": clmmRoute("KO", "KOx", "XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ", "7HNwUP5rSUo9GfdDthJn4UCdw2Px6h2aprSedD7r7J3C", {
    ammConfig: "A1BBtTYJd4i3xU8D6Tc2FzU6ZN4oXZWXKZnCxwbHXr8x", observation: "BGUeJKYg3GcpCm1XJsqo23Pf3nBC8WSnFLHJFTGusrNq",
    productVault: "9U6aKhHYFB3ViSPqQzKbkUPFg7hYahLk6njnzy15Smf6", usdcVault: "4Rq5cbWuaEHfzzwmbpuvkF4CbmWETXvo11aaaZm7dcQe", tickSpacing: 120,
  }),
  "INTC": clmmRoute("INTC", "INTCx", "XshPgPdXFRWB8tP1j82rebb2Q9rPgGX37RuqzohmArM", "6KoZB86BFDk6TZbB4CTBoAA8PPbpmEwSWFjCyfkt1Uw4", {
    ammConfig: "A1BBtTYJd4i3xU8D6Tc2FzU6ZN4oXZWXKZnCxwbHXr8x", observation: "3Jp4jFMqQHqtUeRBajFS4mjU1RAPAAwacVv3pBJukLJE",
    productVault: "AoJ9HfBsZo1kCfuEboRHskbMhRoNQkKesWgB7wUxHHLu", usdcVault: "FamjSiGHT4eHzV3JjcWtqY1PDuk4Z1UrjQBwXcPtnzLN", tickSpacing: 120,
  }),
  "UNH": clmmRoute("UNH", "UNHx", "XszvaiXGPwvk2nwb3o9C1CX4K6zH8sez11E6uyup6fe", "5xm6QUDxRyMg3Gx59CxXB6VZnRKs4bVu44DS6DzZr3Bp", {
    ammConfig: "A1BBtTYJd4i3xU8D6Tc2FzU6ZN4oXZWXKZnCxwbHXr8x", observation: "9NL73QkUm2gJvXsvf1KMFtrtbrCejyFhShacgR7GKhNR",
    productVault: "8e2u6KEhfv2WEvKdomfqfLrMRTq1hPe7VVGUJBb62Z9x", usdcVault: "6pXAYfwwd2zQAsPZyPh68AFGG3PGBEjrpoaDyZiQfSjX", tickSpacing: 120,
  }),
  "XOM": clmmRoute("XOM", "XOMx", "XsaHND8sHyfMfsWPj6kSdd5VwvCayZvjYgKmmcNL5qh", "H3qMpQnUiod9qfEMZL84nvoYd2pXrscHA6NQAb6icwxD", {
    ammConfig: "A1BBtTYJd4i3xU8D6Tc2FzU6ZN4oXZWXKZnCxwbHXr8x", observation: "BnTM1i55mQojNAUzEQXtpEKfnNgnjJT9cHXoeLuX9hdj",
    productVault: "A7vkEBbotuinZog16BtLwTWFewsDsyo4xeiJw5ZxMxE5", usdcVault: "5LNzX13uRPwG5yaq4V6XNuJ3LJyLZ9QSAbActDTCS8m2", tickSpacing: 120,
  }),
  "PLTR": clmmRoute("PLTR", "PLTRx", "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4", "2EbY6YYKdQY9mmn9voiadgMcEnmZ5oe7qkcFVmywNrrE", {
    ammConfig: "A1BBtTYJd4i3xU8D6Tc2FzU6ZN4oXZWXKZnCxwbHXr8x", observation: "FYcPz82cJ27rYrCcenRjcvskri39vVA6UKA38G1fukLG",
    productVault: "6etZtUhQHbscj1q7CLV7fo8BV3p9RzNWZGXAfyP8DRSo", usdcVault: "Ciy46zKeedFpJozasAapMSPzsjo3QmccpcADeefqQdps", tickSpacing: 120,
  }),
  "GME": clmmRoute("GME", "GMEx", "Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc", "1jAkn9tRpK9R72iW7MHYx6cF9nEkYnD4FYSxMYEDePL", {
    ammConfig: "E64NGkDLLCdQ2yFNPcavaKptrEgmiQaNykUuLC1Qgwyp", observation: "DoCyUFqUmBhfZJHfU8SzrkaeKpSrnXp9WgfC4VooaAfA",
    productVault: "HrjFcQJ9SjPKcwLQ4mtoDho8MGdMEqyuZMNhGb7F9fu1", usdcVault: "81mQ5WvtfccWinWBgDFuUeHyXz1HRtMCZ7G8GSqweFzj", tickSpacing: 60,
  }),
  "STRC": clmmRoute("STRC", "STRCx", "Xs78JED6PFZxWc2wCEPspZW9kL3Se5J7L5TChKgsidH", "DU9dgBU6Yh2JjsYcjtRY21G14dhQxn6Xm5PT949Sa4tA", {
    ammConfig: "DrdecJVzkaRsf1TQu1g7iFncaokikVTHqpzPjenjRySY", observation: "5v87C3LUxSKf2JzdLEB3chXokAnQGrAsQ3ZnU5FogufF",
    productVault: "CkcDtniHJTCifvDFEb1dTJmnSHDwseFGUDx8eBHqn8NE", usdcVault: "9thvy3baPRwCfg7q4Boei8ug4Y5Yj5hnhykJ2Q8PHVcB", tickSpacing: 10,
  }),
  "WMT": clmmRoute("WMT", "WMTx", "Xs151QeqTCiuKtinzfRATnUESM2xTU6V9Wy8Vy538ci", "36m7kUFCFheNBnvXDSvgCMt5c27VbUbhQnugCReFhet7", {
    ammConfig: "A1BBtTYJd4i3xU8D6Tc2FzU6ZN4oXZWXKZnCxwbHXr8x", observation: "CwS2BP8LBrYPXqV1QKXEAhk5NFxwvNSQ1jYdao17qY4h",
    productVault: "EMtzSF6T3VyY7W2do5aqsYQUeeBhevkekUbeD1PG5tr5", usdcVault: "Fkg9zqjUybVGyNZ2VYHyCxFeM4pxirJXp7z7XMivVSGy", tickSpacing: 120,
  }),
  // </generated-routes>
} as Record<ClmmProductTicker, ClmmProductRoute>);

/** The CLMM pins of a table ticker, or `null` when the product is not bought through a CLMM pool. */
export function clmmPins(ticker: string): ClmmPoolPins | null {
  if (!(CLMM_PRODUCT_TICKERS as readonly string[]).includes(ticker)) return null;
  return (CLMM_PRODUCT_ROUTES as Readonly<Record<string, ClmmProductRoute>>)[ticker].clmm;
}
