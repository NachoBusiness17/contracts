// print-wallet-addresses.ts - verify mnemonic-to-address bindings for the
// perimeter wallets. Prints ONLY public addresses and on-chain seqno/balance.
import 'dotenv/config';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

const EXPECTED: Record<string, string> = {
    WALLET_DESKTOP_MNEMONIC: 'UQBX4TEs0dCvV7CzDpUmj04niFPVd0jjbCfhquO8dPxxa3BJ',
    WALLET_BOB_MNEMONIC: 'UQAW3wO8TwzoBuOjA-XwCivj80eKhRzGAWl_PgkzUUUlbe5m',
    WALLET_T90_MNEMONIC: 'UQBrE6BRPvZkBH47rHGfL7TmepeakX--unodq9I_K6f7BA3p',
};

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    for (const [varName, expected] of Object.entries(EXPECTED)) {
        const mn = (process.env[varName] || '').trim();
        if (!mn) { console.log(varName, ': MISSING in env'); continue; }
        try {
            const kp = await mnemonicToPrivateKey(mn.split(' '));
            const w = WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 });
            const derived = w.address.toString({ bounceable: false });
            const ok = derived === expected;
            let seqno = '?'; let bal = '?';
            try { seqno = String(await client.open(w).getSeqno()); } catch { seqno = 'undeployed'; }
            try { bal = String(Number(await client.getBalance(w.address)) / 1e9); } catch { bal = '?'; }
            console.log(varName.replace('WALLET_', '').replace('_MNEMONIC', ''), '| derived:', derived, '| match:', ok ? 'YES' : 'NO (expected ' + expected + ')', '| seqno:', seqno, '| TON:', bal);
        } catch (e) {
            console.log(varName, ': mnemonic parse FAILED -', String(e).slice(0, 80));
        }
    }
})().catch(e => { console.error('ERR:', String(e).slice(0, 200)); process.exit(1); });
