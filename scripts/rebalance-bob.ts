// rebalance-bob.ts - BOB device wallet sends 0.5 testnet TON to the deployer.
// DESKTOP drained below the rebalance floor (0.33 TON, could not cover 0.4);
// BOB is fresh (seqno 0, 1.0 TON). Testnet only. The estate pays its own gas.
import 'dotenv/config';
import { internal, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const bk = await mnemonicToPrivateKey((process.env.WALLET_BOB_MNEMONIC || '').trim().split(' '));
    const bw = client.open(WalletContractV4.create({ publicKey: bk.publicKey, workchain: 0 }));
    const dkp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const depW = WalletContractV4.create({ publicKey: dkp.publicKey, workchain: 0 });
    const seqno = await bw.getSeqno();
    const bal = await client.getBalance(bw.address);
    console.log('BOB seqno', seqno, '| balance', Number(bal) / 1e9, 'TON');
    await bw.sendTransfer({
        secretKey: bk.secretKey,
        seqno,
        messages: [internal({ to: depW.address, value: toNano('0.5'), body: undefined })],
    });
    console.log('rebalance sent: BOB seqno', seqno, '-> deployer 0.5 TON');
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
