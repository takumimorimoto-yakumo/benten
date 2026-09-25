---
id: local-project-authority
title: Bound local implementation work to one Benten-owned project
date: 2026-09-22
status: activation-pending
tags: [operations, local-development, authority]
repos: [benten]
---

# Bound local implementation work to one Benten-owned project

## Context

Benten is being implemented for a public hackathon across multiple dependent work items. The work needs one durable parent identity so planning, dependencies, validation evidence, rework and session handoff remain attached to the same product outcome instead of becoming unrelated task lists.

This public decision records only Benten's product purpose and authority boundary. Private operator identity, local storage paths, access material and orchestration configuration do not belong in this repository.

## Decision

Benten may have one local implementation Project named `Benten Hackathon Local Implementation`. The accountable local orchestration owner is established only in the reviewed private Project binding; this public product decision does not name or mint that private identity.

The Project scope is:

- repository: `benten`;
- management domain: `benten.hackathon-local-implementation`;
- purpose: complete the accepted local hackathon implementation through explicit Plans and WorkItems with dependencies, acceptance criteria and evidence;
- allowed effects: source, test, build and local-runtime changes inside the accepted implementation scope;
- cross-owner dependencies: references to the responsible external owner only, without copying its implementation or authority into Benten.

The Project does not authorize deployment, publication, contest submission, permission changes, deletion, funding, financial execution, wallet connection, signature, transaction submission or third-party writes. Current snapshot/read-only and no-sign/no-send constraints remain in force unless a later decision and fresh authority explicitly change them.

Project registration must use an owner-minted identifier, version and digest. A missing, stale, ambiguous or mismatched parent remains non-executable. Plans and WorkItems must retain this exact Project binding and their own owner, dependencies and acceptance criteria. A conversation, branch, session or generated receipt-shaped file is not a substitute for owner readback.

## Activation gate

`status: activation-pending` means this document is reviewable product authority, not permission to create or activate a runtime Project. Registration requires a separate current-user approval of the private local authority profile. That approval must preserve unrelated Projects and must not expose private configuration in this public repository.

## Revocation and history

Removing the private local profile stops new operations. Existing Project, Plan and WorkItem records remain immutable history; revocation does not imply archive or deletion. Public deployment and submission remain separate decisions even after local work completes.
