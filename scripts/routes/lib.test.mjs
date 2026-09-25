import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  countWord,
  DLMM_PROGRAM,
  evaluateObservation,
  evidenceRecord,
  formatDollars,
  formatThousands,
  MAX_POOL_FEE_PCT,
  MAX_REFERENCE_DEVIATION_PCT,
  mergeRoutes,
  MINT_EXTENSION_ALLOWLIST,
  parseCandidates,
  parseClmmRoutesTable,
  parseRoutesTable,
  clmmEvidence,
  renderEvidence,
  renderSymbolsModule,
  renderMcpTickers,
  renderReadme,
  renderRoutesTable,
  referenceDeviationPct,
  roundLiquidity,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  UNSET_KEY,
  USDC_MINT,
} from "./lib.mjs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const MINT = "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg";
const POOL = "6VcGHSc5vT9rgygCyzyP9JxmCs5BT7jvwPUeBHYcTsTc";
const PDA = { reserveX: "RX1111111111111111111111111111111", reserveY: "RY1111111111111111111111111111111", oracle: "OR1111111111111111111111111111111", bitmapExtension: "BM1111111111111111111111111111111" };

function passing() {
  return {
    registry: { ticker: "AMZN", symbol: "AMZNx", mint: MINT, decimals: 8 },
    withheld: false,
    pool: {
      owner: DLMM_PROGRAM, status: 0, pairType: 3, activationPoint: "0", creatorPoolOnOffControl: 0,
      tokenXMint: MINT, tokenYMint: USDC_MINT, tokenXProgram: TOKEN_2022_PROGRAM, tokenYProgram: TOKEN_PROGRAM, ...PDA, derived: PDA, hasBitmapExtension: false,
      // 0.25% base, 1% most (over 10^9); the program-wide cap is 10%.
      fees: { baseRate: "2500000", maxRate: "10000000", programMaxRate: "100000000" },
    },
    mint: { owner: TOKEN_2022_PROGRAM, decimals: 8, extensionTypes: [18, 12, 6, 25, 26, 4, 14, 19], transferHookProgram: UNSET_KEY, transferFeeBps: null, defaultAccountState: 1, scaledUiAmount: true, paused: false },
    // 2 USDC buys 0.009 display units at multiplier 1: 222.22 USDC each, 1.01% above 220.
    reference: { status: "fresh", feedId: "f", symbol: "Equity.US.AMZN/USD", price: "220", publishTime: 1, multiplier: "1" },
    quotes: [
      { usdc: 2, inputRaw: "2000000", consumedRaw: "2000000", outputRaw: "900000", feeRaw: "5000", priceImpactPct: "0.4" },
      { usdc: 10, inputRaw: "10000000", consumedRaw: "10000000", outputRaw: "4500000", feeRaw: "25000", priceImpactPct: "2.9" },
    ],
    liquidityUsd: 1_234.5,
  };
}

const failedIds = (observation) => evaluateObservation({ ticker: "AMZN", pool: POOL }, observation).checks.filter((check) => !check.ok).map((check) => check.id);

test("a candidate that meets every check passes", () => {
  assert.deepEqual(failedIds(passing()), []);
});

