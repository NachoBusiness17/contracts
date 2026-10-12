// rebalance-t90.ts - T90 device wallet sends 0.5 testnet TON to the deployer.
// BOB drained below its own rebalance floor (0.5033 could not cover 0.5 + fees);
// T90 is fresh (seqno 0, 0.99 TON). Testnet only. The estate pays its own gas.
import 'dotenv/config';
import { internal, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const tk = await mnemonicToPrivateKey((process.env.WALLET_T90_MNEMONIC || '').trim().split(' '));
    const tw = client.open(WalletContractV4.create({ publicKey: tk.publicKey, workchain: 0 }));
    const dkp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const depW = WalletContractV4.create({ publicKey: dkp.publicKey, workchain: 0 });
    const seqno = await tw.getSeqno();
    const bal = await client.getBalance(tw.address);
    console.log('T90 seqno', seqno, '| balance', Number(bal) / 1e9, 'TON');
    await tw.sendTransfer({
        secretKey: tk.secretKey,
        seqno,
        messages: [internal({ to: depW.address, value: toNano('0.5'), body: undefined })],
    });
    console.log('rebalance sent: T90 seqno', seqno, '-> deployer 0.5 TON');
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
