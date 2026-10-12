// read-worker.ts - read DESKTOP's v2-jetton balance. Read-only.
import 'dotenv/config';
import { Address, TonClient } from '@ton/ton';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const TARGETS: Record<string, string> = {
    'UQBX4TEs0dCvV7CzDpUmj04niFPVd0jjbCfhquO8dPxxa3BJ': 'DESKTOP',
    'UQAW3wO8TwzoBuOjA-XwCivj80eKhRzGAWl_PgkzUUUlbe5m': 'BOB',
    'UQBrE6BRPvZkBH47rHGfL7TmepeakX--unodq9I_K6f7BA3p': 'T90',
    'EQBmsMtOK-54sJ7VxOLCWcmJLJdoHsWcWLdpMKmnbLsAxXMo': 'EQBmsMtOK-mystery',
};
const DESKTOP = Address.parse(process.argv[2] || 'UQBX4TEs0dCvV7CzDpUmj04niFPVd0jjbCfhquO8dPxxa3BJ');

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const jetton = client.open(new GSTDJetton(V2J));
    const wa = await jetton.getGetWalletAddress(DESKTOP);
    const jw = client.open(new GSTDJettonWallet(wa));
    const d = await jw.getGetWalletData();
    console.log('jetton wallet:', wa.toString());
    for (const [nm, addr] of Object.entries(TARGETS)) {
        if (wa.toString() === addr || wa.toString({ bounceable: false }) === addr) console.log('  -> this is', nm, "'s jetton wallet");
    }
    console.log('GSTD balance:', Number(d.balance) / 1e9);
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
