/**
 * Pure helpers of the routes generator (`add-routes.mjs`): reading the
 * candidate file, the verdict on one candidate's mainnet observation, and the
 * text the generator writes into the routes table, the evidence file, the
 * README and the other places that list the purchasable products. Nothing
 * here reads the network or the file system.
 */

/** The price impact a 2 or 10 USDC quote may show, in percent (the SDK's figure leaves the pool fee out). */
export const MAX_PRICE_IMPACT_PCT = 3;
/**
 * The pool fee a listed route may charge, in percent: the base fee and the fee
 * each quote actually charged over the USDC it consumed must be at or below
 * this. The most the variable fee can raise the fee to under extreme
 * volatility is recorded, not checked: the user pays the fee of the fresh
 * preview, which the buy flow refuses above the same bound
 * (`PURCHASE_CONFIG.maxPoolFeeBps`; a purchase-package test ties the two).
 */
export const MAX_POOL_FEE_PCT = 1;
/**
 * How far the effective buy price (USDC consumed per display unit received,
 * at the mint's Scaled UI multiplier) may sit from the Pyth price of one
 * underlying share, in percent, when a fresh reviewed Pyth price exists.
 */
export const MAX_REFERENCE_DEVIATION_PCT = 3;
/** DLMM fee rates are integers over this (1e9 = 100%). */
export const FEE_PRECISION = 1_000_000_000;
/** USDC amounts every candidate is quoted at (the purchase cap is 10 USDC). */
export const QUOTE_AMOUNTS_USDC = [2, 10];
export const PRODUCT_DECIMALS = 8;

export const DLMM_PROGRAM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** The all-zero key: an unset transfer-hook program. */
export const UNSET_KEY = "11111111111111111111111111111111";

/**
 * Token-2022 extensions every listed xStock mint carries, and nothing else:
 * TokenMetadata (19) behind MetadataPointer (18), PermanentDelegate (12),
 * DefaultAccountState (6), ScaledUiAmount (25), Pausable (26),
 * ConfidentialTransferMint (4) and TransferHook (14). A mint with any other
 * set (a transfer fee, a close authority, a non-transferable flag, ...) is
 * not listed.
 */
export const MINT_EXTENSION_ALLOWLIST = [18, 12, 6, 25, 26, 4, 14, 19];
/** `ExtensionType::TransferFeeConfig`: refused on sight, whatever its rate. */
export const EXTENSION_TRANSFER_FEE_CONFIG = 1;
/** `AccountState::Initialized`: new token accounts of the mint are usable, not frozen. */
export const ACCOUNT_STATE_INITIALIZED = 1;
/**
 * Pool fields fixed to the values every listed pool holds: `pairType` 3
 * (permissionless V2), `activationPoint` 0 (active from creation) and
 * `creatorPoolOnOffControl` 0 (the creator cannot switch the pool off).
 */
export const POOL_PAIR_TYPE = 3;
export const POOL_ACTIVATION_POINT = "0";
export const POOL_CREATOR_ON_OFF_CONTROL = 0;

/**
 * An upper-case registry ticker. A ticker with a dot (BRK.B) is refused: the
 * routes table key is a bare identifier; it would need a quoted key first.
 */
const TICKER_SHAPE = /^[A-Z][A-Z0-9]{0,9}$/;
/** A registry on-chain symbol as the table writes it: the ticker's shape plus the `x` suffix. */
const SYMBOL_SHAPE = /^[A-Z][A-Z0-9]{0,9}x$/;
const BASE58_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** A DLMM fee rate (integer over `FEE_PRECISION`) as a percentage. */
export function feePct(rate) {
  return (Number(rate) * 100) / FEE_PRECISION;
}

/** `0.25%`, `1.4%`: a fee percentage as the report and README write it (at most two decimals). */
export function formatPct(pct) {
  return `${Number(pct.toFixed(2))}%`;
}

/**
 * Candidates from a JSON file (`[{ "ticker": "AMZN", "pool": "..." }]`) or a
 * Markdown file holding exactly one ```json block with that array. Other keys
 * of an item (notes, liquidity from an indexer) are ignored. A malformed item
 * is kept with `inputError` so the report names it; a malformed file throws.
 */
