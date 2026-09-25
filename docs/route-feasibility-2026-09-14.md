# NVDAx/USDC direct-DEX route feasibility (no-send spike)

Status: **pool identities observed; no acquisition-ready route established**. Observation date: 2026-09-14. This note records public, read-only evidence. It did not request a size-specific quote, construct or simulate a transaction, connect a wallet, sign, or submit a swap. Pool balances are not executable depth or a price promise.

## Decision at this gate

Keep acquisition unavailable. Meteora DLMM is the preferred **research candidate**, not the selected production route: its installed SDK is ISC-licensed and its decoded live pool has the intended mints and token-program owners. Raydium CLMM remains a verified read-only candidate; the official Raydium SDK v2 package declares GPL-3.0, a distribution decision this spike does not make. Neither candidate has passed a bounded-size quote, browser build, instruction/account audit, simulation, legal/eligibility review, or user-approved live transaction. Do not infer availability for other registry entries.

| Evidence level | Meteora DLMM | Raydium CLMM |
| --- | --- | --- |
| Mainnet cluster | Public Solana RPC genesis `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`; account batch observed at slot `446771766` | Same genesis; the committed `inspectAcquisitionPool` returned `verified_pool` at slot `446771214` |
| Exact pool and program | Pool `F4inHs4RQARpASmvLpj45QjGLdkukeGQrtQ22pimVy2a`, owner/program `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`, 904-byte account, discriminator `210b3162b565b10d`, status byte `0`; installed SDK decoded active bin `309`, bin step `25`, status `0` | Pool `49iMatQtoyabsYAQc8GafVq6aeBFVDxSRH44oiatyyw6`, owner/program `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK`; committed inspector checks pool/vault PDA, discriminator, mints, status and liquidity at one context slot |
| Mints, vaults and raw reserves | Token X: allowlisted NVDAx `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh`, Token-2022 owner `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, 8 decimals, reserve `86FWMceL1zy5agA4HxyDAZxRHR86Ky7D6AhDL8VXtvsY` with `3474565705` raw units. Token Y: USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, legacy token owner `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`, 6 decimals, reserve `GZj4nNXEZ67eEvbvKzkRc8aSrS2EGH2mu2hmUA3UTeBr` with `9288440507` raw units. Both reserve authorities decoded to the pool. | Inspector observed NVDAx vault `502510334291` raw units and USDC vault `1061661549211` raw units, with exact owner/mint/authority checks. See [pool verifier](direct-pool-verification.md). |
| Quote readiness | **Unknown** for every input size. Active bin and positive reserve do not prove bin-array coverage, output, fee, slippage or price impact. | **False** in the current inspector contract (`quoteAvailable: false`); no CLMM quote builder is shipped. |
| SDK and runtime | Official `@meteora-ag/dlmm` package manifest at observed version `1.9.14` declares ISC. Installed package exposes `getBinArrayForSwap`, `swapQuote`, `swap`; local CommonJS `require` and read-only `DLMM.create` succeeded on Node 24.7. Native ESM import failed with `ERR_UNSUPPORTED_DIR_IMPORT` in a nested Anchor dependency. Browser bundling and the intended separate acquisition subpath are unverified. | Official Raydium SDK v2 manifest declares GPL-3.0; licensing compatibility with this public repository is unresolved. The current verifier uses RPC and no Raydium trade API or SDK. |

The Meteora pool field offsets and status interpretation above were cross-checked by `DLMM.create` decoding the same pool, but that read was not pinned to the earlier account-batch context slot. They are **time-stamped observations**, not immutable route policy or a quote. The Raydium verifier's `verified_pool` result is likewise a read-only identity state, never an acquisition state.

## Amount and transaction boundary

The observed NVDAx Scaled UI Amount extension stores a `multiplier` field of `1.0009180758490996` (the older stored value), a `newMultiplier` field of `1.001701196801074`, and `newMultiplierEffectiveTimestamp` of `2026-09-10T00:30:00Z`. That effective timestamp had passed by the 2026-09-14 observation date, so `newMultiplier` is the **observation-time effective candidate**, not the older field labelled as current. This read did not independently capture the token program's time-context conversion result. A production display must obtain the effective multiplier at its own quote/confirmation context using the token program's conversion rules. Solana's documentation says scaling changes UI presentation, not raw onchain account units. USDC input and NVDAx minimum output must therefore be handled as integer raw units; neither raw decimals nor the multiplier alone warrants describing the output as ordinary shares. A display-to-raw round trip based on floating point is unsafe.

The installed Meteora SDK source appears to construct `swap2` with token-X/token-Y program accounts and transfer-hook support. This is **source inspection**, not an audited transaction: the SDK may also create associated token accounts and add compute-budget instructions. The USDC-to-NVDAx direction is Y-to-X for this pool; direction, account metas, allowed programs, recipient/owner, fees, blockhash, slippage, expiry, and raw minimum output still need test vectors and a strict post-build audit. No browser wallet handoff may occur on this evidence alone.

## Missing measurements and reversal gates

1. At one recorded slot, read required active bin arrays or CLMM tick arrays and obtain **read-only, size-specific** quotes for a bounded set of USDC raw inputs. Record output raw units, fee, price impact if calculable, slippage/minimum output, quote age and failure reasons. A successful generic SDK method call or nonzero reserve is insufficient. This spike intentionally made no quote call.
2. Prove deterministic browser-compatible build and negative transaction-audit fixtures: wrong cluster/genesis, pool, mint, token program, vault, owner, recipient, extra transfer, transfer-hook account, fee, slippage, blockhash and expired quote must fail closed. The observed Node ESM failure must be resolved or the package rejected; a CommonJS read in Node does not prove browser compatibility. Keep the read-only Solana root and MCP import graph free of the trading SDK.
3. Pin the exact SDK version/license and inspect its dependency/license inventory before distribution. If Meteora's package or browser graph is incompatible, reverse the research preference. Do not silently switch to GPL code or a server trade-building API.
4. Measure RPC calls, p50/p95 latency, errors and provider rate limits for pool refresh and bounded quotes; price a low/base/peak monthly request scenario with dated provider terms. This spike used one public RPC endpoint for a few reads and established **no throughput SLA, provider price, or sustainable free-tier capacity**. Estimate transaction/priority fees separately before any live review.
5. Obtain current product/legal eligibility review and explicit wallet-only authorization policy. No route may be labelled purchasable, and no live mainnet send is authorized by this document. If any legal or technical gate cannot be enforced, retain the informational read-only page.

## Source and method ledger

Official sources accessed 2026-09-14: [Meteora DLMM SDK README](https://github.com/MeteoraAg/dlmm-sdk/tree/main/ts-client) (generic create/refetch/bin-array/quote/swap API); [Meteora package manifest](https://github.com/MeteoraAg/dlmm-sdk/blob/main/ts-client/package.json) (version/license/module entry points); [Raydium SDK v2 manifest](https://github.com/raydium-io/raydium-sdk-V2/blob/master/package.json) (GPL-3.0 declaration); [Solana Scaled UI Amount](https://solana.com/docs/tokens/extensions/scaled-ui-amount) (display-only scaling and conversion caution); [Solana getGenesisHash](https://solana.com/docs/rpc/http/getgenesishash) (cluster identity RPC). The onchain observations used public `https://api.mainnet-beta.solana.com` RPC with `confirmed` commitment. The Raydium read used the existing [verifier source](../packages/solana/src/acquisition-pool.ts); the Meteora read used `getMultipleAccountsInfoAndContext`, SPL Token mint decoding, and installed SDK `DLMM.create` **without** quote or swap calls. Public RPC state may change immediately. The separately owned, uncommitted Meteora implementation files are not proof of a released feature and were not changed or staged for this note.

