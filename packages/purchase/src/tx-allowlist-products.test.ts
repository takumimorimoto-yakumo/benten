/**
 * The audit across the routes table: a purchase of one product passes only
 * with that product's one pinned pool. Every other product's pool, a pool not
 * in the table, or another product's mint fails, for each product, in both
 * the one-leg (USDC) and the two-leg (SOL / SKR) audit.
 */
import { describe, expect, it } from "vitest";
import { ComputeBudgetProgram, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

import { PAY_TOKENS, USDC_MINT } from "./route";
import { PRODUCT_ROUTES, PRODUCT_TICKERS, type ProductTicker } from "./routes-table";
import {
  associatedTokenAddress,
  auditShapeOf,
  auditSwapTransaction,
  auditTwoLegTransaction,
  binArrayAddress,
  derivedPoolAccounts,
  poolAccounts,
  poolBinArrayAddress,
  type AuditExpectation,
  type TwoLegAuditExpectation,
} from "./tx-allowlist";

const PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const USER = new PublicKey(new Uint8Array(32).fill(3));
const UNLISTED_POOL = new PublicKey(new Uint8Array(32).fill(9));
const BLOCKHASH = new PublicKey(new Uint8Array(32).fill(1)).toBase58();

/**
 * Reserve and oracle accounts read back from each pool's `lbPair` on mainnet
 * (read-only, 2026-09-25): independent evidence for the PDA derivations the
 * audit uses for every product.
 */
const OBSERVED: Record<ProductTicker, { reserveX: string; reserveY: string; oracle: string }> = {
  NVDA: { reserveX: "86FWMceL1zy5agA4HxyDAZxRHR86Ky7D6AhDL8VXtvsY", reserveY: "GZj4nNXEZ67eEvbvKzkRc8aSrS2EGH2mu2hmUA3UTeBr", oracle: "AMhrVuCt6Yh98bVFSWHfFnn7L25D8QzzocfCRbQfHhB7" },
  META: { reserveX: "5y4mPK17wFYUK5a8ZgmkKCwp7x6ufxFVVBh78AD3FaeU", reserveY: "8E7er4htv678LMC7U8e5qteWa8BNdz3UipzVzbaemkQ8", oracle: "2fXA73Hco6YcjXaZPDwp4jsUp1HrMfQzVodrq6asgYjE" },
  MSTR: { reserveX: "68NKnY7TBqo5Wp1jR3WUEEr8b5xQTWMrEf6vjhKQxo7j", reserveY: "DwC162xNqDEF1DdkQHM1C57VyFpuW9s2T466HYqCFEyn", oracle: "5rBLpxG49pX6uFS35LXUVDVTHCeSmxT4gFN8mPsR6e7N" },
  GOOGL: { reserveX: "6wtMNvNSHqDWG77DKq4QCM1RTdNU8rKpJGrsQtpwkNQB", reserveY: "7CJYjH4UNZvPyuJ9Uwdp7sRhERXcL9hYvDCuE2Rsup4U", oracle: "EkFrj1JScoM9nb3VDtsvYoawf3wYSfQdfXC2pgSWHvqW" },
  CRCL: { reserveX: "F5gkTb9TqBitWrawpAb82ony4wA9S8oU4JSatbHauTkS", reserveY: "EgR95MhG6FKnkDUvbgEoqLL3WTmxHe1QqXW8Go7HhzMS", oracle: "2esqZnEzvnVAWHCUXKZyParsC4TJxAiRnFFkipGk6EiG" },
  TSLA: { reserveX: "Fb2igyoX7vgWay6C9mrcK6Eq42UrDs2DCXmmYsBkphxd", reserveY: "6wWq6D7CWdSuetdRdhz1HpNZ9NKkwymEUx4E3wrzKc7K", oracle: "2a529zrA4QGfdE3P26kwGjjzZzkZYAApiVbQPSikHdYt" },
  SPY: { reserveX: "f7c1WCa22RVfXbKF7KVxkVZpnyHzdojdriBXhvGDwF2", reserveY: "8q9RAYzVEjeNGY4C4K14yE1DgEZiYi61t4waJyTeuHpM", oracle: "ubLscM8FriNDZFUn5PuYhNGCEqKG4ibCU2318KK5hVR" },
  HOOD: { reserveX: "bQQ91tcWeEXQ2dUDqihhyQ3Hgz64GCCjyDmFkV3rHFx", reserveY: "Hr8KWKywy5Mg2XMy6LfueDDRfoSou8wu5sz7spKw71CV", oracle: "25JXDTmpsUAQbr914ozE4rWjrbvAVWjpNcJmfK6HfnXo" },
};

const INPUT = 2_000_000n;
const MINIMUM = 250_000n;
const BIN = 7n;

function key(pubkey: string | PublicKey, isSigner = false, isWritable = false) {
  return { pubkey: typeof pubkey === "string" ? new PublicKey(pubkey) : pubkey, isSigner, isWritable };
}

function swapData(amountIn: bigint, minimumOut: bigint): Buffer {
  const amounts = Buffer.alloc(16);
  amounts.writeBigUInt64LE(amountIn, 0);
  amounts.writeBigUInt64LE(minimumOut, 8);
  return Buffer.concat([Buffer.from("414b3f4ceb5b5b88", "hex"), amounts, Buffer.from("0200000000000100", "hex")]);
}

function ata(mint: PublicKey, program = TOKEN): string {
  return associatedTokenAddress(USER, mint, program);
}

/** One swap2 instruction's accounts through `pool` with `mintX` as token X, USDC as token Y. */
type SwapShape = { pool: PublicKey; mintX: PublicKey; programX: PublicKey; tokenIn: string; tokenOut: string; mintY?: PublicKey; programY?: PublicKey };

function swap(shape: SwapShape, amountIn: bigint, minimumOut: bigint): TransactionInstruction {
  const mintY = shape.mintY ?? USDC_MINT;
  const programY = shape.programY ?? TOKEN;
  const derived = poolAccounts({ pool: shape.pool, mintX: shape.mintX, mintY, programX: shape.programX, programY });
  return new TransactionInstruction({
    programId: PROGRAM,
    data: swapData(amountIn, minimumOut),
    keys: [
      key(shape.pool, false, true), key(PROGRAM), key(derived.reserveX, false, true), key(derived.reserveY, false, true),
      key(shape.tokenIn, false, true), key(shape.tokenOut, false, true), key(shape.mintX), key(mintY), key(derived.oracle, false, true),
      key(PROGRAM), key(USER, true, false), key(shape.programX), key(programY), key(MEMO), key(derived.eventAuthority), key(PROGRAM),
      key(poolBinArrayAddress(shape.pool, BIN), false, true),
    ],
  });
}

/** The USDC -> product swap of `ticker`'s own route; `pool` / `mint` override one part to build a mismatch. */
function productSwap(ticker: ProductTicker, overrides: { pool?: PublicKey; mint?: PublicKey } = {}, amountIn = INPUT, minimumOut = MINIMUM): TransactionInstruction {
  const route = PRODUCT_ROUTES[ticker];
  const mint = overrides.mint ?? route.productMint;
  return swap({ pool: overrides.pool ?? route.pool, mintX: mint, programX: TOKEN_2022, tokenIn: ata(USDC_MINT), tokenOut: ata(mint, TOKEN_2022) }, amountIn, minimumOut);
}

function createAccount(mint: PublicKey, program = TOKEN): TransactionInstruction {
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [key(USER, true, true), key(ata(mint, program), false, true), key(USER), key(mint), key(SystemProgram.programId), key(program)],
    data: Buffer.from([1]),
  });
}

