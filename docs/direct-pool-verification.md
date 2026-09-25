# Direct xStock pool verification (pre-trade boundary)

Status: read-only pool inspection implemented; **quote, unsigned transaction construction, wallet signature, and swap submission are not implemented by this module**.

The current inspected route is NVDAx/USDC on Raydium CLMM mainnet, pool `49iMatQtoyabsYAQc8GafVq6aeBFVDxSRH44oiatyyw6`. Raydium's [pool ID endpoint](https://api-v3.raydium.io/pools/info/ids?ids=49iMatQtoyabsYAQc8GafVq6aeBFVDxSRH44oiatyyw6) listed the pair and CLMM program on 2026-09-14. A public Solana RPC observation at slot 446751216 independently confirmed the onchain pool owner, the allowlisted NVDAx Token-2022 mint, canonical USDC legacy mint, the two vaults, and 8/6 raw decimals. Liquidity and swap-enabled status are re-read on every inspection, not trusted from that observation or from Raydium's API.

`inspectAcquisitionPool(connection, { ticker: "NVDA" })` returns `verified_pool` only when the pool account's owner, discriminator, PDA, mint identities, vault PDAs, mint program owners, raw decimals, token account authorities, nonzero vault balances, active liquidity, and swap status all pass exact checks at one RPC context slot. Any mismatch returns `unavailable`; RPC errors also fail closed. Every other registry asset currently returns `no_verified_pool`, not a claim that no market exists. The result deliberately sets `quoteAvailable: false` and `displayAmountBasis: "raw_only"`—verified pool state is not an executable swap or a Token-2022 scaled-UI quote.

This module uses only Solana RPC and public registry data. It does not use a Jupiter or Raydium trade-building API, collect a wallet secret, sign, or send. A later transaction module must add a separately tested quote, slippage/expiry enforcement, wallet-side authorization, and confirmation receipt before a route can be advertised as purchasable.

Protocol reference: [Raydium CLMM onchain PoolState and status bits](https://github.com/raydium-io/raydium-clmm/blob/master/programs/amm/src/states/pool.rs) (Apache-2.0). The tested program is `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK`.
