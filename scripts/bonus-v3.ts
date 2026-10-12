// bonus-v3.ts - the GSTD bonus leg against SettlementMaster v3 (the opcode fix
// build). Fires SettleTask (taskId fresh, bonus 25 GSTD, computeUnits 25 so the
// cap = exactly 25 GSTD), polls DESKTOP's v2-jetton wallet for the delta.
// Balance-reader law: verdict from the wallet getter, never a txHash.
import 'dotenv/config';
import { Address, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const V3S = Address.parse('EQBaW5BqIePGNstaJI8ECwoTMju_e6Ta-4NNrAlwfScYnePI');
const NANO = BigInt('1000000000');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function walletGstd(client: TonClient, jetton: any, owner: Address): Promise<number> {
    const wa = await jetton.getGetWalletAddress(owner);
    const jw = client.open(new GSTDJettonWallet(wa));
    try { return Number((await jw.getGetWalletData()).balance) / 1e9; } catch { return -1; }
}

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const jetton = client.open(new GSTDJetton(V2J));
    const settlement = client.open(new SettlementMaster(V3S));

    const poolAddr = await jetton.getGetWalletAddress(V3S);
    const pool = client.open(new GSTDJettonWallet(poolAddr));
    console.log('v3 pool GSTD before:', Number((await pool.getGetWalletData()).balance) / 1e9);

    const desktop = Address.parse('UQBX4TEs0dCvV7CzDpUmj04niFPVd0jjbCfhquO8dPxxa3BJ');
    const before = await walletGstd(client, jetton, desktop);
    console.log('DESKTOP GSTD before:', before);

    await settlement.send(deployer.sender(kp.secretKey), { value: toNano('0.2') }, {
        $$type: 'SettleTask',
        taskId: BigInt('53001101506'),
        workerAddr: desktop,
        gstdBonusAmount: BigInt('25') * NANO,
        qualityScore: BigInt(9000),
        computeUnits: BigInt('25'),
    });
    console.log('SettleTask sent to v3 (taskId 53001101506, bonus 25 GSTD, CU 25)');

    let after = before;
    for (let i = 0; i < 16; i++) {
        await sleep(15000);
        after = await walletGstd(client, jetton, desktop);
        console.log('  poll', i + 1, '- DESKTOP GSTD:', after);
        if (after > before) break;
    }
    console.log(after > before
        ? 'VERDICT: BONUS LEG PROVEN ON V3 - worker received ' + (after - before) + ' GSTD. The opcode fix works.'
        : 'VERDICT: bonus not visible after 4 min - pull v3 tx history next');
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
