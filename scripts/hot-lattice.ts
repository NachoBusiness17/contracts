// hot-lattice.ts - the VRAM hot lattice reader (Phase 4 babystep 4).
// One instrument, the whole lattice: per tailnet cell - which models are HOT
// (ollama /api/ps: loaded models + vram size), the cell's TON balance, and its
// on-chain reputation (worker_reputation from SettlementMaster v6).
// Cold cells report honestly as cold. No credentials on the wire.
import 'dotenv/config';
import { Address, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const V6 = Address.parse('EQDw9oXaR1lmwaVJdJFYA2heY11ktvdS0Jsdnee7Qqxur_g8');

const CELLS: Record<string, { host: string; wallet: string }> = {
    DESKTOP: { host: 'http://100.96.161.76:11434', wallet: 'UQBX4TEs0dCvV7CzDpUmj04niFPVd0jjbCfhquO8dPxxa3BJ' },
    BOB:     { host: 'http://100.125.103.60:11434', wallet: 'UQAW3wO8TwzoBuOjA-XwCivj80eKhRzGAWl_PgkzUUUlbe5m' },
    T90:     { host: 'http://100.72.38.3:11434', wallet: 'UQBrE6BRPvZkBH47rHGfL7TmepeakX--unodq9I_K6f7BA3p' },
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function probeOllama(host: string): Promise<{ ok: boolean; models: { name: string; vramMB: number; sizeUntil?: number }[] }> {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(host + '/api/ps', { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) return { ok: false, models: [] };
        const d: any = await r.json();
        const models = (d.models || []).map((m: any) => ({
            name: m.name,
            vramMB: Math.round((m.size_vram || 0) / (1024 * 1024)),
            sizeUntil: m.expires_at ? new Date(m.expires_at).getTime() : undefined,
        }));
        return { ok: true, models };
    } catch {
        return { ok: false, models: [] };
    }
}

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const settlement = client.open(new SettlementMaster(V6));

    console.log('=== VRAM HOT LATTICE - ' + new Date().toISOString() + ' ===');
    console.log('master v6:', V6.toString());
    console.log('');

    const latticeCells: Record<string, unknown> = {};

    for (const [name, cell] of Object.entries(CELLS)) {
        const hot = await probeOllama(cell.host);
        let ton = -1;
        let rep = -1;
        try {
            const w = Address.parse(cell.wallet);
            ton = Number(await client.getBalance(w)) / 1e9;
        } catch { /* cold */ }
        try { rep = Number(await settlement.getWorkerReputation(Address.parse(cell.wallet))); } catch { rep = 0; }
        const state = hot.ok ? (hot.models.length > 0 ? 'HOT' : 'warm (ollama up, nothing loaded)') : 'COLD (no inference door)';
        console.log(`CELL ${name} [${state}]`);
        if (hot.ok) {
            if (hot.models.length === 0) console.log('   models hot: none');
            for (const m of hot.models) console.log(`   models hot: ${m.name} | vram ${m.vramMB} MB`);
        } else {
            console.log('   models hot: unreachable on ' + cell.host + ' (this is data, not an error)');
        }
        console.log(`   TON: ${ton >= 0 ? ton : 'read failed'} | on-chain reputation: ${rep >= 0 ? rep : 0}`);
        latticeCells[name] = { state, models: hot.models, ton, reputation: rep >= 0 ? rep : 0 };
        console.log('');
        await sleep(500);
    }
    console.log('lattice law: hot cells earn settlement; honest hot cells earn reputation; reputation gates the next launch.');

    // snapshot for the MCP server (gstd_mcp.py serves this file; freshness = mtime)
    try {
        const stats = await settlement.getGetSettlementStats();
        const snap = {
            captured_at: new Date().toISOString(),
            master: V6.toString(),
            baseRate: stats.baseRate.toString(),
            taskCount: stats.taskCount.toString(),
            totalSettledTon: Number(stats.totalSettled) / 1e9,
            cells: latticeCells,
        };
        require('fs').writeFileSync('lattice.json', JSON.stringify(snap, null, 2));
        console.log('snapshot written: lattice.json');
    } catch (e) {
        console.log('snapshot write skipped:', String(e).slice(0, 120));
    }
})().catch(e => { console.error('ERR:', String(e).slice(0, 300)); process.exit(1); });
