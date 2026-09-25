---
id: user-authorized-browser-execution
title: Plan a narrow user-authorized browser purchase without custody or autonomous authority
date: 2026-09-16
status: proposed
tags: [security, solana, wallet, execution]
repos: [benten]
supersedes_for_scope: [agent-spend-authorization]
---

# Plan a narrow user-authorized browser purchase without custody or autonomous authority

## Decision

The deadline MVP target now includes one purchase completed inside Benten by the investor: review an exact audited context, explicitly approve it in the user's browser wallet, submit it once from the browser, reconcile the known signature to finality, and verify the resulting holding causally. An external-site handoff, quote-only screen or simulated purchase does not meet that target.

This is a `plan-only` authority decision, not a runtime authorization. The current repository remains snapshot/read-only and no-sign/no-send. A later implementation turn must separately review and change the import policy, build paths and user-facing release state defined by [User-authorized browser execution v1](../../specs/contracts/user-authorized-browser-execution-v1.md). No wallet connection, signature, send, funding or deployment is authorized here.

## Relationship to the prior decision

The prior [agent spending decision](agent-spend-authorization.md) remains controlling for autonomous agents, delegated funds, server signing, custody, provider-held execution authority and Benten order/recovery services. This decision changes only one narrower scope: a present human user may explicitly sign one already reviewed transaction in an isolated browser client and the browser may submit it once to a fixed RPC. It does not create an agent grant, unattended order or server execution service.

Benten owns the investor UI, wallet session, local revalidation, explicit gesture, one-send state machine and client-only receipt. Only its isolated user browser handles signed transaction bytes ephemerally; Benten servers, BFF and the reusable connectivity owner never receive them, and no Benten component sees a private key or keeps a server order ledger. The connectivity owner constructs and audits an unsigned template but never owns the wallet session, signs, sends or claims confirmation. The two repositories exchange only a versioned public-safe contract/artifact.

## P0 and reversal

P0 is exactly one reviewed spend mint, one reviewed stock mint, one selected venue and one exact-input buy. Sell, limit/DCA, automation, multiple venues, arbitrary assets and tool-driven execution are later decisions. PreStocks and Tessera remain comparison/evidence lanes, not purchasable instruments in this MVP. Meteora DBC evidence remains a sponsor proof and is not itself the buy route.

Implementation and activation are separate. Reviewed feature-off code may exist only under `implementation_disabled`. A later `authorized_smoke` uses a non-public user-local receipt to bind wallet and one attempt; server configuration binds only execution-artifact/route/policy/amount/fee/time bounds and stores no wallet or order. It returns to disabled after that attempt. `execution_enabled` is a distinct post-review release state. This plan creates none of those records. If exact route, Token-2022, transaction audit, wallet capability, browser RPC, legal/rights, independent security/runtime QA or funded-smoke evidence is missing, the Buy control stays disabled. Removing purchase P0 and calling the read-only product complete is not an allowed schedule cut; the release/claim decision must instead record that the purchase-complete target was not achieved.

This decision is reversed or redesigned before implementation if a safe flow requires a server signer/relay, delegated authority, opaque transaction mutation, persistent server order state, silent retry, arbitrary provider instructions, an unbounded program/account set, or private-engine imports.
