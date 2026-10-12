import 'dotenv/config';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { Address, internal, toNano } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const dk = await mnemonicToPrivateKey((process.env.WALLET_DESKTOP_MNEMONIC || '').trim().split(' '));
    const dw = client.open(WalletContractV4.create({ publicKey: dk.publicKey, workchain: 0 }));
    const dpk = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const dep = WalletContractV4.create({ publicKey: dpk.publicKey, workchain: 0 });
    const seqno = await dw.getSeqno();
    const bal = Number(await client.getBalance(dw.address)) / 1e9;
    console.log('DESKTOP seqno:', seqno, '| balance:', bal, 'TON');
    await dw.sendTransfer({
        secretKey: dk.secretKey,
        seqno,
        messages: [internal({ to: dep.address, value: toNano('1'), body: undefined })],
    });
    console.log('funding sent: DESKTOP -> deployer 1 TON');
    const depBal = await client.getBalance(dep.address);
    console.log('deployer TON before:', Number(depBal) / 1e9);
})().catch(e => { console.error('ERR:', String(e).slice(0, 200)); process.exit(1); });
