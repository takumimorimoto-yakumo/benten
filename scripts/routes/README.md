# Routes generator

Adds purchasable xStocks to the routes table in one command, after checking
each candidate pool on mainnet. It only reads public RPC state; it builds,
signs and sends nothing.

```sh
pnpm routes:add candidates.json            # verify, then rewrite the generated files
pnpm routes:add candidates.json --dry-run  # verify and report; write nothing
pnpm routes:add candidates.json --check    # exit 1 when a generated file would change
```

The input is a JSON array `[{"ticker": "AMD", "pool": "<Meteora DLMM pool>"}]`,
or a Markdown file with exactly one ```` ```json ```` block holding that array.
`SOLANA_RPC_URL` selects the RPC (default: the public mainnet RPC).

## Checks

A candidate is listed only when every check passes; otherwise it is excluded
with the failed checks as its reasons.

| Check | Condition |
|---|---|
| `registry` | The ticker resolves exactly through the registry allowlist, with 8 decimals; the symbol and mint written into the table have the expected shape |
| `product_rule` | The registry does not withhold the row from the product (pre-IPO xStocks) |
| `pool_owner`, `pool_status` | The pool account is owned by the Meteora DLMM program and enabled |
| `pool_pair_type`, `pool_activation`, `pool_creator_control` | Pair type 3 (permissionless V2), activation point 0, creator on/off control 0 (the listed pools' values) |
| `token_x`, `token_y` | Token X is the registry mint, token Y is USDC |
| `token_programs` | Token X is Token-2022, token Y is the SPL Token program |
| `pdas` | Reserve X, reserve Y and the oracle equal their program-derived addresses |
| `fee_base` | The pool's base fee (`baseFactor` x `binStep` x 10 x 10^`baseFeePowerFactor`, over 10^9) is at most 1% |
| `mint` | The mint is owned by Token-2022 and has 8 decimals |
| `mint_extensions` | The mint's extensions are exactly MetadataPointer, TokenMetadata, PermanentDelegate, DefaultAccountState, ScaledUiAmount, Pausable, ConfidentialTransferMint and TransferHook (types 18, 19, 12, 6, 25, 26, 4, 14) |
| `default_account_state` | New token accounts start initialized, not frozen |
| `transfer_hook`, `transfer_fee` | No transfer-hook program; no transfer-fee extension at all |
| `scaled_ui_amount`, `not_paused` | The Scaled UI Amount extension is present; the mint is not paused |
| `quote_2`, `quote_10` | Exact-in quotes of 2 and 10 USDC fill completely with price impact of at most 3% (the SDK's price impact leaves the fee out) |
| `quote_fee_2`, `quote_fee_10` | The fee each quote charged is at most 1% of the USDC it consumed |
| `reference_2`, `reference_10` | When the reviewed feed map approves a Pyth feed for the mint and it is fresh: the effective buy price (USDC consumed per display unit received, at the mint's Scaled UI multiplier) is within 3% of the Pyth price of one underlying share |

Recorded, not checked: the pool's maximum fee (the base fee plus the
variable fee at the pool's maximum volatility accumulator, reached only
under extreme volatility; the buy flow refuses a preview whose quoted fee is
above 1%, `PURCHASE_CONFIG.maxPoolFeeBps`), whether the bitmap extension account exists, the
SDK's `getFeeInfo` maximum (the program-wide 10% cap, the same for every
pool), and, when no fresh Pyth price exists, that the reference gate was
unchecked (the pool and fee checks then decide alone). The limits are the
constants at the top of `lib.mjs`.

A candidate whose ticker is already listed with another pool, whose pool is
listed for another ticker, or that repeats an earlier candidate is excluded
too. Listed entries in the input are verified again; one that fails stays in
the table (removal is a separate decision) and the run exits 1.

## What it writes

- `packages/purchase/src/routes-table.ts`: the observation comment, `PRODUCT_TICKERS` and `PRODUCT_ROUTES`
- `packages/purchase/src/routes-observed.json`: per entry, the pool accounts read back from mainnet, the bitmap flag, the base and maximum fee, the liquidity and the date it was read
- `packages/purchase/src/product-symbols.ts`: the symbols the static pages state
- `packages/mcp/src/tools/prepare-purchase.ts`: `PREPARE_PURCHASE_TICKERS`
- `README.md`: the purchasable-token sentences and table (with each pool's fee), the MCP tool's ticker list and the known-limits count. Dated records of past checks are left as they are

Listed entries keep their recorded liquidity and date; `--reobserve` records
fresh ones. Running it again on the same input changes nothing.
