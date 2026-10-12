import 'dotenv/config';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { Address, beginCell, toNano } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const T90 = Address.parse('UQBrE6BRPvZkBH47rHGfL7TmepeakX--unodq9I_K6f7BA3p');

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const jetton = client.open(new GSTDJetton(V2J));

    const dwAddr = await jetton.getGetWalletAddress(deployer.address);
    const dw = client.open(new GSTDJettonWallet(dwAddr));
    const dwData = await dw.getGetWalletData();
    const deployerBal = Number(dwData.balance) / 1e9;
    console.log('deployer JW:', dwAddr.toString());
    console.log('deployer GSTD balance:', deployerBal);

    const T90JW = await jetton.getGetWalletAddress(T90);
    console.log('T90 jetton wallet:', T90JW.toString());
    let t90Deployed = false;
    try {
        const tw = client.open(new GSTDJettonWallet(T90JW));
        const d = await tw.getGetWalletData();
        console.log('T90 JW already deployed, balance:', Number(d.balance) / 1e9);
        t90Deployed = true;
    } catch { console.log('T90 JW not deployed yet'); }

    if (deployerBal < 25) {
        console.error('deployer has < 25 GSTD, cannot transfer');
        process.exit(1);
    }

    console.log('sending 25 GSTD deployer -> T90 (deploys T90 JW on receive)...');
    await dw.send(deployer.sender(kp.secretKey), { value: toNano('0.1') }, {
        $$type: 'Transfer',
        queryId: BigInt(Date.now()),
        amount: BigInt('25') * BigInt('1000000000'),
        destination: T90,
        responseDestination: deployer.address,
        customPayload: null,
        forwardTonAmount: toNano('0.05'),
        forwardPayload: beginCell().storeUint(0, 32).endCell().asSlice(),
    });
    console.log('transfer sent, waiting 20s for chain...');
    await new Promise(r => setTimeout(r, 20000));

    try {
        const tw = client.open(new GSTDJettonWallet(T90JW));
        const d = await tw.getGetWalletData();
        console.log('T90 JW deployed! balance:', Number(d.balance) / 1e9, 'GSTD');
    } catch { console.log('T90 JW still not readable...'); }
    console.log('done');
})().catch(e => { console.error('ERR:', String(e).slice(0, 200)); process.exit(1); });