export function parseCandidates(text, fileName) {
  let json = text;
  if (/\.md$/i.test(fileName)) {
    const blocks = [...text.matchAll(/```json[^\n]*\n([\s\S]*?)```/g)];
    if (blocks.length !== 1) throw new Error(`${fileName}: expected exactly one \`\`\`json block with the candidates, found ${blocks.length}`);
    json = blocks[0][1];
  }
  const value = JSON.parse(json);
  if (!Array.isArray(value)) throw new Error(`${fileName}: the candidates must be a JSON array of {ticker, pool}`);
  return value.map((item) => {
    const ticker = item && typeof item === "object" && typeof item.ticker === "string" ? item.ticker : null;
    const pool = item && typeof item === "object" && typeof item.pool === "string" ? item.pool : null;
    if (ticker === null || !TICKER_SHAPE.test(ticker)) return { ticker: String(ticker ?? item?.ticker ?? "?"), pool: String(pool ?? "?"), inputError: "ticker must be an upper-case registry ticker" };
    if (pool === null || !BASE58_KEY.test(pool)) return { ticker, pool: String(pool ?? "?"), inputError: "pool must be a base58 address" };
    return { ticker, pool };
  });
}

/**
 * Every check on one candidate's observation, in report order. `observation`
 * is what `observe.ts` read (see its type there); a check whose input could
 * not be read fails with that reason.
 */
