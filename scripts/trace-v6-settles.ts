// trace-v6-settles.ts - decode every v6 SettleTask input body: taskId, worker,
// bonus nano, quality, compute units. Read-only. This cracks the drain anomaly:
// settle C (03:20:17, 3 outs, no bonus) vs settle B (02:02:13, 4 outs, +25).
import 'dotenv/config';
import { Address, TonClient } from '@ton/ton';

const V6 = 'EQDw9oXaR1lmwaVJdJFYA2heY11ktvdS0Jsdnee7Qqxur_g8';
const POOL = 'EQBlEZRAEgJMBXeaH9fDc-K6aJvVev4PJhCpJ1yLwJWTS-Dg';

function ton(v: any): number {
    const n = Number(v ?? 0);
    return Math.round(n / 1e9 * 10000) / 10000;
}

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const txs = await client.getTransactions(Address.parse(V6), { limit: 8 });
    for (const tx of txs) {
        const when = new Date((tx.now || 0) * 1000).toISOString().slice(5, 19);
        const inV = ton((tx.inMessage as any)?.info?.value?.coins);
        const src = (tx.inMessage as any)?.source?.toString().slice(0, 12) ?? 'ext';
        let desc = 'unparsed';
        try {
            const b = (tx.inMessage as any).body.beginParse();
            const op = b.loadUint(32);
            if (op === 0x572e9ef8) {
                const tid = b.loadUintBig(64).toString();
                const worker = b.loadAddress().toString().slice(0, 12);
                const bonus = b.loadCoins().toString();
                const quality = b.loadUint(32).toString();
                const cu = b.loadUintBig(64).toString();
                desc = `SettleTask taskId=${tid} worker=${worker} bonusNano=${bonus} quality=${quality} CU=${cu}`;
            } else if (op === 0xd4d7e3ab) {
                desc = 'SetOwnJettonWallet';
            } else if (op === 0xd70e7cef) {
                desc = 'SetBaseRate';
            } else if (op === 0xf4e4f591) {
                desc = 'SetMintAuthority';
            } else {
                desc = 'op=0x' + op.toString(16);
            }
        } catch (e) {
            desc = 'decode error: ' + String(e).slice(0, 60);
        }
        console.log(`${when} | in ${inV} TON from ${src} | ${desc} | out ${tx.outMessages.size}`);
        for (const [, m] of tx.outMessages) {
            const d = ((m as any).destination ?? '').toString().slice(0, 16);
            const v = ton((m.info as any)?.value?.coins);
            console.log(`    -> ${d} ${d === POOL.slice(0, 16) ? '(POOL)' : ''} | ${v} TON`);
        }
    }
})().catch(e => { console.error('ERR:', String(e).slice(0, 300)); process.exit(1); });
