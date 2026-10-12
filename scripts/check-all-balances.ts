import 'dotenv/config';
import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const DEPLOYER = Address.parse('EQAzwrijfvQn2xBL5YhZwf5GoBQaINAt6Nbd6LF67bFpuUiz');

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const jetton = client.open(new GSTDJetton(V2J));
    const dwAddr = await jetton.getGetWalletAddress(DEPLOYER);
    console.log('deployer JW:', dwAddr.toString());
    try {
        const dw = client.open(new GSTDJettonWallet(dwAddr));
        const d = await dw.getGetWalletData();
        console.log('deployer GSTD balance:', Number(d.balance) / 1e9);
    } catch { console.log('deployer JW unreadable'); }
    const T90 = Address.parse('UQBrE6BRPvZkBH47rHGfL7TmepeakX--unodq9I_K6f7BA3p');
    const twAddr = await jetton.getGetWalletAddress(T90);
    console.log('T90 JW address:', twAddr.toString());
    try {
        const tw = client.open(new GSTDJettonWallet(twAddr));
        const d = await tw.getGetWalletData();
        console.log('T90 GSTD balance:', Number(d.balance) / 1e9);
    } catch { console.log('T90 JW: not deployed'); }
})().catch(e => { console.error('ERR:', String(e).slice(0, 200)); process.exit(1); });
