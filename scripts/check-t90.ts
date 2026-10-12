import 'dotenv/config';
import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const T90 = Address.parse('UQBrE6BRPvZkBH47rHGfL7TmepeakX--unodq9I_K6f7BA3p');

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const jetton = client.open(new GSTDJetton(V2J));
    const T90JW = await jetton.getGetWalletAddress(T90);
    console.log('T90 JW:', T90JW.toString());
    try {
        const tw = client.open(new GSTDJettonWallet(T90JW));
        const d = await tw.getGetWalletData();
        console.log('T90 JW balance:', Number(d.balance) / 1e9, 'GSTD');
    } catch { console.log('T90 JW: not deployed or unreadable'); }
})().catch(e => { console.error('ERR:', String(e).slice(0, 200)); process.exit(1); });
