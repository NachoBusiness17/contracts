// read-v3.ts - read v3 settlement state, pool wallet, deployer wallet. Read-only.
import 'dotenv/config';
import { Address, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const V3S = Address.parse('EQBaW5BqIePGNstaJI8ECwoTMju_e6Ta-4NNrAlwfScYnePI');

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const jetton = client.open(new GSTDJetton(V2J));
    const settlement = client.open(new SettlementMaster(V3S));

    const stats = await settlement.getGetSettlementStats();
    console.log('v3 baseRate:', stats.baseRate.toString(), '| totalSettled:', stats.totalSettled.toString(), '| tasks:', stats.taskCount.toString());

    const poolAddr = await jetton.getGetWalletAddress(V3S);
    console.log('v3 pool wallet:', poolAddr.toString());
    try {
        const pool = client.open(new GSTDJettonWallet(poolAddr));
        const d = await pool.getGetWalletData();
        console.log('pool GSTD:', Number(d.balance) / 1e9);
    } catch { console.log('pool wallet: NOT DEPLOYED'); }

    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const dwAddr = await jetton.getGetWalletAddress(deployer.address);
    try {
        const dw = client.open(new GSTDJettonWallet(dwAddr));
        const dd = await dw.getGetWalletData();
        console.log('deployer jetton wallet GSTD:', Number(dd.balance) / 1e9);
    } catch { console.log('deployer jetton wallet: NOT DEPLOYED'); }
    const bal = await client.getBalance(deployer.address);
    console.log('deployer TON:', Number(bal) / 1e9);
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