test("each failed condition excludes the candidate with its own check", () => {
  const cases = [
    [(o) => { o.registry = null; }, ["registry", "token_x"]],
    [(o) => { o.withheld = true; }, ["product_rule"]],
    [(o) => { o.pool.owner = TOKEN_PROGRAM; }, ["pool_owner"]],
    [(o) => { o.pool.status = 1; }, ["pool_status"]],
    [(o) => { o.pool.tokenXMint = USDC_MINT; }, ["token_x"]],
    [(o) => { o.pool.tokenYMint = MINT; }, ["token_y"]],
    [(o) => { o.pool.tokenXProgram = TOKEN_PROGRAM; }, ["token_programs"]],
    [(o) => { o.pool.tokenYProgram = TOKEN_2022_PROGRAM; }, ["token_programs"]],
    [(o) => { o.pool.oracle = "XX1111111111111111111111111111111"; }, ["pdas"]],
    [(o) => { o.pool.reserveY = "XX1111111111111111111111111111111"; }, ["pdas"]],
    [(o) => { o.mint.owner = TOKEN_PROGRAM; }, ["mint"]],
    [(o) => { o.mint.decimals = 6; }, ["mint"]],
    [(o) => { o.mint.transferHookProgram = DLMM_PROGRAM; }, ["transfer_hook"]],
    [(o) => { o.mint.transferFeeBps = { older: 0, newer: 5 }; }, ["transfer_fee"]],
    [(o) => { o.mint.scaledUiAmount = false; }, ["scaled_ui_amount"]],
    [(o) => { o.mint.paused = true; }, ["not_paused"]],
    [(o) => { o.quotes[0].error = "swapQuote failed"; }, ["quote_2", "quote_fee_2", "reference_2"]],
    [(o) => { o.quotes[1].priceImpactPct = "3.01"; }, ["quote_10"]],
    // Consumed short of the input, and so also far below the reference price.
    [(o) => { o.quotes[1].consumedRaw = "9000000"; }, ["quote_10", "reference_10"]],
    [(o) => { o.quotes = []; }, ["quote_2", "quote_fee_2", "reference_2", "quote_10", "quote_fee_10", "reference_10"]],
    // Fees: the base, the pool's maximum and what each quote charged, each at most 1%.
    [(o) => { o.pool.fees.baseRate = "100000001"; }, ["fee_base"]],
    [(o) => { o.pool.fees = undefined; }, ["fee_base"]],
    [(o) => { o.quotes[1].feeRaw = "100001"; }, ["quote_fee_10"]],
    [(o) => { delete o.quotes[0].feeRaw; }, ["quote_fee_2"]],
    // The effective buy price against the Pyth price, at most 3% either way.
    [(o) => { o.reference.price = "214"; }, ["reference_2", "reference_10"]],
    [(o) => { o.reference.price = "230"; }, ["reference_2", "reference_10"]],
    [(o) => { o.reference.multiplier = "1.05"; }, ["reference_2", "reference_10"]],
    // Pool fields fixed to the listed pools' values.
    [(o) => { o.pool.pairType = 0; }, ["pool_pair_type"]],
    [(o) => { o.pool.activationPoint = "1"; }, ["pool_activation"]],
    [(o) => { o.pool.creatorPoolOnOffControl = 1; }, ["pool_creator_control"]],
    // The mint's extensions must be exactly the allowlist, with new accounts initialized.
    [(o) => { o.mint.extensionTypes = [...o.mint.extensionTypes, 3]; }, ["mint_extensions"]],
    [(o) => { o.mint.extensionTypes = o.mint.extensionTypes.filter((type) => type !== 12); }, ["mint_extensions"]],
    [(o) => { o.mint.extensionTypes = [...o.mint.extensionTypes.slice(1), 19]; }, ["mint_extensions"]],
    [(o) => { o.mint.extensionTypes = [...o.mint.extensionTypes, 1]; }, ["mint_extensions", "transfer_fee"]],
    [(o) => { o.mint.defaultAccountState = 2; }, ["default_account_state"]],
    [(o) => { o.mint.defaultAccountState = null; }, ["default_account_state"]],
    // The registry row written into the table must have the expected shapes.
    [(o) => { o.registry.symbol = 'AMZNx", "x'; }, ["registry"]],
    [(o) => { o.registry.mint = "0OIl"; o.pool.tokenXMint = "0OIl"; }, ["registry"]],
  ];
  for (const [mutate, expected] of cases) {
    const observation = passing();
    mutate(observation);
    assert.deepEqual(failedIds(observation), expected, mutate.toString());
  }
});

test("a pool that is not readable as DLMM fails without the pool-field checks", () => {
  const observation = passing();
  observation.pool = { owner: null, error: "pool account missing" };
  assert.deepEqual(failedIds(observation), ["pool_owner", "pool_read"]);
});

