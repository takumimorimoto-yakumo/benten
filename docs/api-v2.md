# Benten v2 JSON API

The optional Profile C JSON API exposes the same structured `PublicResult` as
the v2 MCP tools. It reads only the bundled registry and financial snapshot;
it never makes a financial network request.

## Routes

| Route | Required selector | Optional selector |
| --- | --- | --- |
| `GET /api/v2/fundamentals` | exactly one `ticker` or `mint` | none |
| `GET /api/v2/financials` | exactly one `ticker` or `mint` | one `statement` of `pl`, `bs`, or `cf` |

Query parameters are strict: supported keys occur at most once, `ticker` and
`mint` are mutually exclusive, and no unsupported key is accepted. Missing,
duplicate, combined, or empty selectors return the v2 `invalid_input` result
with HTTP 400 before lookup. Tickers and mints are resolved only by the
registry's exact allowlist functions. A mint must also be a syntactically valid
Solana public key; a malformed mint is `invalid_input`, while a valid but
unregistered mint is `unknown_mint`.

The optional `statement` parameter returns only its named statement. Omitting
it returns `pl`, `bs`, and `cf`. A statement with no current row is a successful
response with `availability: "no_data"`; it is different from a malformed
query.

For financial requests, selector resolution has priority over statement
semantics. A valid but unregistered ticker or mint returns `unknown_ticker` or
`unknown_mint` even when `statement` is invalid. After a known identifier is
resolved, structural ineligibility returns `not_eligible` before statement
validation. For an eligible identifier, an invalid or empty `statement` returns
`invalid_statement` with that identifier's identity and coverage. This ordering
matches the MCP result.

## HTTP mapping

The response body always preserves v2 semantic reasons. HTTP status only makes
client handling conventional:

| Semantic result | HTTP status |
| --- | --- |
| success, `not_eligible`, or `no_data` | 200 |
| `invalid_input` or `invalid_statement` | 400 |
| `unknown_ticker` or `unknown_mint` | 404 |
| `service_unavailable` | 503 |

The unversioned `/api/fundamentals/[ticker]` and
`/api/financials/[ticker]` routes retain their documented legacy envelopes.
