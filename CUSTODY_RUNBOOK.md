# CUSTODY RUNBOOK — GSTD keys, backup, recovery (2026-10-14)

Pour 3 of foundations week (2026-10-13): "custody runbook written + mnemonic
backup flow executed + two-machine split documented." Closes RED-lane threat 2
(launch brief 2026-10-13): "Single-operator key custody, no documented
backup/multisig."

**This document carries zero secrets.** Every mnemonic lives in machine-local
`.env` files only (T0 tier — never printed, never committed, never remote).
Addresses and ROLES are listed here because a custody plan you can't read
aloud is not a plan.

## 1. Key inventory (what exists, what it controls)

| Key (env name) | Address | Network | Role | Lives in |
|---|---|---|---|---|
| `DEPLOYER_MNEMONIC` | `EQAzwrijfvQn2xBL5YhZwf5GoBQaINAt6Nbd6LF67bFpuUiz` | testnet | deployer + owner + gateway of v3/v6/v7 masters; pays settles | desktop `reference/gstdcoin/contracts/.env` |
| `WALLET_DESKTOP_MNEMONIC` | `UQBX4TEs0dCvV7CzDpUmj04niFPVd0jjbCfhquO8dPxxa3BJ` | testnet | desktop cell worker wage wallet | same `.env` |
| `WALLET_BOB_MNEMONIC` | `UQAW3wO8TwzoBuOjA-XwCivj80eKhRzGAWl_PgkzUUUlbe5m` | testnet | bob cell worker wage wallet | same `.env` |
| `WALLET_T90_*` | `UQBrE6BRPvZkBH47rHGfL7TmepeakX--unodq9I_K6f7BA3p` | testnet | t90 cell worker wage wallet | same `.env` |
| `MAINNET_DEPLOYER_MNEMONIC` | `EQDLZt7OU6mFsUq96WfdexSXgGHOQPpsQPScAa6ukT3yTsgG` | **mainnet** | rung-1 deployer (the ~5 TON funding target) | desktop `.env`, staged, UNFUNDED |
| `MAINNET_MASTER_FLOAT_MNEMONIC` | `EQBVBkIqqwVJfI_hs_G-TcKEeQkAp3k3rgpwhBOL6YqxZFLT` | **mainnet** | master float reserve (the greed-law float lives here) | desktop `.env`, staged, UNFUNDED |

Contract addresses (no keys, controlled BY the keys above): testnet masters
v6 `EQDw9oXa...` (production cron) and v7 `EQCteLhG...` (soak), jetton v2
`EQCgvt0MR...`, TreasuryGold `EQAYhNII...`. Mainnet: nothing deployed.

**Custody truth (honest):** every key above sits in ONE `.env` on ONE machine.
The estate is single-key custody with a documented split plan, not yet a
split reality. That is acceptable for testnet and for an UNFUNDED mainnet
staging — it is NOT acceptable the moment real TON lands at the mainnet
deployer. Section 3 is the gate that fires before funding.

## 2. The laws this runbook enforces (already banked)

- **Regenerate-refusal** (2026-10-13 staging): the mainnet mnemonics are
  generated once, straight to `.env`, never printed to stdout or logs.
  Re-running the generator refuses if a mnemonic already exists.
- **Never reuse testnet mnemonics on mainnet.** Testnet keys retire forever
  at the mainnet cut (DEPLOY_MAINNET.md precondition).
- **Never commit mnemonics.** The md_record seal + pre-push gates catch
  key-shaped strings in changed files; the Mapbox-token incident
  (mag-public, 2026-10-12, auto-strip-and-resume, no bypass) is the proof
  the class is real and the gate works. A mnemonic in any watched surface
  is an immediate rotate-and-sweep incident.
- **T0 tier** (CONSTITUTION): mnemonics never leave the machine in any pack,
  prompt, receipt, or remote ask. Diagnosis of a key problem names the key,
  never quotes it.

## 3. The backup flow (the one pour genuinely the operator's hands)

Do this BEFORE funding the mainnet deployer. ~20 minutes.

