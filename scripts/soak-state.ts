// soak-state.ts - read/verify/move helpers for the v7 soak (tools/gstd_soak.py
// shells this). Modes:
//   state               -> STATE_JSON {masterTon, poolGstd, floor, deferred, taskCount, workerJwGstd}
//   funds               -> TONS_JSON  {deployerTon, desktopTon}
//   send FROM_ENV AMT   -> plain TON transfer to the v7 master, seqno-confirmed
import 'dotenv/config';
import { Address, TonClient, WalletContractV4, internal } from '@ton/ton';
import { toNano } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const MASTER = Address.parse(process.env.GSTD_MASTER_ADDRESS || 'EQCteLhGv7dCLtCtbSK8bs5mxikKF-ckZ11vvf-5WUjpjrLb');
const DESKTOP = Address.parse('UQBX4TEs0dCvV7CzDpUmj04niFPVd0jjbCfhquO8dPxxa3BJ');

const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });

(async () => {
    const mode = process.argv[2] || 'state';

    if (mode === 'state') {
        const s = client.open(new SettlementMaster(MASTER));
        const j = client.open(new GSTDJetton(V2J));
        const poolW = await j.getGetWalletAddress(MASTER);
        const pw = client.open(new GSTDJettonWallet(poolW));
        const wkW = await j.getGetWalletAddress(DESKTOP);
        const wk = client.open(new GSTDJettonWallet(wkW));
        const stats = await s.getGetSettlementStats();
        const dep = await s.getDeferredBonusCount();
        const floor = await s.getMinMasterBalance();
        console.log('STATE_JSON ' + JSON.stringify({
            taskCount: Number(stats.taskCount),
            totalSettled: Number(stats.totalSettled) / 1e9,
            deferred: Number(dep),
            floor: Number(floor) / 1e9,
            masterTon: Number(await client.getBalance(MASTER)) / 1e9,
            poolGstd: Number((await pw.getGetWalletData()).balance) / 1e9,
            workerJwGstd: Number((await wk.getGetWalletData()).balance) / 1e9,
        }));
        return;
    }

    if (mode === 'funds') {
        const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
        const d = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
        let desktopTon = -2;
        try {
            const kp2 = await mnemonicToPrivateKey((process.env.WALLET_DESKTOP_MNEMONIC || '').trim().split(' '));
            const w2 = client.open(WalletContractV4.create({ publicKey: kp2.publicKey, workchain: 0 }));
            desktopTon = Number(await client.getBalance(w2.address)) / 1e9;
        } catch { desktopTon = -2; }
        console.log('TONS_JSON ' + JSON.stringify({
            deployerTon: Number(await client.getBalance(d.address)) / 1e9,
            desktopTon,
        }));
        return;
    }

    if (mode === 'send') {
        const fromEnv = process.argv[3] || 'DEPLOYER_MNEMONIC';
        const amt = process.argv[4] || '1';
        const dest = Address.parse(process.argv[5] || MASTER.toString());
        const kp = await mnemonicToPrivateKey((process.env[fromEnv] || '').trim().split(' '));
        const w = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
        const seqno = await w.getSeqno();
        await w.sendTransfer({
            seqno, secretKey: kp.secretKey,
            messages: [internal({ to: dest, value: toNano(amt), bounce: false })],
        });
        console.log('SENT seqno', seqno);
        // testnet congestion backs the seqno up 2-4 min; poll long enough that
        // an UNCONFIRMED verdict means genuinely stuck, not just slow
        for (let i = 0; i < 24; i++) {
            await new Promise(r => setTimeout(r, 10000));
            if (await w.getSeqno() > seqno) { console.log('REFILL_CONFIRMED'); return; }
        }
        console.log('REFILL_UNCONFIRMED');
        return;
    }

    console.error('unknown mode', mode);
    process.exit(2);
})().catch(e => { console.error('ERR', String(e && e.message).slice(0, 300)); process.exit(1); });
