// fund-master-v6.ts - the deployer sends 1 TON to SettlementMaster v6.
// Why: the bonus jetton send pays 0.3 TON FROM THE MASTER'S BALANCE; each
// settle brings only 0.2 in and pays ~0.1 out in splits, so every bonus
// settle bleeds the master ~0.2 TON. When the master runs dry, the bonus
// send is silently skipped (SendIgnoreErrors) - receipted 2026-10-12 as the
// drain-anomaly root cause: the master starves, the worker never sees the
// bonus. Law: fund the master's TON, or the bonus is a silent skip.
import 'dotenv/config';
import { Address, internal, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

const V6 = Address.parse('EQDw9oXaR1lmwaVJdJFYA2heY11ktvdS0Jsdnee7Qqxur_g8');

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const bal = Number(await client.getBalance(V6)) / 1e9;
    console.log('v6 master TON before:', bal);
    const seqno = await deployer.getSeqno();
    await deployer.sendTransfer({
        secretKey: kp.secretKey,
        seqno,
        messages: [internal({ to: V6, value: toNano('0.4'), body: undefined })],
    });
    console.log('funding sent: deployer seqno', seqno, '-> v6 master 0.4 TON');
    for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 10000));
        const now = Number(await client.getBalance(V6)) / 1e9;
        console.log('  poll', i + 1, '- v6 master TON:', now);
        if (now > bal + 0.2) { console.log('VERDICT: master funded'); return; }
    }
    console.log('VERDICT: funding not visible after 80s');
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