1. **Paper first (the disaster copy).** For each of the two MAINNET keys
   only: write the 24 words by hand on paper, one key per sheet, word
   numbers included. Do not photograph, do not type them anywhere. Seal and
   hide the two sheets in different physical places. Paper survives disk
   death, ransomware, and lost passwords; it dies only to fire and forgetters.
2. **Encrypted digital copy (the usable copy).** Create an age/7z archive of
   a file containing the two mainnet mnemonics, encrypted with a passphrase
   that is NOT stored on this machine (the operator holds it in his head):
   `7z a -p gstd_mainnet_keys.7z <keys file>` — then move the archive to a
   USB stick and, if available, to bob's machine over the tailnet (never to
   any cloud drive; the whole point is no third party).
3. **Verify the backup (a backup is a hypothesis until restored).** On bob
   (or any second machine): restore the archive with the passphrase, derive
   the addresses from the restored mnemonics with a CLEAN tool run, and
   confirm both match `EQDLZt7OU6...` and `EQBVBkIq...`. Then shred the
   working copies on that machine (`shred`/`sdelete`, not delete). Record
   the drill date in the fire-sequence checklist.
4. **Only then** does the funding transfer to `EQDLZt7OU6...` happen.

Testnet keys: no offline backup required (they retire at mainnet cut; their
loss costs testnet TON, which is free). The desktop `.env` is still the only
copy — treat its accidental deletion as a testnet-reset event, not a crisis.

## 4. Two-machine split (current state + target)

- **Now:** desktop holds all keys and does all signing (drain bridge, settles,
  deploys). bob is compute-only: it runs the consensus battery over SSH and
  holds NO keys by design. t90 same. This is the right default — the wage
  wallets are the only keys that could ever live on a worker, and they don't.
- **Target at mainnet funding:** deployer + float mnemonics get the paper +
  encrypted-USB backup (section 3) and one encrypted copy on bob. Desktop
  keeps signing day-to-day; bob's copy is disaster recovery only, restored
  only in a drill or an incident.
- **Wage wallets are sacrificial.** A worker wallet compromise costs that
  wallet's accrued wages (bounded by the claim threshold — wages claim
  frequently and sit small). Never hold reserves in a worker wallet; the
  greed law and the float wallet exist so they never need to.

## 5. Recovery procedures

- **Desktop machine lost / `.env` destroyed:** testnet — regenerate fresh
  keys, redeploy, re-point the drain (hours, $0). Mainnet (after section 3):
  restore from paper or the bob copy, sweep balances to the recovered
  deployer, rotate the float if compromise is suspected.
- **Suspected mnemonic compromise:** sweep first, rotate second — new keys,
  transfer all balances, abandon the old addresses. A compromised master
  contract's owner can be re-pointed via DAO/gateway messages only if the
  OLD key still works; if it doesn't, the contract's funds drain at the
  contract level (that is what the band floor bounds) and the replacement
  is a fresh deploy. This is the known cost of owner-as-DAO-staging; the
  DAOVoting takeover (already in the deployment record's pendingActions)
  is the structural fix.
- **Accidental commit of a mnemonic:** rotate immediately (sweep + abandon),
  then force-push-strip; treat ANY exposure window as live. The 2026-10-12
  Mapbox incident is the drill: Push Protection caught it, auto-strip,
  resume, no bypass, receipt filed.

## 6. What this runbook does NOT solve (named, not hidden)

- **No multisig yet.** The mainnet deployer is a single signature. The
  roadmap: DAOVoting as owner (contracts exist on testnet), then a
  vesting/timelock on treasury moves. Until then the band floor + float cap
  bound the blast radius: the master never holds more than 10 TON, the
  float wallet is the only large balance, and it moves rarely.
- **No hardware wallet.** TON hardware support is thin; the paper + encrypted
  split is the honest substitute until a multisig exists.
- **bob's copy is encrypted-at-rest only as strong as the passphrase.** The
  passphrase lives in exactly one place: the operator's head. That is a
  feature (no $5 wrench proof) and a risk (head loss). The paper sheets are
  the head-loss recovery.

Runbook owner: the seat maintains this file; the operator owns section 3.
Change law: amend-dated-blocks, never rewrite history (the record law).
