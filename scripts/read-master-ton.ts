import 'dotenv/config';
import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';

const c = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
const MASTER = Address.parse(process.env.GSTD_MASTER_ADDRESS || 'EQArRbzf9lhdzIytV_DuROSWzdWvkCo1KVrjrsoMhVsUdQTu'); // v8, cron cutover 2026-10-14

(async () => {
    const r = await c.getBalance(MASTER);
    console.log('MASTER_TON', Number(r) / 1e9);
})().catch((e) => {
    console.log('FAIL', String(e).slice(0, 160));
    process.exit(1);
});
