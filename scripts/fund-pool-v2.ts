// fund-pool-v2.ts - send 1,000,000 perimeter-v2 GSTD to the v2 SettlementMaster.
// The first pool funding rode the script's SETTLEMENT constant = the V1 master,
// stranding 1M GSTD in v1's jetton wallet (found by the zero-delta assertion).
import 'dotenv/config';
import { Address, beginCell, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const jetton = client.open(new GSTDJetton(Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0')));
    const v2settle = Address.parse('EQCfxtmiNx-D5kYFy2xWqlEIYYeU3hMpwY9fRo3ROaiKxF86');
    const dwAddr = await jetton.getGetWalletAddress(deployer.address);
    const dw = client.open(new GSTDJettonWallet(dwAddr));
    await dw.send(deployer.sender(kp.secretKey), { value: toNano('0.1') }, {
        $$type: 'Transfer',
        queryId: BigInt(Date.now()),
        amount: BigInt('1000000') * BigInt('1000000000'),
        destination: v2settle,
        responseDestination: deployer.address,
        customPayload: null,
        forwardTonAmount: toNano('0.01'),
        forwardPayload: beginCell().storeUint(0, 32).endCell().asSlice(),
    });
    console.log('v2 pool funding sent: 1,000,000 GSTD ->', v2settle.toString());
})().catch(e => { console.error('ERR', String(e && e.message).slice(0, 150)); process.exit(1); });