function wire(instructions: TransactionInstruction[]): Uint8Array {
  const transaction = new Transaction({ feePayer: USER, blockhash: BLOCKHASH, lastValidBlockHeight: 1 }).add(...instructions);
  return Uint8Array.from(transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
}

const LIMIT = () => ComputeBudgetProgram.setComputeUnitLimit({ units: 90_000 });

function audit(product: ProductTicker, instructions: TransactionInstruction[]) {
  const expectation: AuditExpectation = { user: USER.toBase58(), product, inputRaw: INPUT, minimumOutputRaw: MINIMUM, binArrayIndexes: [BIN], hasBitmapExtension: false };
  return auditSwapTransaction(auditShapeOf(wire(instructions)), expectation);
}

/** Another listed product, for the cross-product cases (NVDA's counterpart is META). */
function otherProduct(ticker: ProductTicker): ProductTicker {
  return ticker === "NVDA" ? "META" : "NVDA";
}

describe("product pool derivations", () => {
  it.each([...PRODUCT_TICKERS])("match the accounts read back from the %s pool on mainnet", (ticker) => {
    const derived = derivedPoolAccounts(ticker);
    expect(derived.reserveX).toBe(OBSERVED[ticker].reserveX);
    expect(derived.reserveY).toBe(OBSERVED[ticker].reserveY);
    expect(derived.oracle).toBe(OBSERVED[ticker].oracle);
    expect(binArrayAddress(BIN, ticker)).toBe(poolBinArrayAddress(PRODUCT_ROUTES[ticker].pool, BIN));
  });
});

describe.each([...PRODUCT_TICKERS])("auditSwapTransaction for %s", (ticker) => {
  const route = PRODUCT_ROUTES[ticker];
  const other = otherProduct(ticker);
  const otherRoute = PRODUCT_ROUTES[other];

  it("accepts its own pool, with and without the product token-account creation", () => {
    expect(audit(ticker, [LIMIT(), productSwap(ticker)])).toEqual({ ok: true, createsNvdaxAccount: false, createsUsdcAccount: false });
    expect(audit(ticker, [LIMIT(), createAccount(route.productMint, TOKEN_2022), productSwap(ticker)])).toEqual({ ok: true, createsNvdaxAccount: true, createsUsdcAccount: false });
  });

  it(`rejects a ${ticker} purchase that swaps through another product's route (${other})`, () => {
    expect(audit(ticker, [LIMIT(), productSwap(other)])).toMatchObject({ ok: false, reason: expect.stringMatching(/swap: account 0 is not the expected account/) });
  });

  it(`rejects a ${ticker} purchase whose pool account alone is another product's pool (${other})`, () => {
    expect(audit(ticker, [LIMIT(), productSwap(ticker, { pool: otherRoute.pool })])).toMatchObject({ ok: false });
  });

  it(`rejects a ${ticker} purchase through a pool that is not in the routes table`, () => {
    expect(audit(ticker, [LIMIT(), productSwap(ticker, { pool: UNLISTED_POOL })])).toMatchObject({ ok: false, reason: expect.stringMatching(/account 0 is not the expected account/) });
  });

  it(`rejects a ${ticker} purchase that names another product's mint in its own pool`, () => {
    expect(audit(ticker, [LIMIT(), productSwap(ticker, { mint: otherRoute.productMint })])).toMatchObject({ ok: false });
  });

  it(`rejects creating the token account of another product (${other})`, () => {
    expect(audit(ticker, [LIMIT(), createAccount(otherRoute.productMint, TOKEN_2022), productSwap(ticker)])).toMatchObject({ ok: false, reason: expect.stringMatching(/mint is not part of the route/) });
  });

  it(`rejects its own transaction audited as another product (${other})`, () => {
    expect(audit(other, [LIMIT(), productSwap(ticker)])).toMatchObject({ ok: false });
  });
});

describe("auditSwapTransaction product key", () => {
  it.each(["AMZN", "meta", "METAx", ""])("fails closed for %j, which is not a routes-table key", (product) => {
    expect(audit(product as ProductTicker, [LIMIT(), productSwap("META")])).toEqual({ ok: false, reason: "product has no pinned route" });
  });

  it("defaults to NVDA when no product is named (the original single-route callers)", () => {
    const expectation: AuditExpectation = { user: USER.toBase58(), inputRaw: INPUT, minimumOutputRaw: MINIMUM, binArrayIndexes: [BIN], hasBitmapExtension: false };
    expect(auditSwapTransaction(auditShapeOf(wire([LIMIT(), productSwap("NVDA")])), expectation).ok).toBe(true);
    expect(auditSwapTransaction(auditShapeOf(wire([LIMIT(), productSwap("META")])), expectation).ok).toBe(false);
  });
});

// Two-leg: each pay token's own shape around the second leg. SKR is a compute limit and two swaps;
// SOL also wraps first (its wrapped-SOL account, a transfer and a sync) and closes the wrapped account last.
const SKR = PAY_TOKENS.SKR.mint;
const WSOL = PAY_TOKENS.SOL.mint;
const SKR_IN = 200_000_000n;
const SOL_IN = 10_000_000n;
const USDC_OUT = 1_010_101n;
const USDC_MIN = 1_000_000n;
const OUT = 101_010n;
const OUT_MIN = 100_000n;
const TWO_LEG_LIMIT = () => ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 });