test("a transfer-fee extension is refused even at zero bps; an unset hook passes", () => {
  const observation = passing();
  observation.mint.transferFeeBps = { older: 0, newer: 0 };
  assert.deepEqual(failedIds(observation), ["transfer_fee"]);
  const unhooked = passing();
  unhooked.mint.transferHookProgram = null;
  assert.deepEqual(failedIds(unhooked), []);
});

test("the gates and the extension allowlist are the reviewed values", () => {
  assert.equal(MAX_POOL_FEE_PCT, 1);
  // The buy flow refuses a preview above the same fee bound.
  const runtime = /^\s*maxPoolFeeBps: (\d+),$/m.exec(read("packages/purchase/src/config.ts"));
  assert.equal(Number(runtime?.[1]) / 100, MAX_POOL_FEE_PCT);
  assert.equal(MAX_REFERENCE_DEVIATION_PCT, 3);
  assert.deepEqual([...MINT_EXTENSION_ALLOWLIST].sort((a, b) => a - b), [4, 6, 12, 14, 18, 19, 25, 26]);
});

test("without a fresh Pyth price the reference gate is recorded as unchecked and the rest decides", () => {
  const observation = passing();
  observation.reference = { status: "unchecked", reason: "Pyth Equity.US.AMZN/USD: stale" };
  const verdict = evaluateObservation({ ticker: "AMZN", pool: POOL }, observation);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.checks.some((check) => check.id.startsWith("reference")), false);
  assert.match(verdict.recorded.find((entry) => entry.id === "reference").detail, /^unchecked: .*stale/);
});

test("the pool's maximum fee, the bitmap flag and the program-wide fee cap are recorded, not checked", () => {
  const observation = passing();
  observation.pool.hasBitmapExtension = true;
  // A maximum fee of 2.69% (the second AMD pool) decides nothing.
  observation.pool.fees.maxRate = "26875000";
  const verdict = evaluateObservation({ ticker: "AMZN", pool: POOL }, observation);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.checks.some((check) => check.id === "bitmap"), false);
  assert.deepEqual(verdict.recorded.map((entry) => entry.id), ["fee_max", "fee_program_cap", "bitmap"]);
});

test("the effective buy price counts the display multiplier", () => {
  const quote = { consumedRaw: "10000000", outputRaw: "4500000" };
  assert.ok(Math.abs(referenceDeviationPct(quote, { price: "222.2222222", multiplier: "1" })) < 1e-6);
  // A multiplier of 2 halves the price of one display unit.
  assert.ok(Math.abs(referenceDeviationPct(quote, { price: "111.1111111", multiplier: "2" })) < 1e-6);
  assert.ok(Number.isNaN(referenceDeviationPct({ consumedRaw: "0", outputRaw: "1" }, { price: "1", multiplier: "1" })));
});

test("candidates come from a JSON array or one json block of a Markdown file", () => {
  assert.deepEqual(parseCandidates(`[{"ticker":"AMZN","pool":"${POOL}","liquidity":1}]`, "c.json"), [{ ticker: "AMZN", pool: POOL }]);
  assert.deepEqual(parseCandidates(`# notes\n\n\`\`\`json\n[{"ticker":"AMZN","pool":"${POOL}"}]\n\`\`\`\n`, "c.md"), [{ ticker: "AMZN", pool: POOL }]);
  assert.throws(() => parseCandidates("# no block", "c.md"), /exactly one/);
  assert.throws(() => parseCandidates(`{"ticker":"AMZN"}`, "c.json"), /array/);
  const [lower, badPool, dotted] = parseCandidates(`[{"ticker":"amzn","pool":"${POOL}"},{"ticker":"AMZN","pool":"0OIl"},{"ticker":"BRK.B","pool":"${POOL}"}]`, "c.json");
  assert.match(lower.inputError, /upper-case/);
  assert.match(badPool.inputError, /base58/);
  assert.match(dotted.inputError, /upper-case/);
});

