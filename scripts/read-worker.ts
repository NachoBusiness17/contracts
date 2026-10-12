// read-worker.ts - read DESKTOP's v2-jetton balance. Read-only.
import 'dotenv/config';
import { Address, TonClient } from '@ton/ton';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const DESKTOP = Address.parse('UQBX4TEs0dCvV7CzDpUmj04niFPVd0jjbCfhquO8dPxxa3BJ');

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const jetton = client.open(new GSTDJetton(V2J));
    const wa = await jetton.getGetWalletAddress(DESKTOP);
    const jw = client.open(new GSTDJettonWallet(wa));
    const d = await jw.getGetWalletData();
    console.log('DESKTOP jetton wallet:', wa.toString());
    console.log('DESKTOP GSTD:', Number(d.balance) / 1e9);
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
