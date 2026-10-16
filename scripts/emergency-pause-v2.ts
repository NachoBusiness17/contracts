/**
 * EmergencyPause for SettlementMasterV2 — owner-only circuit breaker.
 *
 * Why: the deployed V2 computes the attestation digest over
 * (taskId, workerAddr, resultHash) only, so a settlement submitter can
 * raise computeUnits / gstdBonusAmount after attestors sign and draw the
 * whole pre-funded GSTD pool (499 GSTD, funded 2026-08-13) through the
 * bonus path. The bonus path is inert today only because SetOwnJettonWallet
 * was never sent; this script pauses settlements outright so the contract
 * stays safe even if that switch is thrown or a second attestor key is
 * registered before a patched redeploy (V3) exists.
 *
 * The fix branch (sign payout fields into the digest) lives at
 * fix/settlement-hardening on the NachoBusiness17/contracts fork. V3 should
 * be deployed from it, then quorum re-opened and the pool migrated.
 *
 * Usage (needs node + build/ artifacts, i.e. the machine that deployed V2):
 *   TON_NETWORK=mainnet DEPLOYER_MNEMONIC="..." \
 *     npx ts-node --project tsconfig.deploy.json scripts/emergency-pause-v2.ts
 *
 * Optional second action in the same run:
 *   EMERGENCY_ACTION=quorum EMERGENCY_QUORUM=5   (also raise quorum threshold)
 *   EMERGENCY_ACTION=unpause                     (lift the pause after V3)
 */

import 'dotenv/config';
import * as readline from 'readline';
import { Address, TonClient, WalletContractV4, toNano } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const TARGET = 'EQCi-QjafvcYE7wgl9Dc5jAFJrmiy_oGfcobzORb2gZQezhE'; // SettlementMasterV2
const EXPECTED_ADMIN = 'UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED';

const NETWORK = process.env.TON_NETWORK || '';
const MNEMONIC = process.env.DEPLOYER_MNEMONIC || '';
const ACTION = process.env.EMERGENCY_ACTION || 'pause'; // pause | unpause | quorum
const QUORUM = Number(process.env.EMERGENCY_QUORUM || '5');

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function waitSeqno(provider: any, seqno: number) {
    for (let i = 0; i < 40; i++) {
        await sleep(3000);
        const cur = await provider.getSeqno();
        if (cur > seqno) return;
    }
    throw new Error('Transaction not confirmed after 120s');
}

function confirm(question: string): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(`${question} (yes/no): `, answer => {
            rl.close();
            resolve(answer.toLowerCase() === 'yes');
        });
    });
}

async function main() {
    if (NETWORK !== 'mainnet') {
        console.error('Refusing to run: TON_NETWORK must be "mainnet". Currently:', NETWORK || '(not set)');
        process.exit(1);
    }
    if (!MNEMONIC) {
        console.error('Missing env var: DEPLOYER_MNEMONIC');
        process.exit(1);
    }
    if (!['pause', 'unpause', 'quorum'].includes(ACTION)) {
        console.error('EMERGENCY_ACTION must be pause | unpause | quorum');
        process.exit(1);
    }

    const client = new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY });
    const keyPair = await mnemonicToPrivateKey(MNEMONIC.split(' '));
    const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const provider = client.open(wallet);
    const senderAddr = wallet.address.toString();

    // Safety: only the V2 owner wallet may drive this contract. Refuse anything else.
    if (senderAddr !== EXPECTED_ADMIN && senderAddr !== Address.parse(EXPECTED_ADMIN).toString()) {
        console.error('Refusing to run: this mnemonic does not control the V2 admin wallet.');
        console.error('  wallet      :', senderAddr);
        console.error('  expected    :', EXPECTED_ADMIN);
        process.exit(1);
    }

    const balance = await client.getBalance(wallet.address);
    console.log(`Admin wallet : ${senderAddr}`);
    console.log(`Balance      : ${Number(balance) / 1e9} TON`);
    if (Number(balance) < toNano('0.1')) {
        console.error('Insufficient balance: need >= 0.1 TON for gas.');
        process.exit(1);
    }

    const target = Address.parse(TARGET);
    const settlement = client.open(new SettlementMaster(target));

    // Read current state so the operator sees what they are changing.
    const pausedBefore = (await client.runMethod(target, 'is_paused')).stack.readNumber();
    const quorumBefore = (await client.runMethod(target, 'get_quorum_threshold')).stack.readNumber();
    console.log(`V2 state     : paused=${pausedBefore === 1} quorumThreshold=${quorumBefore}`);

    if (ACTION === 'pause' && pausedBefore === 1) {
        console.log('Already paused. Nothing to do.');
        process.exit(0);
    }
    if (ACTION === 'unpause' && pausedBefore !== 1) {
        console.log('Already unpaused. Nothing to do.');
        process.exit(0);
    }

    const what = ACTION === 'quorum' ? `raise quorum threshold to ${QUORUM}` : `${ACTION} settlements`;
    const ok = await confirm(`Send ${what} to SettlementMasterV2 ${TARGET}?`);
    if (!ok) { console.log('Aborted.'); process.exit(0); }

    let seqno = await provider.getSeqno();

    if (ACTION === 'quorum') {
        await settlement.send(provider.sender(keyPair.secretKey), { value: toNano('0.05') }, {
            $$type: 'SetQuorumThreshold',
            threshold: BigInt(QUORUM),
        });
    } else {
        await settlement.send(provider.sender(keyPair.secretKey), { value: toNano('0.05') }, {
            $$type: 'EmergencyPause',
            paused: ACTION === 'pause',
        });
    }
    await waitSeqno(provider, seqno++);

    // Read back and report the truth, not the intent.
    const pausedAfter = (await client.runMethod(target, 'is_paused')).stack.readNumber();
    const quorumAfter = (await client.runMethod(target, 'get_quorum_threshold')).stack.readNumber();
    console.log(`After        : paused=${pausedAfter === 1} quorumThreshold=${quorumAfter}`);
    if (ACTION === 'pause' && pausedAfter !== 1) {
        console.error('PAUSE DID NOT LAND - investigate before assuming the contract is safe.');
        process.exit(1);
    }
    console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
