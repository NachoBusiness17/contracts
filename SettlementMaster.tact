// ============================================================================
// SettlementMaster Contract — Economic Heart of GSTD
// ============================================================================
// Receives task payments, splits 85/10/5:
//   85% → Worker Node (TON)
//   10% → Ecosystem Treasury (buybacks)
//    5% → Protocol Buyback & Burn
// Also triggers GSTD bonus minting for workers.
// ============================================================================

import "@stdlib/deploy";
import "@stdlib/ownable";

// ── Messages ────────────────────────────────────────────────────────────────

message SettleTask {
    taskId: Int as uint64;
    workerAddr: Address;
    gstdBonusAmount: Int as coins; // GSTD tokens to mint as bonus
    qualityScore: Int as uint32; // 0-10000 (2 decimal places)
    computeUnits: Int as uint64;
}

message WorkerPayment {
    taskId: Int as uint64;
    amount: Int as coins;
    bonusGSTD: Int as coins;
}

message UpdateShares {
    worker: Int as uint8;
    treasury: Int as uint8;
    protocol: Int as uint8;
}

message UpdateAddresses {
    treasury: Address;
    protocolFee: Address;
    gstdJetton: Address;
}

message MintWorkerReward {
    workerAddr: Address;
    amount: Int as coins;
    taskId: Int as uint64;
}

message SetBaseRate {
    rate: Int as coins; // nanoGSTD per compute unit
}

message EmergencyPause {
    paused: Bool;
}

message SetGateway {
    gateway: Address;
}

message SetOwnJettonWallet {
    wallet: Address; // SM's own GSTD jetton wallet (pre-funded by admin)
}

// ── Settlement Master Contract ──────────────────────────────────────────────

