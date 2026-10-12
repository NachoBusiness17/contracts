// trace-v4.ts - robust trace: v4 master recent transactions + cold wallet.
// Prints in/out message structure per tx. Read-only.
import 'dotenv/config';
import { Address, TonClient } from '@ton/ton';

const V4 = 'EQCsHsGiIpXjYqwweQ4uLNb82g1On85k1itZ2o_XGmTdAhDB';
const COLD = 'UQB_ttfZYSm7noXctGl-gwyM4-lLzsvNaWrGfvP92ABu_Qqn';

function ton(v: any): number {
    const n = Number(v ?? 0);
    return Math.round(n / 1e9 * 10000) / 10000;
}

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });

    const v4txs = await client.getTransactions(Address.parse(V4), { limit: 4 });
    for (const tx of v4txs) {
        const inV = ton(tx.inMessage?.value?.coins);
        const src = tx.inMessage?.source?.toString() ?? 'external/null';
        console.log(`v4 tx: in ${inV} TON from ${src.slice(0, 16)} | out ${tx.outMessages.size}`);
        tx.outMessages.forEach(m => {
            console.log(`    -> ${m.destination?.toString().slice(0, 24)} | value ${ton((m as any).value?.coins)} | mode/bounce info n/a`);
        });
    }

    const coldtxs = await client.getTransactions(Address.parse(COLD), { limit: 3 });
    console.log('COLD wallet txs:', coldtxs.size);
    coldtxs.forEach(tx => {
        console.log(`   in ${ton(tx.inMessage?.value?.coins)} TON | out ${tx.outMessages.size}`);
    });
})().catch(e => { console.error('ERR:', String(e).slice(0, 300)); process.exit(1); });
