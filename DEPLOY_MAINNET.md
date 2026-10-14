# MAINNET RUN - the real-TON ladder, rung 1 (staged 2026-10-13, GO: operator)

## What is staged

- Fresh mainnet keys (gen-mainnet-wallet.js, key-law hardened: mnemonic goes
  straight to machine-local .env, never printed; regenerate-refusal built in):
  - MAINNET_DEPLOYER_ADDRESS:  EQDLZt7OU6mFsUq96WfdexSXgGHOQPpsQPScAa6ukT3yTsgG
  - MAINNET_MASTER_FLOAT_ADDRESS: EQBVBkIqqwVJfI_hs_G-TcKEeQkAp3k3rgpwhBOL6YqxZFLT
- Greed law LIVE in tools/gstd_drain.py: --cap-ton 10 (default) refuses a master
  above the cap ("return excess before earning"); --floor-ton 1 (default) refuses
  below the floor - the master must always sit inside [1, 10] TON, outside the
  SendIgnoreErrors silent-drop band (relay-skip root cause, closed 2026-10-13).
- The contracts to deploy: PR #1 versions (bonus opcode fixed, baseRate default,
  gas margin 0.3 for cold-worker deploys, reputation organ, pool speak-our-dialect
  transfer).

## The one thing only the operator can do

Fund the deployer: send ~5 TON on TON mainnet to
EQDLZt7OU6mFsUq96WfdexSXgGHOQPpsQPScAa6ukT3yTsgG
(2 TON deployment fees + 3 TON initial master float). Real money, real loss
risk, bounded by the greed law: the mainnet master never holds more than 10 TON.

## Fire sequence (next sitting, after funding)

1. Deploy GSTDJetton (mainnet endpoint, TON_NETWORK=mainnet) - the token the
   flotilla earns.
2. Deploy SettlementMaster (PR #1 tact source) wired to that jetton + the float
   wallet as pool. Verify getters: get_market_data, worker reputation map.
3. Fund the master with 3 TON from the deployer (bounce:false law).
4. Flip the drain endpoint to mainnet.toncenter.com, CELLS unchanged
   (desktop/bob/t90 ollama doors are network-agnostic).
5. First settle: ONE battery, one settle, verify on the worker jetton wallet's
   transaction LIST per the read-lag law, then loop.

## Preconditions already banked

- Relay-skip: ROOT-CAUSED (SendIgnoreErrors silent drop under low master
  balance; skips cluster in the low-balance band). The greed law keeps the
  master out of that band; the upstream fix (checked send / bonus-deferred
  event) is a PR to file with GB.
- 50+ clean testnet cycles banked; the loop is identical, only endpoint + keys
  change.
- NEVER reuse testnet mnemonics on mainnet. The testnet keys retire forever.