test("merge keeps listed entries in place and appends passing candidates in input order", () => {
  const listed = [{ ticker: "NVDA", symbol: "NVDAx", mint: "M1", pool: "P1" }];
  const result = (ticker, pool, ok = true) => ({ candidate: { ticker, pool }, ok, checks: ok ? [] : [{ id: "quote_2", ok: false, detail: "failed" }], observation: { registry: { symbol: `${ticker}x`, mint: `${ticker}-mint` } } });
  const merged = mergeRoutes(listed, [result("NVDA", "P1"), result("AMZN", "P2"), result("NVDA", "P9"), result("BAC", "P1"), result("MU", "P3", false), result("AMZN", "P2"), result("AMZN", "P4"), result("KO", "P2")]);
  assert.deepEqual(merged.routes.map((row) => row.ticker), ["NVDA", "AMZN"]);
  assert.deepEqual(merged.added, ["AMZN"]);
  assert.deepEqual(merged.excluded.map((entry) => entry.ticker), ["NVDA", "BAC", "MU", "AMZN", "AMZN", "KO"]);
  assert.match(merged.excluded[0].reasons.join(), /already listed with pool P1/);
  assert.match(merged.excluded[1].reasons.join(), /already listed for NVDA/);
  assert.deepEqual(merged.excluded[3].reasons, ["duplicate: AMZN with this pool appears earlier in the input"]);
  assert.ok(merged.excluded[4].reasons.includes("duplicate: AMZN appears earlier in the input with pool P2"));
  assert.ok(merged.excluded[5].reasons.includes("duplicate: this pool appears earlier in the input for AMZN"));
});

test("an entry keeps its recorded liquidity and date unless reobserved", () => {
  const observation = passing();
  const previous = { pool: POOL, liquidityUsd: 430, observedOn: "2026-09-25" };
  assert.deepEqual(evidenceRecord({ pool: POOL }, observation, previous, false, "2026-10-01").liquidityUsd, 430);
  assert.deepEqual(evidenceRecord({ pool: POOL }, observation, previous, true, "2026-10-01"), { pool: POOL, reserveX: PDA.reserveX, reserveY: PDA.reserveY, oracle: PDA.oracle, hasBitmapExtension: false, baseFeePct: 0.25, maxFeePct: 1, liquidityUsd: 1_200, observedOn: "2026-10-01" });
});

test("liquidity is rounded and written as the table and README write it", () => {
  assert.equal(roundLiquidity(426.4), 430);
  assert.equal(roundLiquidity(10_098), 10_100);
  assert.equal(roundLiquidity(-1), 0);
  assert.deepEqual([10_100, 4_900, 810, 430, 130].map(formatThousands), ["$10K", "$4.9K", "$0.8K", "$0.4K", "$0.1K"]);
  assert.equal(formatDollars(10_100), "$10,100");
});

test("regenerating the committed table, evidence, symbols, README and MCP list from their own entries changes nothing", () => {
  const table = read("packages/purchase/src/routes-table.ts");
  const evidence = JSON.parse(read("packages/purchase/src/routes-observed.json"));
  const routes = parseRoutesTable(table);
  const clmm = parseClmmRoutesTable(read("packages/purchase/src/routes-table-clmm.ts"));
  const all = [...routes, ...clmm];
  assert.ok(routes.length > 0 && clmm.length > 0);
  assert.deepEqual(all.map((row) => row.ticker), Object.keys(evidence));
  assert.equal(renderRoutesTable(table, routes, evidence), table);
  assert.equal(renderEvidence(all, { ...evidence, ...clmmEvidence(clmm, evidence) }), read("packages/purchase/src/routes-observed.json"));
  assert.equal(renderSymbolsModule(all), read("packages/purchase/src/product-symbols.ts"));
  assert.equal(renderReadme(read("README.md"), all, evidence), read("README.md"));
  const mcp = read("packages/mcp/src/tools/prepare-purchase.ts");
  assert.equal(renderMcpTickers(mcp, all), mcp);
});