### SDK-independent pool identity recheck

The original slot `446771766` is a historical observation, **not** an archived RPC response available from a clean checkout. The following dependency-free Node 24 script issues only `getGenesisHash` and one `getMultipleAccounts` request to recheck the five fixed Meteora addresses at a **new** `confirmed` context slot. It decodes the observed 904-byte pool layout (`status` offset 82; X/Y mint offsets 88/120; X/Y reserve offsets 152/184), standard SPL mint decimals (offset 44), and standard token-account mint/authority/raw amount (offsets 0/32/64). These offsets are an identity-inspection recipe cross-checked with the SDK decode, **not** a sufficient production parser or an account-authority proof for transaction signing. The script prints fresh observations; values and slot may differ from the table above. Any missing account, owner/mint/authority mismatch, unknown layout, RPC error, or different genesis is a failed recheck, not a prompt to substitute a nearby pool.

A separate recheck with this exact script on 2026-09-14 returned slot `446773347`, all specified identities and raw reserves matching the earlier table. This is **new live state**, not a reproduction of the historical slot; the script imports no package from the working tree.

```js
// Copy this block to standard input of: node --input-type=module
const rpc = 'https://api.mainnet-beta.solana.com';
const ids = [
  'F4inHs4RQARpASmvLpj45QjGLdkukeGQrtQ22pimVy2a', // DLMM pool
  'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', // NVDAx mint
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint
  '86FWMceL1zy5agA4HxyDAZxRHR86Ky7D6AhDL8VXtvsY', // X reserve
  'GZj4nNXEZ67eEvbvKzkRc8aSrS2EGH2mu2hmUA3UTeBr', // Y reserve
];
async function call(method, params = []) {
  const response = await fetch(rpc, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(JSON.stringify(body.error));
  return body.result;
}
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes) {
  let n = BigInt(`0x${Buffer.from(bytes).toString('hex')}`);
  let value = '';
  while (n) { value = alphabet[Number(n % 58n)] + value; n /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; value = `1${value}`; }
  return value || '1';
}
const genesis = await call('getGenesisHash');
if (genesis !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') throw new Error('wrong genesis');
const { context, value } = await call('getMultipleAccounts', [ids, { encoding: 'base64', commitment: 'confirmed' }]);
if (value.length !== ids.length || value.some((account) => !account)) throw new Error('missing account');
const bytes = value.map((account) => Buffer.from(account.data[0], 'base64'));
const pool = bytes[0];
if (pool.length !== 904 || pool.subarray(0, 8).toString('hex') !== '210b3162b565b10d') throw new Error('unknown pool layout');
const address = (data, offset) => base58(data.subarray(offset, offset + 32));
const observed = {
  genesis, slot: context.slot, poolOwner: value[0].owner, statusByte82: pool[82],
  mintX: address(pool, 88), mintY: address(pool, 120),
  reserveX: address(pool, 152), reserveY: address(pool, 184),
  mints: [1, 2].map((i) => ({ owner: value[i].owner, decimals: bytes[i][44] })),
  reserves: [3, 4].map((i) => ({ owner: value[i].owner, mint: address(bytes[i], 0),
    authority: address(bytes[i], 32), raw: bytes[i].readBigUInt64LE(64).toString() })),
};
if (observed.poolOwner !== 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'
  || observed.statusByte82 !== 0
  || observed.mintX !== ids[1] || observed.mintY !== ids[2]
  || observed.reserveX !== ids[3] || observed.reserveY !== ids[4]
  || observed.mints[0].owner !== 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
  || observed.mints[1].owner !== 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  || observed.mints[0].decimals !== 8 || observed.mints[1].decimals !== 6
  || observed.reserves[0].owner !== 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
  || observed.reserves[1].owner !== 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  || observed.reserves[0].mint !== ids[1] || observed.reserves[1].mint !== ids[2]
  || observed.reserves.some((reserve) => reserve.authority !== ids[0])) throw new Error('pool identity mismatch');
console.log(JSON.stringify(observed, null, 2));
```
