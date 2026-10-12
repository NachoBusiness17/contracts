// settle-consensus.ts - Phase 4 babystep 1: the consensus-to-payment bridge.
//
// Settles a consensus run on SettlementMaster v3 ONLY IF the caller certifies
// verdict=STRUCTURE (passed explicitly as an argument; the caller reads the
// run's summary.json in the open before invoking - this tool intentionally has
// no file access, so every settle input is visible in the invoking command).
//
// Usage:
//   npx ts-node --project tsconfig.deploy.json scripts/settle-consensus.ts \
//     --verdict STRUCTURE --consensus 0.667 --correct 0.667 \
//     --run consensus-20261011T235008Z --node desktop-7c70ksc
//
// The verification instrument gates the money: a run that is not STRUCTURE
// (dead-salmon control not beaten, taskbank degenerate) pays nothing.
import 'dotenv/config';
import { Address, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const V3S = Address.parse('EQDw9oXaR1lmwaVJdJFYA2heY11ktvdS0Jsdnee7Qqxur_g8');
const NANO = BigInt('1000000000');
const NODE_WALLETS: Record<string, string> = {
    'desktop-7c70ksc': 'UQBX4TEs0dCvV7CzDpUmj04niFPVd0jjbCfhquO8dPxxa3BJ',
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function arg(name: string): string {
    const i = process.argv.indexOf('--' + name);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : '';
}

async function walletGstd(client: TonClient, jetton: any, owner: Address): Promise<number> {
    const wa = await jetton.getGetWalletAddress(owner);
    const jw = client.open(new GSTDJettonWallet(wa));
    try { return Number((await jw.getGetWalletData()).balance) / 1e9; } catch { return -1; }
}

(async () => {
    const verdict = arg('verdict');
    const runId = arg('run') || 'unnamed-run';
    const nodeId = arg('node') || 'desktop-7c70ksc';
    const consensus = arg('consensus') || '0';
    const correct = arg('correct') || '0';
    console.log('run:', runId, '| verdict:', verdict, '| consensus:', consensus, '| correct:', correct);

    if (verdict !== 'STRUCTURE') {
        console.log('PAYMENT REFUSED - verdict must be STRUCTURE. The instrument did not certify this run; the rail does not pay.');
        process.exit(3);
    }

    const workerStr = NODE_WALLETS[nodeId];
    if (!workerStr) { console.error('no wallet mapped for node', nodeId); process.exit(2); }
    const worker = Address.parse(workerStr);

    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const jetton = client.open(new GSTDJetton(V2J));
    const settlement = client.open(new SettlementMaster(V3S));

    const before = await walletGstd(client, jetton, worker);
    const taskId = BigInt('53001' + String(Date.now()).slice(-6));

    // Reputation-gated quality (Phase 4 babystep 3): the settle's qualityScore
    // reads the worker's on-chain reputation from the master and adds up to
    // +250 pts (25 per settled task, capped at 10 tasks) on top of the run's
    // consensus-correct rate. Reputation is earned on-chain, read on-chain.
    let reputation = 0;
    try { reputation = Number(await settlement.getWorkerReputation(worker)); } catch { reputation = 0; }
    const base = Math.round(parseFloat(correct) * 10000);
    const qualityScore = Math.min(10000, base + Math.min(reputation, 10) * 25);
    console.log('verdict certified - settling', runId, '| worker:', nodeId, '| taskId:', taskId.toString());
    console.log('reputation read:', reputation, '| qualityScore:', qualityScore, '(base', base, '+ reputation bonus', Math.min(reputation, 10) * 25 + ')');

    await settlement.send(deployer.sender(kp.secretKey), { value: toNano('0.2') }, {
        $$type: 'SettleTask',
        taskId,
        workerAddr: worker,
        gstdBonusAmount: BigInt('25') * NANO,
        qualityScore: BigInt(qualityScore),
        computeUnits: BigInt('25'),
    });

    let after = before;
    for (let i = 0; i < 16; i++) {
        await sleep(15000);
        after = await walletGstd(client, jetton, worker);
        console.log('  poll', i + 1, '- worker GSTD:', after);
        if (after > before) break;
    }
    console.log(after > before
        ? 'VERDICT: PHASE4 BABYSTEP1 PROVEN - consensus-certified run settled, worker +' + (after - before) + ' GSTD'
        : 'VERDICT: settle not visible after 4 min - pull v3 tx history next');
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