test("the routes table keeps the spreads that merge the Raydium CLMM part", () => {
  const table = read("packages/purchase/src/routes-table.ts");
  const evidence = JSON.parse(read("packages/purchase/src/routes-observed.json"));
  const next = renderRoutesTable(table, parseRoutesTable(table).slice(0, 2), evidence);
  assert.match(next, /^export const PRODUCT_TICKERS = \["NVDA", "META", \.\.\.CLMM_PRODUCT_TICKERS\] as const;$/m);
  assert.match(next, /META: route\([^\n]*\),\n {2}\.\.\.CLMM_PRODUCT_ROUTES,\n\}\);/);
  assert.deepEqual(parseRoutesTable(next).map((row) => row.ticker), ["NVDA", "META"]);
});

test("a Raydium CLMM entry needs its recorded evidence and is never observed here", () => {
  const clmm = parseClmmRoutesTable(read("packages/purchase/src/routes-table-clmm.ts"));
  const evidence = JSON.parse(read("packages/purchase/src/routes-observed.json"));
  assert.ok(clmm.every((row) => row.dex === "raydium-clmm"));
  const [first] = clmm;
  const { [first.ticker]: _dropped, ...without } = evidence;
  assert.throws(() => clmmEvidence(clmm, without), new RegExp(`${first.ticker.replace(".", "\\.")} is a Raydium CLMM entry without an evidence record`));
  assert.throws(() => clmmEvidence(clmm, { ...evidence, [first.ticker]: { ...evidence[first.ticker], pool: POOL } }), /without an evidence record of its pool/);
  // The README states each CLMM pool's fixed trade fee and names the DEX.
  const readme = renderReadme(read("README.md"), [...parseRoutesTable(read("packages/purchase/src/routes-table.ts")), ...clmm], evidence);
  assert.match(readme, new RegExp(`\\| ${first.symbol.replace(".", "\\.")} \\| Raydium CLMM \\| \`${first.mint}\` \\| \`${first.pool}\` \\| ${evidence[first.ticker].tradeFeePct}% \\|`));
});

test("adding an entry rewrites every generated part", () => {
  // The added entry is the thinnest pool whatever the listed ones hold.
  const table = read("packages/purchase/src/routes-table.ts");
  const evidence = { ...JSON.parse(read("packages/purchase/src/routes-observed.json")), ZZZ: { pool: POOL, liquidityUsd: 1, observedOn: "2026-10-01" } };
  const routes = [...parseRoutesTable(table), { ticker: "ZZZ", symbol: "ZZZx", mint: MINT, pool: POOL }];
  const next = renderRoutesTable(table, routes, evidence);
  assert.match(next, /"ZZZ", \.\.\.CLMM_PRODUCT_TICKERS\] as const;/);
  assert.match(next, new RegExp(`ZZZ: route\\("ZZZ", "ZZZx", "${MINT}", "${POOL}"\\),\\n {2}\\.\\.\\.CLMM_PRODUCT_ROUTES,\\n\\}\\);`));
  assert.match(next, /ZZZ \$0\.0K \(2026-10-01\)/);
  assert.match(next, /on mainnet on the date given with its\s+\* liquidity below/);
  assert.deepEqual(parseRoutesTable(next).map((row) => row.ticker), routes.map((row) => row.ticker));
  const readme = renderReadme(read("README.md"), routes, evidence);
  assert.match(readme, new RegExp(`\\| ZZZx \\| Meteora DLMM \\| \`${MINT}\` \\| \`${POOL}\` \\| not recorded \\| about \\$1 \\(2026-10-01\\) \\|`));
  const count = countWord(routes.length);
  assert.match(readme, new RegExp(`of one of the ${count} buyable xStocks \\(\`ticker\`: NVDA, [A-Z, ]+ or ZZZ;`));
  assert.match(readme, new RegExp(`^- Only the ${count} tokens above are buyable in Benten\\.`, "m"));
  assert.match(readme, /the thinnest pool \(ZZZx\)\s+holds only about \$1 of liquidity/);
  assert.match(readme.replace(/\s+/g, " "), /and ZZZx\), each through one fixed pool/);
});