type TwoLegPayToken = "SKR" | "SOL";

interface PayLegShape {
  inputRaw: bigint;
  /** The instructions of the whole transaction, with `second` as the second-leg swap. */
  instructions(second: TransactionInstruction): TransactionInstruction[];
}

const PAY_LEGS: Record<TwoLegPayToken, PayLegShape> = {
  SKR: {
    inputRaw: SKR_IN,
    instructions: (second) => [
      TWO_LEG_LIMIT(),
      swap({ pool: PAY_TOKENS.SKR.leg!.pool, mintX: SKR, programX: TOKEN, tokenIn: ata(SKR), tokenOut: ata(USDC_MINT) }, SKR_IN, USDC_MIN),
      second,
    ],
  },
  SOL: {
    inputRaw: SOL_IN,
    instructions: (second) => [
      TWO_LEG_LIMIT(),
      createAccount(WSOL),
      SystemProgram.transfer({ fromPubkey: USER, toPubkey: new PublicKey(ata(WSOL)), lamports: SOL_IN }),
      new TransactionInstruction({ programId: TOKEN, keys: [key(ata(WSOL), false, true)], data: Buffer.from([17]) }),
      swap({ pool: PAY_TOKENS.SOL.leg!.pool, mintX: WSOL, programX: TOKEN, tokenIn: ata(WSOL), tokenOut: ata(USDC_MINT) }, SOL_IN, USDC_MIN),
      second,
      new TransactionInstruction({ programId: TOKEN, keys: [key(ata(WSOL), false, true), key(USER, false, true), key(USER, true, false)], data: Buffer.from([9]) }),
    ],
  },
};