export function evaluateObservation(candidate, observation) {
  const checks = [];
  /** Facts recorded for the audit that decide nothing, and gates that could not run (`unchecked`). */
  const recorded = [];
  const check = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });
  const record = (id, detail) => recorded.push({ id, detail });
  const reg = observation.registry;
  const regShape = reg !== null && TICKER_SHAPE.test(reg.ticker) && SYMBOL_SHAPE.test(reg.symbol) && BASE58_KEY.test(reg.mint);
  check("registry", reg !== null && reg.ticker === candidate.ticker && reg.decimals === PRODUCT_DECIMALS && regShape,
    reg === null ? `ticker is not in the registry allowlist${observation.withheld ? " (withheld row)" : ""}` : `registry ${reg.symbol} ${reg.mint} decimals ${reg.decimals}${regShape ? "" : " (symbol or mint is not in the expected shape)"}`);
  // Product rule: a row the registry withholds from every product surface (`isWithheldFromProduct`: pre-IPO xStocks) is never listed.
  check("product_rule", observation.withheld === false, observation.withheld ? "withheld from the product by the registry (non-PreStocks pre-IPO token)" : "not withheld");
  const pool = observation.pool;
  if (pool.error) {
    check("pool_owner", pool.owner === DLMM_PROGRAM, pool.owner === null ? "pool account missing" : `owner ${pool.owner}`);
    check("pool_read", false, pool.error);
  } else {
    check("pool_owner", pool.owner === DLMM_PROGRAM, `owner ${pool.owner}`);
    check("pool_status", pool.status === 0, `status ${pool.status} (0 = enabled)`);
    check("pool_pair_type", pool.pairType === POOL_PAIR_TYPE, `pair type ${pool.pairType} (${POOL_PAIR_TYPE} = permissionless V2)`);
    check("pool_activation", String(pool.activationPoint) === POOL_ACTIVATION_POINT, `activation point ${pool.activationPoint}`);
    check("pool_creator_control", pool.creatorPoolOnOffControl === POOL_CREATOR_ON_OFF_CONTROL, `creator on/off control ${pool.creatorPoolOnOffControl}`);
    check("token_x", reg !== null && pool.tokenXMint === reg.mint, `token X ${pool.tokenXMint}`);
    check("token_y", pool.tokenYMint === USDC_MINT, `token Y ${pool.tokenYMint}`);
    check("token_programs", pool.tokenXProgram === TOKEN_2022_PROGRAM && pool.tokenYProgram === TOKEN_PROGRAM, `X ${pool.tokenXProgram}, Y ${pool.tokenYProgram}`);
    const pdaOk = pool.reserveX === pool.derived.reserveX && pool.reserveY === pool.derived.reserveY && pool.oracle === pool.derived.oracle;
    check("pdas", pdaOk, pdaOk ? "reserve X, reserve Y and oracle equal their PDAs" : `reserve X ${pool.reserveX} vs ${pool.derived.reserveX}, reserve Y ${pool.reserveY} vs ${pool.derived.reserveY}, oracle ${pool.oracle} vs ${pool.derived.oracle}`);
    const fees = pool.fees;
    if (!fees) {
      check("fee_base", false, "pool fee parameters not read");
    } else {
      const base = feePct(fees.baseRate);
      check("fee_base", Number.isFinite(base) && base <= MAX_POOL_FEE_PCT, `base fee ${formatPct(base)} (at most ${MAX_POOL_FEE_PCT}%)`);
      record("fee_max", `pool maximum fee ${formatPct(feePct(fees.maxRate))} (base plus the variable fee at the pool's maximum volatility; information, the preview bounds the fee paid)`);
      record("fee_program_cap", `the SDK's getFeeInfo maximum is the program-wide cap ${formatPct(feePct(fees.programMaxRate))}, the same for every pool`);
    }
    record("bitmap", pool.hasBitmapExtension ? "bitmap extension account exists" : "no bitmap extension account");
  }
  const mint = observation.mint;
  if (mint === null) {
    check("mint", false, reg === null ? "not read: the ticker names no registry mint" : "mint account missing");
  } else {
    check("mint", mint.owner === TOKEN_2022_PROGRAM && mint.decimals === PRODUCT_DECIMALS, `owner ${mint.owner}, decimals ${mint.decimals}`);
    const types = mint.extensionTypes;
    const extensionsOk = types.length === MINT_EXTENSION_ALLOWLIST.length && new Set(types).size === types.length && MINT_EXTENSION_ALLOWLIST.every((type) => types.includes(type));
    check("mint_extensions", extensionsOk, `extensions [${types.join(",")}] (allowed exactly [${MINT_EXTENSION_ALLOWLIST.join(",")}])`);
    check("default_account_state", mint.defaultAccountState === ACCOUNT_STATE_INITIALIZED, mint.defaultAccountState === null ? "no default account state extension" : `default account state ${mint.defaultAccountState} (${ACCOUNT_STATE_INITIALIZED} = initialized)`);
    check("transfer_hook", mint.transferHookProgram === null || mint.transferHookProgram === UNSET_KEY, mint.transferHookProgram === null ? "no transfer hook extension" : `transfer hook program ${mint.transferHookProgram}`);
    const hasTransferFee = types.includes(EXTENSION_TRANSFER_FEE_CONFIG) || mint.transferFeeBps !== null;
    check("transfer_fee", !hasTransferFee, hasTransferFee ? `transfer fee extension present${mint.transferFeeBps ? ` (bps ${mint.transferFeeBps.older}/${mint.transferFeeBps.newer})` : ""}` : "no transfer fee extension");
    check("scaled_ui_amount", mint.scaledUiAmount === true, mint.scaledUiAmount ? "Scaled UI Amount extension present" : "no Scaled UI Amount extension");
    check("not_paused", mint.paused !== true, mint.paused === null ? "no pausable extension" : `paused ${mint.paused}`);
  }
  const reference = observation.reference ?? { status: "unchecked", reason: "no reference price read" };
  if (reference.status !== "fresh") record("reference", `unchecked: ${reference.reason}; the pool and fee checks alone decide`);
  for (const usdc of QUOTE_AMOUNTS_USDC) {
    const quote = observation.quotes.find((entry) => entry.usdc === usdc);
    if (!quote || quote.error) {
      check(`quote_${usdc}`, false, quote?.error ?? "not quoted");
      check(`quote_fee_${usdc}`, false, "not quoted");
      if (reference.status === "fresh") check(`reference_${usdc}`, false, "not quoted");
      continue;
    }
    const impact = Number(quote.priceImpactPct);
    const full = quote.consumedRaw === quote.inputRaw;
    check(`quote_${usdc}`, full && Number.isFinite(impact) && Math.abs(impact) <= MAX_PRICE_IMPACT_PCT,
      `${usdc} USDC -> ${quote.outputRaw} raw, impact ${quote.priceImpactPct}%${full ? "" : `, consumed only ${quote.consumedRaw} of ${quote.inputRaw}`}`);
    const consumed = Number(quote.consumedRaw);
    const feeShare = typeof quote.feeRaw === "string" && consumed > 0 ? (Number(quote.feeRaw) * 100) / consumed : Number.NaN;
    check(`quote_fee_${usdc}`, Number.isFinite(feeShare) && feeShare <= MAX_POOL_FEE_PCT, Number.isFinite(feeShare) ? `fee ${quote.feeRaw} raw USDC of ${quote.consumedRaw} consumed, ${formatPct(feeShare)} (at most ${MAX_POOL_FEE_PCT}%)` : "quote carries no fee");
    if (reference.status === "fresh") {
      const deviation = referenceDeviationPct(quote, reference);
      check(`reference_${usdc}`, Number.isFinite(deviation) && Math.abs(deviation) <= MAX_REFERENCE_DEVIATION_PCT,
        Number.isFinite(deviation) ? `effective buy price ${formatPct(deviation)} from the Pyth ${reference.symbol} price ${reference.price} (multiplier ${reference.multiplier}; at most ${MAX_REFERENCE_DEVIATION_PCT}% either way)` : "effective buy price not computable");
    }
  }
  return { ok: checks.every((entry) => entry.ok), checks, recorded };
}

