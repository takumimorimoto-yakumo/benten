---
id: agent-first-investing
title: Make the investor's own evidence-bound agent the Benten product center
date: 2026-09-17
status: decided
tags: [product, agent, investing, mobile, safety]
repos: [benten]
plan_start: 2026-09-17
plan_end: 2026-09-17
---

# Make the investor's own evidence-bound agent the product center

## Context

Benten is a public hackathon product. Its differentiator is not another market-data screen or a game that encourages more trading. The user has chosen an **investor-owned agent** as the product center: it helps one person investigate public evidence, turn that person's own symbol, budget and conditions into a source-linked order draft, and explain what changed since the person's last review.

This decision fixes product direction and repository ownership. It does not claim that an AI model, tool loop, order-draft schema, monitoring service or agent-first UI exists. Current public API/MCP/UI behavior remains facts-only and snapshot/read-only; current code remains no-sign/no-send. The separately planned purchase path remains subject to its implementation, review and activation gates.

## Decision

The target journey is:

1. the investor supplies a symbol or instrument, budget and their own conditions;
2. an AI research layer uses only approved public facts and produces a cited, explicitly non-binding draft with unknowns and missing evidence preserved;
3. deterministic validators independently resolve identity, rights, units, budget arithmetic, route policy, amount, fees, minimum receive and expiry;
4. any change after review invalidates the prior approval and requires a fresh exact review;
5. the investor alone authorizes the reviewed transaction in their wallet;
6. deterministic tools reconcile the known result and resulting holding without asking model prose to decide success;
7. on a later visit, the product shows source-backed changes since the prior review and which of the investor's own conditions need attention.

AI output is a **draft**, never execution authority or a validation result. A model cannot choose an unreviewed instrument, silently change amount or allocation, promote an unavailable route, sign, send, retry, declare finality or turn an unknown outcome into success. A template or prerecorded fixture is prototype evidence only. Any claim that the agent works requires an identified live model-and-tool path plus source-linked output from the reviewed public allowlist; deterministic safety and execution evidence remain separate.

The agent is personal to the investor but does not become discretionary management, a robo-adviser, a custodian or an autonomous spending service. The investor supplies the objective and constraints and makes the final wallet decision. Product issuance, pooled third-party capital, management of another person's funds and reusable delegated spending remain separate products outside this decision.

## Learning and game boundary

Paper practice may help users understand identity, rights, reference value versus executable quote, fees, stale evidence and unknown transaction outcomes. Reflection can reward completing a review, noticing missing evidence and correcting a mistaken assumption.

It must not reward trading frequency, realized or simulated P/L ranking, turnover, streaks, urgency, impulsive purchases or social competition. Paper holdings and outcomes must remain visually and semantically separate from real holdings and real execution. Gamification is supporting pedagogy, not the product loop.

## Public product and private-data boundary

Benten product code, UI, product-specific agent orchestration and public-safe contracts stay in this public repository. Reusable long-lived connectivity remains behind its existing generic owner boundary and is consumed only through reviewed public-safe contracts. This public ownership decision does not expose private analysis, credentials, model-provider keys, wallet-linked holdings, allocation drafts, prompts containing private state, receipts or signed transaction bytes.

Repository publicity is not an instruction to change remote visibility, push, deploy, publish, submit or trade. Those remain separately authorized external actions. Secrets do not enter a client bundle or Git history. User-private state remains local unless a later privacy contract explicitly defines consent, retention, deletion and an approved server purpose.

## Required next design before affected work starts

The next detailed design must close, review and bind at least:

- the exact external-model field allowlist, informed consent, provider retention/training terms and deletion behavior;
- prompt-injection and untrusted-content isolation, source allowlists, tool authorization and output provenance;
- strict research request, cited draft and deterministic tool schemas, including unknown-field and unavailable behavior;
- exact decimal/raw-unit budget and amount arithmetic, and fresh approval after any post-review mutation;
- private thesis, portfolio, draft and receipt storage boundaries;
- monitoring cadence, change baseline, cancellation and the difference between “not checked” and “no change”;
- model/version selection, cost ceiling, rate limits, timeout, cancellation and provider outage behavior;
- agent-first information architecture, user comprehension, accessibility, independent visual QA and human acceptance;
- same-revision integration evidence that rebinds agent output, deterministic validation, wallet approval and reconciliation without inheriting an older UI or purchase proof.

Until that design is accepted, do not dispatch affected AI orchestration or agent-first UI work from older screen plans. Existing independent work on facts, strict contracts, no-effect fixtures and the core transaction safety boundary may continue; this decision does not freeze unrelated foundations.

## Relationship to existing decisions

- [Mobile client platform](mobile-client-platform.md) controls the accepted Web-deadline then native sequence; it does not prove an agent runtime.
- [User-authorized browser execution](user-authorized-browser-execution.md) controls the narrow human wallet path and remains plan-only/currently disabled.
- [Agent spending authorization](agent-spend-authorization.md) continues to prohibit Benten custody, autonomous grants and server-side spending authority.
- [Mobile investing implementation plan](../../specs/mobile-investing-implementation-plan.md) remains the broader delivery plan, with this ADR taking precedence for product center and future AI/UI design.

Changing this direction requires a new user decision. Implementing it requires the separate detailed design and evidence above; `status: decided` is not an implementation or release claim.
