// deploy_perimeter_wallets.js - initialize the perimeter device wallets.
// Why: SettlementMaster pays workers with bounce:true; a bounce:true transfer
// to an UNINITIALIZED account bounces back (the 2026-10-10 first settle's
// payment legs bounced: wallets had keypairs but no deployed contract).
// Deploy = signed external message carrying the wallet's state_init.
// Prints public values only (address, deploy result); mnemonics stay in .env.
require('dotenv/config');
const { TonClient, WalletContractV4 } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

const ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const DEVICES = (process.argv[2] || 'DESKTOP,BOB,T90').split(',').map(s => s.trim()).filter(Boolean);

(async () => {
    const client = new TonClient({ endpoint: ENDPOINT, apiKey: process.env.TON_API_KEY || '' });
    for (const device of DEVICES) {
        const mn = (process.env[`WALLET_${device}_MNEMONIC`] || '').trim();
        if (!mn) { console.log(`${device}: no mnemonic in .env, skipped`); continue; }
        const kp = await mnemonicToPrivateKey(mn.split(' '));
        const w = WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 });
        let seqno = 0;
        try { seqno = await w.getSeqno(client); } catch { seqno = 0; } // uninit throws
        if (seqno > 0) { console.log(`${device}: ${w.address.toString()} already deployed (seqno ${seqno})`); continue; }
        try {
            // @ton/ton v15 idiom: open() + sendTransfer with seqno 0 and no
            // messages; the SDK attaches the wallet's state_init when the
            // account is not yet deployed (the deploy transaction).
            const opened = client.open(w);
            await opened.sendTransfer({ secretKey: kp.secretKey, seqno: 0, messages: [] });
            await new Promise(r => setTimeout(r, 8000));
            const info = await client.getContractState(w.address);
            console.log(`${device}: ${w.address.toString()} deploy sent -> state ${info.state}`);
        } catch (e) {
            console.log(`${device}: ${w.address.toString()} deploy error: ${String(e && e.message).slice(0, 120)}`);
        }
    }
})();