/**
 * Percent by which the effective buy price of `quote` (USDC consumed per
 * display unit received, the display unit being the raw output over 10^8
 * times the Scaled UI multiplier) sits above (+) or below (-) the Pyth price
 * of one underlying share.
 */
export function referenceDeviationPct(quote, reference) {
  const usdc = Number(quote.consumedRaw) / 1e6;
  const units = (Number(quote.outputRaw) / 10 ** PRODUCT_DECIMALS) * Number(reference.multiplier);
  const price = Number(reference.price);
  if (!(usdc > 0 && units > 0 && price > 0)) return Number.NaN;
  return ((usdc / units) / price - 1) * 100;
}

/** Parse the entries of `PRODUCT_ROUTES` from the routes table source, in table order. */
export function parseRoutesTable(source) {
  const rows = [...source.matchAll(/^\s*(\w+): route\("(\w+)", "(\w+)", "(\w+)", "(\w+)"\),$/gm)].map((m) => ({ key: m[1], ticker: m[2], symbol: m[3], mint: m[4], pool: m[5] }));
  const tickers = /^export const PRODUCT_TICKERS = \[(.*)\] as const;$/m.exec(source);
  if (!tickers) throw new Error("routes table: PRODUCT_TICKERS line not found");
  const order = [...tickers[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
  for (const row of rows) if (row.key !== row.ticker) throw new Error(`routes table: key ${row.key} names ticker ${row.ticker}`);
  if (order.join() !== rows.map((row) => row.ticker).join()) throw new Error("routes table: PRODUCT_TICKERS and PRODUCT_ROUTES disagree");
  return rows.map(({ ticker, symbol, mint, pool }) => ({ ticker, symbol, mint, pool }));
}

/**
 * The Raydium CLMM entries of `routes-table-clmm.ts` (written by the CLMM
 * generator, merged into `PRODUCT_ROUTES` by spreads this generator keeps),
 * in table order, each marked with its DEX. This generator does not observe
 * or rewrite them; it lists them wherever the purchasable products are listed.
 */
export function parseClmmRoutesTable(source) {
  const rows = [...source.matchAll(/^\s*"([\w.]+)": clmmRoute\("([\w.]+)", "([\w.]+)", "(\w+)", "(\w+)",/gm)].map((m) => ({ key: m[1], ticker: m[2], symbol: m[3], mint: m[4], pool: m[5] }));
  const tickers = /^export const CLMM_PRODUCT_TICKERS = \[(.*)\] as const;$/m.exec(source);
  if (!tickers) throw new Error("CLMM routes table: CLMM_PRODUCT_TICKERS line not found");
  const order = [...tickers[1].matchAll(/"([\w.]+)"/g)].map((m) => m[1]);
  for (const row of rows) if (row.key !== row.ticker) throw new Error(`CLMM routes table: key ${row.key} names ticker ${row.ticker}`);
  if (order.join() !== rows.map((row) => row.ticker).join()) throw new Error("CLMM routes table: CLMM_PRODUCT_TICKERS and the entries disagree");
  return rows.map(({ ticker, symbol, mint, pool }) => ({ ticker, symbol, mint, pool, dex: CLMM_DEX }));
}

/** The DEX id of the Raydium CLMM routes, as the routes table and their evidence records name it. */
export const CLMM_DEX = "raydium-clmm";
const isClmm = (row) => row.dex === CLMM_DEX;

/**
 * The evidence records of the CLMM entries, kept as recorded: this generator
 * does not observe CLMM pools. A CLMM entry without a record of its pool is
 * an error (record it before running this generator).
 */
export function clmmEvidence(clmmRoutes, previous) {
  const out = {};
  for (const row of clmmRoutes) {
    const record = previous[row.ticker];
    if (!record || record.dex !== CLMM_DEX || record.pool !== row.pool) throw new Error(`${row.ticker} is a Raydium CLMM entry without an evidence record of its pool`);
    out[row.ticker] = record;
  }
  return out;
}

/**
 * The table after this run: every listed entry in its place, then every
 * candidate that passed and is not listed yet, in input order. A candidate
 * whose ticker is listed with another pool, whose pool is listed for another
 * ticker, or that repeats an earlier candidate is excluded with that reason.
 */
export function mergeRoutes(listed, results) {
  const out = listed.map((row) => ({ ...row }));
  const excluded = [];
  const added = [];
  const seen = [];
  for (const result of results) {
    const { candidate } = result;
    const reasons = result.ok ? [] : result.checks.filter((entry) => !entry.ok).map((entry) => `${entry.id}: ${entry.detail}`);
    const earlierTicker = seen.find((entry) => entry.ticker === candidate.ticker);
    const earlierPool = seen.find((entry) => entry.pool === candidate.pool && entry.ticker !== candidate.ticker);
    if (earlierTicker && earlierTicker.pool === candidate.pool) reasons.push(`duplicate: ${candidate.ticker} with this pool appears earlier in the input`);
    else if (earlierTicker) reasons.push(`duplicate: ${candidate.ticker} appears earlier in the input with pool ${earlierTicker.pool}`);
    if (earlierPool) reasons.push(`duplicate: this pool appears earlier in the input for ${earlierPool.ticker}`);
    seen.push({ ticker: candidate.ticker, pool: candidate.pool });
    const sameTicker = listed.find((row) => row.ticker === candidate.ticker);
    if (sameTicker && sameTicker.pool !== candidate.pool) reasons.push(`listed: ${candidate.ticker} is already listed with pool ${sameTicker.pool}`);
    const samePool = out.find((row) => row.pool === candidate.pool && row.ticker !== candidate.ticker);
    if (samePool) reasons.push(`listed: the pool is already listed for ${samePool.ticker}`);
    if (reasons.length > 0) {
      excluded.push({ ticker: candidate.ticker, pool: candidate.pool, listed: Boolean(sameTicker), reasons });
      continue;
    }
    if (!sameTicker) {
      out.push({ ticker: candidate.ticker, symbol: result.observation.registry.symbol, mint: result.observation.registry.mint, pool: candidate.pool });
      added.push(candidate.ticker);
    }
  }
  return { routes: out, added, excluded };
}

/**
 * The evidence record written for a verified entry. The pool accounts and
 * fees are always the fresh reading; liquidity and the observation date are
 * kept from `previous` unless `reobserve`, so a rerun without changes writes
 * nothing.
 */
export function evidenceRecord(candidate, observation, previous, reobserve, today) {
  const keep = previous && !reobserve && previous.pool === candidate.pool && typeof previous.liquidityUsd === "number" && typeof previous.observedOn === "string";
  return {
    pool: candidate.pool,
    reserveX: observation.pool.reserveX,
    reserveY: observation.pool.reserveY,
    oracle: observation.pool.oracle,
    hasBitmapExtension: observation.pool.hasBitmapExtension,
    ...feeRecord(observation),
    liquidityUsd: keep ? previous.liquidityUsd : roundLiquidity(observation.liquidityUsd),
    observedOn: keep ? previous.observedOn : today,
  };
}

/**
 * The pool's base fee and its maximum fee (base plus the variable fee at the
 * pool's maximum volatility), in percent, as the evidence records them; `{}`
 * when the pool fees were not read.
 */
export function feeRecord(observation) {
  const fees = observation?.pool?.fees;
  return fees ? { baseFeePct: feePct(fees.baseRate), maxFeePct: feePct(fees.maxRate) } : {};
}

/** Liquidity as recorded: to $10 below $1,000, to $100 above. */
export function roundLiquidity(usd) {
  if (!Number.isFinite(usd) || usd < 0) return 0;
  const step = usd < 1_000 ? 10 : 100;
  return Math.round(usd / step) * step;
}

/** `$10K` / `$4.9K` / `$0.4K`, as the routes table comment writes liquidity. */
export function formatThousands(usd) {
  return usd >= 10_000 ? `$${Math.round(usd / 1_000)}K` : `$${(usd / 1_000).toFixed(1)}K`;
}

/** `$10,100`, as the README writes liquidity. */
export function formatDollars(usd) {
  return `$${usd.toLocaleString("en-US")}`;
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

/** An English count as prose writes it: a word up to twenty, digits above. */
export function countWord(count, capitalized = false) {
  const word = NUMBER_WORDS[count] ?? String(count);
  return capitalized ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** `A, B and C` (or `A, B or C`). */
export function englishList(items, conjunction = "and") {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`;
}

function uniformDate(routes, evidence) {
  const dates = new Set(routes.map((row) => evidence[row.ticker].observedOn));
  return dates.size === 1 ? [...dates][0] : null;
}

/** Greedy word wrap. Every line starts with `prefix`; a line may pass `width` only when one word is longer. */
export function wrap(text, width, prefix = "", firstPrefix = prefix) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = firstPrefix;
  let empty = true;
  for (const word of words) {
    const next = empty ? line + word : `${line} ${word}`;
    if (!empty && next.length > width) {
      lines.push(line);
      line = prefix + word;
    } else {
      line = next;
    }
    empty = false;
  }
  lines.push(line);
  return lines.join("\n");
}

const normalize = (text) => text.replace(/^\s*\*\s?/gm, " ").replace(/\s+/g, " ").trim();

/** `replacement` when `current` says something else; `current` unchanged when only the wrapping differs. */
function keepWrapping(current, replacement) {
  return normalize(current) === normalize(replacement) ? current : replacement;
}

function replaceOnce(source, pattern, replace, label) {
  const match = pattern.exec(source);
  if (!match) throw new Error(`${label}: the generated section was not found (pattern ${pattern})`);
  return source.slice(0, match.index) + replace(match) + source.slice(match.index + match[0].length);
}

/** The observation paragraph of the routes table's header comment. */
export function observationParagraph(routes, evidence) {
  const date = uniformDate(routes, evidence);
  const byDepth = [...routes].sort((a, b) => evidence[b.ticker].liquidityUsd - evidence[a.ticker].liquidityUsd);
  const depth = byDepth.map((row, index) => `${row.ticker} ${index === 0 ? "about " : ""}${formatThousands(evidence[row.ticker].liquidityUsd)}${date ? "" : ` (${evidence[row.ticker].observedOn})`}`).join(", ");
  const text = `Each entry was observed read-only on mainnet on ${date ?? "the date given with its liquidity below"}: the pool account is owned by the DLMM program, its token X is the product mint and its token Y is USDC (both read back from the pool account), the product mint is owned by Token-2022 with 8 decimals, carries the Scaled UI Amount extension, and its transfer-hook program is unset. Liquidity at the time: ${depth} (the deepest xStock/USDC DLMM pool of each product).`;
  return `${wrap(text, 78, " * ")}\n`;
}

/** The `...NAME` spreads of a list's source, in order. */
function spreadsOf(list) {
  return [...list.matchAll(/\.\.\.\w+/g)].map((m) => m[0]);
}

function routeLine(row) {
  return `  ${row.ticker}: route("${row.ticker}", "${row.symbol}", "${row.mint}", "${row.pool}"),`;
}

/** The routes table source with its three generated parts rewritten from `routes`. */
export function renderRoutesTable(source, routes, evidence) {
  let out = replaceOnce(source, /^ \* Each entry was observed[\s\S]*?(?=^ \* The browser and the server)/m, (m) => keepWrapping(m[0], observationParagraph(routes, evidence)), "routes table comment");
  // The spreads that merge the Raydium CLMM part (`...CLMM_PRODUCT_TICKERS`, `...CLMM_PRODUCT_ROUTES`) stay after the generated entries.
  out = replaceOnce(out, /^export const PRODUCT_TICKERS = \[(.*)\] as const;$/m, (m) => `export const PRODUCT_TICKERS = [${[...routes.map((row) => `"${row.ticker}"`), ...spreadsOf(m[1])].join(", ")}] as const;`, "routes table tickers");
  out = replaceOnce(out, /(^export const PRODUCT_ROUTES: .*= Object\.freeze\(\{\n)([\s\S]*?)(^\}\);$)/m, (m) => `${m[1]}${[...routes.map(routeLine), ...m[2].split("\n").filter((line) => /^\s*\.\.\.\w+,$/.test(line))].join("\n")}\n${m[3]}`, "routes table entries");
  return out;
}

/** The evidence file: one record per table entry, in table order. */
export function renderEvidence(routes, evidence) {
  const ordered = Object.fromEntries(routes.map((row) => [row.ticker, evidence[row.ticker]]));
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** The MCP package's advertised ticker list (an SSOT exception a public-api test ties to the table). */
export function renderMcpTickers(source, routes) {
  return replaceOnce(source, /^export const PREPARE_PURCHASE_TICKERS = \[.*\] as const;$/m, () => `export const PREPARE_PURCHASE_TICKERS = [${routes.map((row) => `"${row.ticker}"`).join(", ")}] as const;`, "MCP tickers");
}

/** The dependency-free symbol list the static pages state. */
export function renderSymbolsModule(routes) {
  return [
    "/**",
    " * On-chain symbols of the purchasable products, in the routes table's order.",
    " * Generated by `scripts/routes/add-routes.mjs` from `routes-table.ts`; a",
    " * routes-table test requires both to agree. It imports nothing, so a page",
    " * can state the list without loading the purchase code.",
    " */",
    `export const PRODUCT_SYMBOLS = [${routes.map((row) => `"${row.symbol}"`).join(", ")}] as const;`,
    "",
  ].join("\n");
}

/** `0.25% (max 1.4%)`, as the README writes a DLMM pool's fees; `0.25%` for a CLMM pool's fixed trade fee; `not recorded` without a reading. */
function feeCell(record) {
  if (record.dex === CLMM_DEX) return typeof record.tradeFeePct === "number" ? formatPct(record.tradeFeePct) : "not recorded";
  return typeof record.baseFeePct === "number" && typeof record.maxFeePct === "number" ? `${formatPct(record.baseFeePct)} (max ${formatPct(record.maxFeePct)})` : "not recorded";
}

/**
 * The README's purchasable-token statements: the intro sentence, the limits
 * bullet, the table, the thinnest pool, the MCP tool's ticker list and the
 * known-limits count. Dated records (a check run on a given day) are history
 * and are not rewritten.
 */
export function renderReadme(source, routes, evidence) {
  const symbols = routes.map((row) => row.symbol);
  const date = uniformDate(routes, evidence);
  const dlmm = routes.filter((row) => !isClmm(row));
  const clmm = routes.filter(isClmm);
  const dlmmDate = uniformDate(dlmm, evidence);
  const clmmDate = uniformDate(clmm, evidence);
  const thinnest = [...routes].sort((a, b) => evidence[a.ticker].liquidityUsd - evidence[b.ticker].liquidityUsd)[0];
  let out = replaceOnce(source, /^Benten is a mobile-first web app[\s\S]*?(?=\n\n)/m, (m) => {
    const text = m[0].replace(/For \w+ xStocks \([^)]*\), each through one fixed pool/, `For ${countWord(routes.length)} xStocks (${englishList(symbols)}), each through one fixed pool`);
    return keepWrapping(m[0], wrap(text, 78));
  }, "README intro");
  out = replaceOnce(out, /^- \w+ tokens, one route each,[\s\S]*?(?=\n\n)/m, (m) => {
    const dlmmText = `Each Meteora DLMM pool was read on mainnet on ${dlmmDate ?? "the date in its row"}: owned by the DLMM program, token X the xStock mint (Token-2022, 8 decimals, Scaled UI Amount, no transfer hook), token Y USDC. Its fee is the pool's base fee and, in brackets, the most its variable fee can raise it to, from the pool's own parameters (\`baseFactor\` x \`binStep\` x 10 x 10^\`baseFeePowerFactor\`, over 10^9).`;
    const clmmText = clmm.length === 0 ? "" : ` Each Raydium CLMM pool (\`packages/purchase/src/routes-table-clmm.ts\`) was read on mainnet on ${clmmDate ?? "the date in its row"}: owned by the CLMM program, token A the xStock mint (the same mint checks), token B USDC, both vaults the program's own vault addresses, the fee taken on the input and no dynamic fee. Its fee is the trade fee of the pool's config, a fixed rate; its liquidity is the USDC vault plus the xStock vault at the pool's price.`;
    const through = clmm.length === 0 ? "one fixed Meteora DLMM pool per token" : `one fixed pool per token: ${countWord(dlmm.length)} through a Meteora DLMM pool and ${countWord(clmm.length)} through a Raydium CLMM pool`;
    const text = `${countWord(routes.length, true)} tokens, one route each, for USDC through ${through} (\`packages/purchase/src/routes-table.ts\`). ${dlmmText}${clmmText} Every preview whose quoted pool fee is above 1% is refused.`;
    return keepWrapping(m[0], wrap(text, 78, "  ", "- "));
  }, "README limits bullet");
  out = replaceOnce(out, /^ {2}\| Token \|(?: DEX \|)? Mint \| Pool \|[^\n]*\n {2}\|[-:|]+\|\n(?: {2}\|[^\n]*\n)*/m, () => {
    const header = `  | Token | DEX | Mint | Pool | Pool fee | Liquidity (${date ?? "date observed"}) |\n  |---|---|---|---|---:|---:|\n`;
    const rows = routes.map((row) => `  | ${row.symbol} | ${isClmm(row) ? "Raydium CLMM" : "Meteora DLMM"} | \`${row.mint}\` | \`${row.pool}\` | ${feeCell(evidence[row.ticker])} | about ${formatDollars(evidence[row.ticker].liquidityUsd)}${date ? "" : ` (${evidence[row.ticker].observedOn})`} |\n`).join("");
    return header + rows;
  }, "README routes table");
  out = replaceOnce(out, /the thinnest pool \((\w+)\)(\s+)holds only about \$[\d,]+ of liquidity/, (m) => `the thinnest pool (${thinnest.symbol})${m[2]}holds only about ${formatDollars(evidence[thinnest.ticker].liquidityUsd)} of liquidity`, "README thinnest pool");
  out = replaceOnce(out, /of one of the \w+ buyable xStocks \(`ticker`: [^;]*;/, () => `of one of the ${countWord(routes.length)} buyable xStocks (\`ticker\`: ${englishList(routes.map((row) => row.ticker), "or")};`, "README MCP tickers");
  out = replaceOnce(out, /^- Only the \w+ tokens above are buyable in Benten\./m, () => `- Only the ${countWord(routes.length)} tokens above are buyable in Benten.`, "README known limits");
  return out;
}
