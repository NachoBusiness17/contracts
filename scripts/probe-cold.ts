// probe-cold.ts - the 0.15 gas fix falsifier: settle a bonus to a NEVER-DEPLOYED
// worker wallet. Expected under the fix: the master's bonus send (0.15 TON,
// tact opcode) deploys the worker's jetton wallet inside the TEP-74 transfer and
// lands exactly the bonus. The TON worker share (bounce:true) bounces off the
// uninitialized account by design - the probe measures the JETTON leg only.
// The probe wallet's key was discarded at generation; it is receive-only.
import 'dotenv/config';
import { Address, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const V3S = Address.parse('EQCsHsGiIpXjYqwweQ4uLNb82g1On85k1itZ2o_XGmTdAhDB');
const NANO = BigInt('1000000000');
const COLD = Address.parse('UQB_ttfZYSm7noXctGl-gwyM4-lLzsvNaWrGfvP92ABu_Qqn');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const jetton = client.open(new GSTDJetton(V2J));
    const settlement = client.open(new SettlementMaster(V3S));

    const jwAddr = await jetton.getGetWalletAddress(COLD);
    console.log('cold worker:', COLD.toString());
    console.log('cold jetton wallet (pre):', jwAddr.toString(), '- should not exist yet');

    await settlement.send(deployer.sender(kp.secretKey), { value: toNano('0.2') }, {
        $$type: 'SettleTask',
        taskId: BigInt('53001101602'),
        workerAddr: COLD,
        gstdBonusAmount: BigInt('25') * NANO,
        qualityScore: BigInt(9000),
        computeUnits: BigInt('25'),
    });
    console.log('SettleTask sent (taskId 53001101600, cold worker, bonus 25 GSTD)');

    let bal = -1;
    for (let i = 0; i < 16; i++) {
        await sleep(15000);
        try {
            const jw = client.open(new GSTDJettonWallet(jwAddr));
            bal = Number((await jw.getGetWalletData()).balance) / 1e9;
            console.log('  poll', i + 1, '- cold jetton wallet GSTD:', bal);
            if (bal >= 25) break;
        } catch {
            console.log('  poll', i + 1, '- jetton wallet still undeployed');
        }
    }
    console.log(bal >= 25
        ? 'VERDICT: COLD-WORKER PROBE PASSED - bonus send deployed the jetton wallet and landed ' + bal + ' GSTD. The 0.3 gas build survives cold workers.'
        : 'VERDICT: COLD-WORKER PROBE FAILED - bonus did not land on a cold wallet (check ownJettonWallet wiring, taskId replay, and gas margin).');
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
