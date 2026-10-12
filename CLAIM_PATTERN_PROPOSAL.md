# PROPOSAL: worker-pulled claims (ClaimRewards) - the gas inversion

**Author:** NachoBusiness17 (perimeter co-contributor) · 2026-10-12 · companion to PR #1
**Status:** design + tact sketch, NOT wired into the build. GB's call on the pattern; the sketch is compilable-shaped and receipted against the failure that motivates it.

## The receipted failure this solves

The bonus leg (PR #1's fixes) still starves the payer: the master's bonus send carries **0.3 TON from the master's own balance**, while a settle brings only ~0.2 in and pays ~0.1 in splits - every bonus settle nets the master roughly **-0.2 TON**. Receipted on testnet: three settles fired with the correct inputs (decoded from their own input cells: bonusNano 25000000000, CU 25, baseRate 1e9, ownJettonWallet set) and the bonus silently skipped once the master bled below the send's cost (SendIgnoreErrors, bounce:false - invisible by design). Funded the master +1 TON and the identical settle landed the bonus first poll. The push model structurally starves: the payer pays the freight on its own gift.

## The inversion: workers pull, the master never pays freight

Under the claim model, SettleTask **accrues instead of transfers**: it increments the worker's reward balance in a map (no jetton message, no gas spike, works even when the master's TON is zero). The worker claims on its own schedule with its own gas:

```tact
// accrual (replaces the immediate bonus transfer in SettleTask):
let cur: Int = self.workerRewards.get(msg.workerAddr)!!; // reputation map already exists (PR #1)
self.workerRewards.set(msg.workerAddr, cur + 1);
self.workerRewardsGstd.set(msg.workerAddr,
    (self.workerRewardsGstd.get(msg.workerAddr) ?? 0) + actualBonus);

// claim (the worker pulls - the claimer pays the freight):
message ClaimRewards { queryId: Int as uint64; }
receive(msg: ClaimRewards) {
    let worker = sender();
    let pending = self.workerRewardsGstd.get(worker) ?? 0;
    require(pending > 0, "Nothing to claim");
    self.workerRewardsGstd.set(worker, 0);
    // standard TEP-74 transfer to worker, gas from msg.value
    // (SendRemainingValue so the claimer's attached gas funds the hop)
    self._payout(worker, pending, msg.queryId);
}
```

## What this buys

1. **The master's TON balance stops mattering for bonuses.** The starvation receipt (three silent skips, then first-poll landing after a +1 TON top-up) becomes impossible: no master-balance send exists to starve.
2. **Batching is free and worker-controlled.** A worker that ran 20 certified tasks claims once - one message, one gas payment, N tasks netted. The push model pays freight per task; the pull model pays per withdrawal. The operator's principle verbatim: "use our rewarded currency internally to create the ecosystem" - the accrual map IS the internal currency, on-chain, and the claim is the boundary.
3. **Reputation composes naturally.** workerReputation (this PR) counts settled tasks; workerRewardsGstd accrues the money; a worker's claim strength is both together. Routing can read both getters and gate launches onto proven cells.
4. **Gas griefing ends.** Push model: anyone who can call SettleTask forces the master to spend freight. Pull model: the claimer volunteers its own gas.

## The costs, stated plainly

- Workers need TON to claim (gas) - but they already hold TON shares from settles, and a claim every N tasks amortizes the gas to noise.
- Claims are a new message + a new map - contract surface grows; the audit should cover the accrual/claim pair together.
- Migration: existing accrued bonuses (the pool's 99,950 GSTD) pay out under the old path once, or roll into the map at upgrade.

## Ask

Pattern call is GB's. If the claim model is blessed, this PR's author will draft the full tact diff (accrual swap + ClaimRewards receiver + the perimeter's test battery against it on testnet, same receipts shape as PR #1's verification table).
