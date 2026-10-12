// rebalance.ts - DESKTOP device wallet sends 0.4 testnet TON to the deployer.
// Why: the deployer drained below the settle floor mid-perimeter (0.136 TON);
// the estate's own devices rebalance their own treasury (testnet only).
import 'dotenv/config';
import { internal, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const wk = await mnemonicToPrivateKey((process.env.WALLET_DESKTOP_MNEMONIC || '').trim().split(' '));
    const dw = client.open(WalletContractV4.create({ publicKey: wk.publicKey, workchain: 0 }));
    const dkp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const depW = WalletContractV4.create({ publicKey: dkp.publicKey, workchain: 0 });
    const seqno = await dw.getSeqno();
    await dw.sendTransfer({
        secretKey: wk.secretKey,
        seqno,
        messages: [internal({ to: depW.address, value: toNano('0.4'), body: undefined })],
    });
    console.log('rebalance sent: DESKTOP seqno', seqno, '-> deployer 0.4 TON');
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
