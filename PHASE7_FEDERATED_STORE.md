# Phase 7 design: the federated knowledge store (perimeter proposal)

**Author:** NachoBusiness17 (perimeter co-contributor) · 2026-10-12 · companion to PR #1
**Status:** design doc for the roadmap's Phase 7 ("federated learning and shared knowledge store - proposed design, not implemented"). This is the proposed design, from a system that runs it daily at estate scale.

## The pattern in one line

Every node keeps its own append-only knowledge ledger; knowledge propagates between nodes as **deltas against a frozen base**, never as wholesale copies; every claim carries a sealed pointer back to the bytes that produced it; reputation gates who may write to shared surfaces.

## The four organs (all running today on the author's estate)

1. **The ledger (per node).** Each worker appends rows locally: per-task answers, agreement rates, payout deltas (see `scripts/settle-consensus.ts` + `reputation.jsonl` in this PR). The ledger is the learning instrument the roadmap's Phase 4 wants - it accumulates per model per shape and is importable by any router.
2. **Base + drift (the sync protocol).** A coordinator freezes a snapshot of "what we know so far" (the base). Each worker reports only how its view DIFFERS (the drift). Wrong snapshot IDs are rejected; stale bases are re-frozen on a cadence. Nodes never gossip in a chat as the source of truth - "chat is smoke; saved notes are the real logs."
3. **Sealed pointers (the citation layer).** Every claim in a drift note points back to the artifact bytes that produced it (file path + hash). A claim without a pointer is a rumor; the store treats rumors as invisible. This is what makes the store auditable by strangers - the property Phase 4's verification wants.
4. **Reputation-gated writes (the admission layer).** Who may append to a shared store is a function of settled-task reputation (the `workerReputation` map this PR adds to SettlementMaster). New workers write to their own ledger freely; shared-surface writes unlock as reputation accrues. Trust is earned on-chain, not granted by an admin.

## What federated learning means here (Phase 7's LoRA leg)

The LoRA pipeline (Phase 3, working) produces adapters per node. The federated step is the same base+drift protocol at the weight level: nodes publish adapter deltas with their settled-task evidence attached; consumers merge adapters weighted by the publisher's reputation. Never merge unverified weights - the same prove-before-merge discipline as prove-before-pay.

## Why this and not a shared database

A shared database is a capture point: whoever runs it owns the memory. The delta protocol means no node holds more than its own ledger plus the bases it chose to accept; any node can leave with everything it contributed and rebuilt state. The store is the federation, not the server. (The roadmap's own principle, from the token design: no admin key.)

## Babystep ladder to Phase 7

1. Reputation ledger per node (done - `reputation.jsonl` in this PR).
2. Reputation on-chain (done - `workerReputation` map in SettlementMaster, PR #1).
3. Base freeze + drift note format (a JSON schema; half a day).
4. Drift acceptance endpoint with snapshot-ID rejection (the settlement rail's shape, reused).
5. Sealed-pointer citation format (file path + sha256; the receipt convention, formalized).
6. Federated LoRA merge with reputation-weighted averaging (last; only after 1-5 are receipted).

## Falsifier

If a two-node pilot cannot rebuild a third node's knowledge view from bases + drift notes alone (no direct copy, no shared database), the design is wrong and the failure should be filed as loudly as a win.