function twoLegExpectation(product: ProductTicker, payToken: TwoLegPayToken): TwoLegAuditExpectation {
  return {
    user: USER.toBase58(), product, payToken, inputRaw: PAY_LEGS[payToken].inputRaw, usdcOutRaw: USDC_OUT, usdcMinimumRaw: USDC_MIN, outputRaw: OUT, minimumOutputRaw: OUT_MIN,
    firstLeg: { binArrayIndexes: [BIN], hasBitmapExtension: false }, secondLeg: { binArrayIndexes: [BIN], hasBitmapExtension: false },
  };
}

function twoLegAudit(product: ProductTicker, second: TransactionInstruction, payToken: TwoLegPayToken = "SKR") {
  return auditTwoLegTransaction(auditShapeOf(wire(PAY_LEGS[payToken].instructions(second))), twoLegExpectation(product, payToken));
}

const TWO_LEG_CASES = PRODUCT_TICKERS.flatMap((ticker) => (["SKR", "SOL"] as const).map((payToken) => [ticker, payToken] as const));

describe.each(TWO_LEG_CASES)("auditTwoLegTransaction for %s paid with %s", (ticker, payToken) => {
  const other = otherProduct(ticker);

  it("accepts the product's own pool as the second leg", () => {
    expect(twoLegAudit(ticker, productSwap(ticker, {}, USDC_MIN, OUT_MIN), payToken)).toEqual({ ok: true, createsNvdaxAccount: false, createsUsdcAccount: false });
  });

  it(`rejects another product's pool (${other}) as the second leg`, () => {
    expect(twoLegAudit(ticker, productSwap(other, {}, USDC_MIN, OUT_MIN), payToken)).toMatchObject({ ok: false, reason: expect.stringMatching(/second swap: account 0 is not the expected account/) });
  });

  it("rejects a pool that is not in the routes table as the second leg", () => {
    expect(twoLegAudit(ticker, productSwap(ticker, { pool: UNLISTED_POOL }, USDC_MIN, OUT_MIN), payToken)).toMatchObject({ ok: false, reason: expect.stringMatching(/second swap/) });
  });

  it(`rejects its own second leg audited as another product (${other})`, () => {
    expect(twoLegAudit(other, productSwap(ticker, {}, USDC_MIN, OUT_MIN), payToken)).toMatchObject({ ok: false, reason: expect.stringMatching(/second swap: account 0 is not the expected account/) });
  });
});

describe("auditTwoLegTransaction product key", () => {
  it("fails closed for a product that is not a routes-table key", () => {
    expect(twoLegAudit("AMZN" as ProductTicker, productSwap("META", {}, USDC_MIN, OUT_MIN))).toEqual({ ok: false, reason: "product has no pinned route" });
  });
});

describe.each([...PRODUCT_TICKERS])("wire bytes of a %s purchase that are not exactly one transaction", (ticker) => {
  const withTrailingByte = (bytes: Uint8Array) => Uint8Array.from([...bytes, 0]);
  const oneLeg: AuditExpectation = { user: USER.toBase58(), product: ticker, inputRaw: INPUT, minimumOutputRaw: MINIMUM, binArrayIndexes: [BIN], hasBitmapExtension: false };

  it("refuses a trailing byte after a one-leg purchase", () => {
    const bytes = wire([LIMIT(), productSwap(ticker)]);
    expect(auditSwapTransaction(auditShapeOf(bytes), oneLeg).ok).toBe(true);
    expect(auditShapeOf(withTrailingByte(bytes))).toBeNull();
    expect(auditSwapTransaction(auditShapeOf(withTrailingByte(bytes)), oneLeg)).toEqual({ ok: false, reason: "transaction bytes do not decode to exactly one transaction" });
  });

  it.each(["SKR", "SOL"] as const)("refuses a trailing byte after a two-leg purchase paid with %s", (payToken) => {
    const expectation = twoLegExpectation(ticker, payToken);
    const bytes = wire(PAY_LEGS[payToken].instructions(productSwap(ticker, {}, USDC_MIN, OUT_MIN)));
    expect(auditTwoLegTransaction(auditShapeOf(bytes), expectation).ok).toBe(true);
    expect(auditTwoLegTransaction(auditShapeOf(withTrailingByte(bytes)), expectation)).toEqual({ ok: false, reason: "transaction bytes do not decode to exactly one transaction" });
  });
});