contract SettlementMaster with Deployable, Ownable {
    // ── Configuration ───────────────────────────────────────────────────
    owner: Address; // DAO governance contract
    gateway: Address; // Gateway/Orchestrator that initiates settlements
    gstdJetton: Address; // GSTDJetton master contract
    treasury: Address; // TreasuryGold contract
    protocolFee: Address; // Buyback & Burn contract

    // ── Revenue split (must sum to 100) ─────────────────────────────────
    workerShare: Int as uint8; // 85%
    treasuryShare: Int as uint8; // 10%
    protocolShare: Int as uint8; //  5%

    // ── Economics ────────────────────────────────────────────────────────
    baseRate: Int as coins; // nanoGSTD per compute unit
    totalSettled: Int as coins; // total TON settled
    totalGSTDMinted: Int as coins; // total GSTD sent to workers (from pool, not minted)
    taskCount: Int as uint64;
    // SM's own GSTD jetton wallet — set by admin after deploy, pre-funded with reward pool
    ownJettonWallet: Address;

    // ── Relay-skip observability (2026-10-13 amendment) ────────────────
    // Count of bonuses deferred because the master's balance could not cover
    // the 0.3 TON relay. Previously these vanished silently (SendIgnoreErrors).
    deferredBonusCount: Int as uint32;

    // ── Replay / double-settlement guard ─────────────────────────────────
    settledTasks: map<Int, Bool>; // taskId => true; prevents paying same task twice
    workerReputation: map<Address, Int>; // worker address => settled task count (Phase 4 reputation, perimeter babystep 2)

    // ── Circuit breaker ─────────────────────────────────────────────────
    paused: Bool;
    minPayment: Int as coins; // Minimum TON per settlement

    init(
        owner: Address,
        gstdJetton: Address,
        treasury: Address,
        protocolFee: Address,
    ) {
        self.owner = owner;
        self.gateway = owner; // initially owner is also gateway; set separately later
        self.gstdJetton = gstdJetton;
        self.treasury = treasury;
        self.protocolFee = protocolFee;

        self.workerShare = 85;
        self.treasuryShare = 10;
        self.protocolShare = 5;

        // baseRate init: 1 GSTD per CU. The shipped default (1,000,000 nano =
        // 0.001 GSTD/CU) caps every real bonus to dust via maxAllowedBonus =
        // baseRate * computeUnits: a 25 GSTD bonus with computeUnits 25 was
        // silently cut to 0.025 GSTD (receipted on testnet 2026-10-11,
        // fixed live via SetBaseRate on the perimeter deployment).
        self.baseRate = 1000000000;
        self.totalSettled = 0;
        self.totalGSTDMinted = 0;
        self.taskCount = 0;

        self.paused = false;
        self.minPayment = ton("0.05"); // effective minimum payment after gas reserve (total = value - 0.1 TON gas)
        self.ownJettonWallet = newAddress(0, 0); // set via SetOwnJettonWallet after deploy
        self.deferredBonusCount = 0;
    }

    // ── DAO: Set gateway address ─────────────────────────────────────────
    receive(msg: SetGateway) {
        require(sender() == self.owner, "Only DAO");
        self.gateway = msg.gateway;
    }

    // ── Main Settlement Function ────────────────────────────────────────
    // Called by Gateway/Orchestrator with TON payment attached
    receive(msg: SettleTask) {
        require(sender() == self.owner || sender() == self.gateway, "Only DAO or Gateway can settle");
        require(!self.paused, "Settlement paused");
        require(msg.workerAddr != newAddress(0, 0), "Worker address cannot be zero");

        // ── Replay guard: each taskId can only be settled once ───────────
        require(self.settledTasks.get(msg.taskId) == null, "Task already settled");
        self.settledTasks.set(msg.taskId, true);

        // Gas reserve: 0.1 TON kept for gas + nested sends. Actual minimum call value = 0.15 TON.
        require(context().value > ton("0.1"), "Insufficient value for gas reserve");
        let total: Int = context().value - ton("0.1");
        require(total >= self.minPayment, "Payment below minimum");

        // Calculate shares
        let workerAmt: Int = total * self.workerShare / 100;
        let treasuryAmt: Int = total * self.treasuryShare / 100;
        let protocolAmt: Int = total - workerAmt - treasuryAmt; // remainder

        // ── Cap computeUnits to prevent overflow in bonus calculation ────
        let safeComputeUnits: Int = msg.computeUnits;
        if (safeComputeUnits > 1000000000) { safeComputeUnits = 1000000000; } // 1B CU max

        // ── Cap bonus before stats update ───────────────────────────────
        let maxAllowedBonus: Int = self.baseRate * safeComputeUnits;
        let actualBonus: Int = msg.gstdBonusAmount;
        if (actualBonus > maxAllowedBonus) { actualBonus = maxAllowedBonus; }

        // ── Update statistics BEFORE sends (prevent race conditions) ────
        self.totalSettled += total;
        self.totalGSTDMinted += actualBonus;
        self.taskCount += 1;

        // ── Reputation: per-worker settled-task count (Phase 4 babystep 2) ─
        // Null-guard first-time workers: a bare !! on a missing row aborts
        // the whole SettleTask (receipted: first probe after this change
        // self-refunded until this guard landed).
        let rep: Int = 0;
        if (self.workerReputation.get(msg.workerAddr) != null) {
            rep = self.workerReputation.get(msg.workerAddr)!!;
        }
        self.workerReputation.set(msg.workerAddr, rep + 1);

        // ── 1. Pay worker (85% TON) — bounce:true to recover on failure ─
        send(SendParameters {
            to: msg.workerAddr,
            value: workerAmt,
            mode: SendIgnoreErrors,
            bounce: true,
            body: WorkerPayment {
                taskId: msg.taskId,
                amount: workerAmt,
                bonusGSTD: msg.gstdBonusAmount,
            }.toCell(),
        });

        // ── 2. Send to Ecosystem Treasury (10%) ────────────────────────
        send(SendParameters {
            to: self.treasury,
            value: treasuryAmt,
            mode: SendIgnoreErrors,
            bounce: false,
            body: "deposit".asComment(),
        });

        // ── 3. Protocol Fee (5% → Buyback & Burn) ──────────────────────
        send(SendParameters {
            to: self.protocolFee,
            value: protocolAmt,
            mode: SendIgnoreErrors,
            bounce: false,
            body: "buyback".asComment(),
        });

        // ── 4. Transfer GSTD bonus to worker from pre-funded pool ──────────
        // Jetton Transfer with the opcode this repo's GSTDJettonWallet actually
        // matches. Root cause 2026-10-11: the wallet's receive(msg: Transfer)
        // compiles to tact's generated header 1435380091 (GSTDJettonWallet.abi),
        // NOT the TEP-74 standard 0xf8a7ea5 (2507683173) - three settles hit the
        // pool wallet and were silently ignored, out_msgs 0, funds retained.
        // Upstream TEP-74 compliance fix: declare message(0xf8a7ea5) Transfer in
        // GSTDJetton.tact (requires jetton migration); this in-place fix speaks
        // the wallet's compiled dialect instead.
        // Gas: 0.3 TON. Probe receipt 2026-10-11: 0.15 covers warm workers only -
        // a NEVER-DEPLOYED worker jetton wallet needs deploy gas inside the
        // TEP-74 transfer and 0.15 bounced it (probe-cold.ts, taskId
        // 53001101600, wallet undeployed after 4 min). 0.3 gives the pool
        // wallet room for transfer_internal + receiver state_init deploy +
        // the 0.01 forward.
        // ── 2026-10-13 amendment (relay-skip root cause, closed) ───────────
        // Scorecard receipt: settles at 03:20/04:18/04:34/10:30/11:20 on
        // 2026-10-12 skipped this bonus relay deterministically - not
        // intermittent. SendIgnoreErrors silently no-ops a send when the
        // remaining balance cannot cover value + fees, so on a low master the
        // bonus vanished with no trace. Fix: check myBalance() against the
        // relay value plus a gas margin BEFORE sending. On insufficiency the
        // bonus is deferred (not dropped): a BonusDeferred notice goes to the
        // owner with the taskId, and deferredBonusCount rises. The skip is
        // now an observable event and the pool top-up is attributable.
        let relayGasNeeded: Int = ton("0.3") + ton("0.05"); // relay value + fee margin
        if (actualBonus > 0 && self.ownJettonWallet != newAddress(0, 0) && myBalance() >= relayGasNeeded) {
            send(SendParameters {
                to: self.ownJettonWallet,
                value: ton("0.3"),
                mode: SendIgnoreErrors,
                bounce: false,
                body: beginCell()
                    .storeUint(1435380091, 32)     // Transfer opcode (tact header, matches GSTDJettonWallet.abi)
                    .storeUint(msg.taskId, 64)      // queryId
                    .storeCoins(actualBonus)         // amount
                    .storeAddress(msg.workerAddr)    // destination
                    .storeAddress(msg.workerAddr)    // response_destination
                    .storeBit(false)                 // no custom payload
                    .storeCoins(ton("0.01"))         // forward_ton_amount (notify worker)
                    .storeBit(false)                 // no forward payload
                    .endCell(),
            });
        } else {
            if (actualBonus > 0) {
                // Deferred, not dropped: observable notice to the owner
                // (the party who can refill the pool), plus a durable counter.
                self.deferredBonusCount = self.deferredBonusCount + 1;
                send(SendParameters {
                    to: self.owner,
                    value: ton("0.01"),
                    mode: SendIgnoreErrors,
                    bounce: false,
                    body: "BonusDeferred".asComment(),
                });
            }
        }
    }

    // ── Handle bounced worker payments (return TON to settlement pool) ──
    bounced(src: bounced<WorkerPayment>) {
        // Worker payment failed (invalid address). TON returns here.
        // Re-add to treasury as fallback
        send(SendParameters {
            to: self.treasury,
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors,
            bounce: false,
            body: "bounced_worker_payment".asComment(),
        });
    }

    // ── Admin: Set SM's own GSTD jetton wallet ──────────────────────────
    // Call once after deploy. Wallet address = compute_jetton_wallet(SM_address, gstdJetton).
    // Then transfer GSTD to that wallet as the worker reward pool.
    receive(msg: SetOwnJettonWallet) {
        require(sender() == self.owner, "Only DAO");
        self.ownJettonWallet = msg.wallet;
    }

    // ── DAO Governance: Update revenue split ────────────────────────────
    receive(msg: UpdateShares) {
        require(sender() == self.owner, "Only DAO");
        require(msg.worker + msg.treasury + msg.protocol == 100, "Must sum to 100");
        require(msg.worker >= 50, "Worker share minimum 50%");

        self.workerShare = msg.worker;
        self.treasuryShare = msg.treasury;
        self.protocolShare = msg.protocol;
    }

    // ── DAO: Update contract addresses ──────────────────────────────────
    receive(msg: UpdateAddresses) {
        require(sender() == self.owner, "Only DAO");
        self.treasury = msg.treasury;
        self.protocolFee = msg.protocolFee;
        self.gstdJetton = msg.gstdJetton;
    }

    // ── DAO: Update base rate ───────────────────────────────────────────
    receive(msg: SetBaseRate) {
        require(sender() == self.owner, "Only DAO");
        require(msg.rate > 0, "Rate must be positive");
        self.baseRate = msg.rate;
    }

    // ── Emergency pause ─────────────────────────────────────────────────
    receive(msg: EmergencyPause) {
        require(sender() == self.owner, "Only DAO");
        self.paused = msg.paused;
    }

    // ── Getters ─────────────────────────────────────────────────────────
    get fun get_settlement_stats(): SettlementStats {
        return SettlementStats {
            totalSettled: self.totalSettled,
            totalGSTDMinted: self.totalGSTDMinted,
            taskCount: self.taskCount,
            baseRate: self.baseRate,
        };
    }

    // Phase 4 reputation: settled-task count per worker (perimeter babystep 2)
    get fun worker_reputation(worker: Address): Int {
        return self.workerReputation.get(worker)!!;
    }

    // Relay-skip observability (2026-10-13 amendment): bonuses deferred for
    // low master balance. Count > 0 means the pool needs a top-up.
    get fun deferred_bonus_count(): Int {
        return self.deferredBonusCount;
    }

    get fun get_revenue_split(): RevenueSplit {
        return RevenueSplit {
            worker: self.workerShare,
            treasury: self.treasuryShare,
            protocol: self.protocolShare,
        };
    }

    get fun get_addresses(): ContractAddresses {
        return ContractAddresses {
            gstdJetton: self.gstdJetton,
            treasury: self.treasury,
            protocolFee: self.protocolFee,
            owner: self.owner,
        };
    }

    get fun is_paused(): Bool {
        return self.paused;
    }
}

// ── Data structures ─────────────────────────────────────────────────────────

struct SettlementStats {
    totalSettled: Int as coins;
    totalGSTDMinted: Int as coins;
    taskCount: Int as uint64;
    baseRate: Int as coins;
}

struct RevenueSplit {
    worker: Int as uint8;
    treasury: Int as uint8;
    protocol: Int as uint8;
}

struct ContractAddresses {
    gstdJetton: Address;
    treasury: Address;
    protocolFee: Address;
    owner: Address;
}
