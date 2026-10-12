// deploy_perimeter_wallets_internal.js - deploy the perimeter device wallets
// by INTERNAL transfer from the deployer, carrying each wallet's state_init.
// (toncenter 500s external-to-uninit deploys; the internal faucet pattern
// cannot be refused: message carries init + value, account deploys funded.)
require('dotenv/config');
const { toNano, TonClient, WalletContractV4 } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

const ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const DEVICES = (process.argv[2] || 'DESKTOP,BOB,T90').split(',').map(s => s.trim()).filter(Boolean);

(async () => {
    const client = new TonClient({ endpoint: ENDPOINT, apiKey: process.env.TON_API_KEY || '' });
    const dm = (process.env.DEPLOYER_MNEMONIC || '').trim();
    if (!dm) { console.error('FATAL: DEPLOYER_MNEMONIC missing'); process.exit(2); }
    const dkp = await mnemonicToPrivateKey(dm.split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: dkp.publicKey, workchain: 0 }));
    const seqno = await deployer.getSeqno();
    console.log('deployer seqno:', seqno);
    const messages = [];
    for (const device of DEVICES) {
        const mn = (process.env[`WALLET_${device}_MNEMONIC`] || '').trim();
        if (!mn) { console.log(`${device}: no mnemonic, skipped`); continue; }
        const kp = await mnemonicToPrivateKey(mn.split(' '));
        const w = WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 });
        let deployed = false;
        try { deployed = (await w.getSeqno(client)) > 0; } catch { deployed = false; }
        if (deployed) { console.log(`${device}: ${w.address.toString()} already deployed`); continue; }
        messages.push({ to: w.address, value: toNano('0.05'), init: w.init, body: undefined });
        console.log(`${device}: queued internal deploy -> ${w.address.toString()}`);
    }
    if (messages.length) {
        await deployer.sendTransfer({ secretKey: dkp.secretKey, seqno, messages });
        await new Promise(r => setTimeout(r, 10000));
        for (const m of messages) {
            const info = await client.getContractState(m.to);
            console.log(`${m.to.toString()}: state ${info.state}`);
        }
    }
})();
