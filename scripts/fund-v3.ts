// fund-v3.ts - fund SettlementMaster v3's jetton pool from the deployer wallet.
// Standalone so it gets its own seqno gate (the deploy script's funding send was
// dropped in the same window as the deploy messages - the ops law: explicit
// gates between sequential fires).
import 'dotenv/config';
import { Address, beginCell, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const V3S = Address.parse('EQBaW5BqIePGNstaJI8ECwoTMju_e6Ta-4NNrAlwfScYnePI');
const NANO = BigInt('1000000000');

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const jetton = client.open(new GSTDJetton(V2J));
    const dwAddr = await jetton.getGetWalletAddress(deployer.address);
    const dw = client.open(new GSTDJettonWallet(dwAddr));
    const before = Number((await dw.getGetWalletData()).balance) / 1e9;
    console.log('deployer wallet GSTD before:', before);

    await dw.send(deployer.sender(kp.secretKey), { value: toNano('0.1') }, {
        $$type: 'Transfer',
        queryId: BigInt(Date.now()),
        amount: BigInt('100000') * NANO,
        destination: V3S,
        responseDestination: deployer.address,
        customPayload: null,
        forwardTonAmount: toNano('0.01'),
        forwardPayload: beginCell().storeUint(0, 32).endCell().asSlice(),
    });
    console.log('funding sent: 100,000 GSTD -> v3 pool');

    for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 10000));
        const poolAddr = await jetton.getGetWalletAddress(V3S);
        const pool = client.open(new GSTDJettonWallet(poolAddr));
        try {
            const bal = Number((await pool.getGetWalletData()).balance) / 1e9;
            console.log('  poll', i + 1, '- v3 pool GSTD:', bal);
            if (bal >= 100000) { console.log('VERDICT: v3 pool funded'); return; }
        } catch { console.log('  poll', i + 1, '- pool wallet not deployed yet'); }
    }
    console.log('VERDICT: pool not funded after 80s - check seqno/retry');
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
