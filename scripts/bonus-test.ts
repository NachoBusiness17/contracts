// bonus-test.ts - the GSTD bonus leg end to end, on-chain reads only.
// 1. read the pool (SettlementMaster v2 jetton wallet) balance via the getter
// 2. fire SettleTask with a 25 GSTD bonus to DESKTOP
// 3. poll DESKTOP's v2 jetton wallet balance up to 4 min; print the delta verdict
import 'dotenv/config';
import { Address, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const V2S = Address.parse('EQCfxtmiNx-D5kYFy2xWqlEIYYeU3hMpwY9fRo3ROaiKxF86');
const NANO = BigInt('1000000000');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function walletGstd(client: TonClient, jetton: any, owner: Address): Promise<number> {
    const wa = await jetton.getGetWalletAddress(owner);
    const jw = client.open(new GSTDJettonWallet(wa));
    try { return Number((await jw.getGetWalletData()).balance) / 1e9; } catch { return -1; } // uninit = -1
}

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const jetton = client.open(new GSTDJetton(V2J));

    const poolAddr = await jetton.getGetWalletAddress(V2S);
    let poolGstd = -1;
    try {
        const pool = client.open(new GSTDJettonWallet(poolAddr));
        poolGstd = Number((await pool.getGetWalletData()).balance) / 1e9;
    } catch { poolGstd = -1; }
    console.log('pool on-chain GSTD:', poolGstd);

    const desktop = Address.parse('UQBX4TEs0dCvV7CzDpUmj04niFPVd0jjbCfhquO8dPxxa3BJ');
    const before = await walletGstd(client, jetton, desktop);
    console.log('DESKTOP GSTD before:', before);

    if (poolGstd !== null && poolGstd >= 0.000001) {
        const settlement = client.open(new SettlementMaster(V2S));
        await settlement.send(deployer.sender(kp.secretKey), { value: toNano('0.2') }, {
            $$type: 'SettleTask',
            taskId: BigInt('53001101501'),
            workerAddr: desktop,
            gstdBonusAmount: BigInt('25') * NANO,
            qualityScore: BigInt(9000),
            computeUnits: BigInt('25'),
        });
        console.log('SettleTask sent (taskId 53001101501, bonus 25 GSTD)');
        let after = before;
        for (let i = 0; i < 16; i++) {
            await sleep(15000);
            after = await walletGstd(client, jetton, desktop);
            console.log('  poll', i + 1, '- DESKTOP GSTD:', after);
            if (after > before) break;
        }
        console.log(after > before
            ? 'VERDICT: GSTD BONUS LEG PROVEN - worker received ' + (after - before) + ' GSTD'
            : 'VERDICT: bonus not visible after 4 min - pool or sequencing still open');
    } else {
        console.log('VERDICT: pool empty on-chain - funding transfer did not reach it');
    }
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
