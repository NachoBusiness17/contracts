// print-deployer-address.ts - derive the deployer address from DEPLOYER_MNEMONIC.
// Prints ONLY the public address, seqno, and balance. Never prints the mnemonic.
import 'dotenv/config';
import { toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const w = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const seqno = await w.getSeqno();
    const bal = await client.getBalance(w.address);
    console.log('deployer v4 address:', w.address.toString({ bounceable: false }));
    console.log('  bounceable form   :', w.address.toString({ bounceable: true }));
    console.log('  seqno:', seqno, '| balance:', Number(bal) / 1e9, 'TON');
})().catch(e => { console.error('ERR:', String(e).slice(0, 300)); process.exit(1); });
