# On-chain daily prices

Build-time tooling that reads, from the public Solana ledger, one executed
xStock/USDC swap per NYSE session near the session close, and bundles the
result as `packages/pricing/src/onchain-daily-v1.json`. Reads only: the RPC
client refuses every method outside a fixed read list, and nothing here holds
a key, signs, sends or simulates a transaction.

Every value is the executed price of one swap in one pool. It is not a quote,
a bid or ask, a reference price or a valuation.

## Files

| File | Role |
|---|---|
| `config.json` | RPC defaults, pacing and backoff, search limits, NYSE session calendar with sources, pool-probe instants |
| `lib.mjs` | Serial rate-limited read-only RPC client; pure swap extraction and single-swap proof |
| `probe-pools.mjs` | Chooses one USDC pool per ticker by its on-chain activity history |
| `verify-pools.mjs` | Decodes each chosen pool's mints and vaults on chain; writes `packages/pricing/src/onchain-pools-v1.json` |
| `fetch-daily.mjs` | Finds each close slot and the nearest proven swap; writes a resumable raw cache |
| `build-daily.mjs` | Reads the cache and each mint's Scaled UI configuration; writes the bundled series |
| `recheck.mjs` | Re-reads random points from the ledger with its own decoding and compares |
| `lib.test.mjs` | `node --test` tests of the pure functions |

## Method

1. **Pool.** One reviewed USDC pool per ticker, fixed for the whole series.
   A pool's current volume says nothing about its past (a pool created at
   launch can stay empty for months), so `probe-pools.mjs` counts each
   candidate's successful transactions in the 24 hours before fixed probe
   instants and picks the longest unbroken run of active probes ending at the
   latest one, a tie going to the larger sum of probe counts. Only ledger facts
   decide; the directory only supplies candidate addresses. `verify-pools.mjs` decodes the pool state (Raydium CLMM or Orca
   Whirlpool layouts only) and requires its mints to be exactly the registry
   xStock mint and USDC, and each vault to be a token account the pool owns.
2. **Close slot.** For each NYSE session (weekdays minus full closures; 13:00
   on early-close days, else 16:00 America/New_York), the first slot whose
   block time is at or after the close, by interpolation and bisection over
   `getBlockTime`.
3. **Candidates.** `getSignaturesForAddress` on the pool, `before` the first
   signature of the block W slots after the close, paged back past W slots
   before the close, lists every pool transaction strictly within W slots. W
   grows from 150 by 4x up to `max_slot_distance`. Candidates are ordered by
   slot distance, then the earlier slot, then the transaction nearest the
   close within the slot.
4. **Proof.** `getTransaction` (jsonParsed): the transaction succeeded, moved
   the xStock and USDC vaults in opposite directions for at least
   `min_usdc_raw`, and exactly two token transfers touch the vaults, one in
   and one out, each for the full change. The first proven candidate is the
   session's trade. A session without one is kept with a reason.
5. **Price.** `usdc_per_unscaled_token` = |USDC change| / 10^6 divided by
   |xStock change| / 10^decimals, truncated to 6 digits, on integers only.
   The Token-2022 Scaled UI multiplier is not applied: a mint stores only its
   current multiplier and one scheduled next one, so past multipliers are not
   on chain. `usdc_per_underlying_share` (price divided by the multiplier) is
   given only for trades at or after the time the mint's stored next
   multiplier took effect, when that is already past at the build.

`fetch-daily.mjs --method blocks` is the direct alternative: it reads blocks
outward from the close slot with `getBlock` (`transactionDetails:
"accounts"`, the smallest detail level that still carries account keys and
token balances) and searches every configured pool in each block. It picks
the same trades, but a pool with a few hundred transactions a day needs
hundreds of blocks per session, so the listing method is the default and the
block method is kept as a cross-check.

## Running

```bash
pnpm --filter @benten/registry build && pnpm --filter @benten/solana build && pnpm --filter @benten/pricing build
export ONCHAIN_PRICES_CACHE_DIR=/path/outside/the/repo   # raw RPC data; never inside the repository
node scripts/onchain-prices/probe-pools.mjs --directory-dir DIR --out selection.json
node scripts/onchain-prices/verify-pools.mjs --selection selection.json
node scripts/onchain-prices/fetch-daily.mjs --from 2025-07-01 --to YYYY-MM-DD [--tickers NVDA]
node scripts/onchain-prices/build-daily.mjs --to YYYY-MM-DD [--tickers NVDA]
node scripts/onchain-prices/recheck.mjs --count 10 --seed 1
```

`ONCHAIN_PRICES_RPC_URL` overrides the default public mainnet RPC. The
public endpoint is rate limited: the client sends one request at a time with
a minimum interval, and backs off exponentially (honoring `Retry-After`) on
HTTP 429 and 5xx. The fetch is resumable; a result recorded for a different
pool than the reviewed one is searched again, and the build refuses it.
