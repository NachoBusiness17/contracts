// set-pool-v4.ts - SetOwnJettonWallet on SettlementMaster v4. The deploy
// script's copy of this message was dropped in the deploy window (fired blind,
// no read-confirm gate), which silently disabled the bonus branch
// (ownJettonWallet == zero address skips the jetton send entirely).
import 'dotenv/config';
import { Address, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const V4 = Address.parse('EQDw9oXaR1lmwaVJdJFYA2heY11ktvdS0Jsdnee7Qqxur_g8');

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const jetton = client.open(new GSTDJetton(V2J));
    const settlement = client.open(new SettlementMaster(V4));
    const poolAddr = await jetton.getGetWalletAddress(V4);
    console.log('v4 pool wallet:', poolAddr.toString());
    await settlement.send(deployer.sender(kp.secretKey), { value: toNano('0.05') }, {
        $$type: 'SetOwnJettonWallet', wallet: poolAddr,
    });
    console.log('SetOwnJettonWallet sent - behaviorally verified by the next cold probe');
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
