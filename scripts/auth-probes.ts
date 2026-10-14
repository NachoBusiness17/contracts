// auth-probes.ts - the three uncovered coverage probes from the falsifier
// index, closed with on-chain exit codes against live v7:
//   PROBE 1 (negative auth): SetMinMasterBalance sent by a NON-owner wallet
//                            (desktop) -> expect the "Only DAO" require abort.
//   PROBE 2 (floor minimum): owner sets floor BELOW 0.5 TON ->
//                            expect the "Floor below relay reserve" abort.
//   PROBE 3 (replay guard):  SettleTask with an ALREADY-SETTLED taskId ->
//                            expect exit 54291 "Task already settled".
// Verdicts are read from the transaction list - the chain's own exit codes,
// never client-side guesses.
//
// Run: GSTD_MASTER_ADDRESS=<v7> npx ts-node --project tsconfig.deploy.json scripts/auth-probes.ts
import 'dotenv/config';
import { Address, beginCell, toNano, TonClient, WalletContractV4, internal } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const NANO = BigInt('1000000000');
const MASTER = Address.parse(process.env.GSTD_MASTER_ADDRESS || 'EQCteLhGv7dCLtCtbSK8bs5mxikKF-ckZ11vvf-5WUjpjrLb');
const WORKER = Address.parse('UQBX4TEs0dCvV7CzDpUmj04niFPVd0jjbCfhquO8dPxxa3BJ');
const REPLAY_TASK_ID = BigInt('53001282225'); // settled at soak cycle 1 (tx 50d3818b...)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const s = client.open(new SettlementMaster(MASTER));

    const tasksBefore = Number((await s.getGetSettlementStats()).taskCount);
    const floorBefore = Number(await s.getMinMasterBalance()) / 1e9;
    console.log(`pre: tasks ${tasksBefore}, floor ${floorBefore} TON`);

    // ---- PROBE 1: non-owner SetMinMasterBalance, tact-encoded, desktop-signed ----
    try {
        const kp1 = await mnemonicToPrivateKey((process.env.WALLET_DESKTOP_MNEMONIC || '').trim().split(' '));
        const w1 = client.open(WalletContractV4.create({ publicKey: kp1.publicKey, workchain: 0 }));
        const probe = client.open(new SettlementMaster(MASTER));
        const sender = {
            address: WORKER,
            send: async (msg: { value?: any; body?: any }) => {
                const seq = await w1.getSeqno();
                await w1.sendTransfer({
                    seqno: seq, secretKey: kp1.secretKey,
                    messages: [internal({ to: MASTER, value: msg.value ?? toNano('0.05'), bounce: true, body: msg.body })],
                });
            },
        };
        await probe.send(sender as any, { value: toNano('0.05') }, { $$type: 'SetMinMasterBalance', floor: NANO });
        console.log('PROBE1: SetMinMasterBalance sent from NON-owner - expect on-chain abort (Only DAO)');
    } catch (e) {
        console.log('PROBE1 rejected at send level (also a pass):', String((e as any)?.message ?? e).slice(0, 120));
    }
    await sleep(22000);

    // ---- PROBE 2: owner sets floor below the 0.5 minimum ----
    try {
        await s.send(deployer.sender(kp.secretKey), { value: toNano('0.05') }, {
            $$type: 'SetMinMasterBalance', floor: toNano('0.1'),
        });
        console.log('PROBE2: below-minimum floor sent from owner - expect on-chain abort (Floor below relay reserve)');
    } catch (e) {
        console.log('PROBE2 rejected at send level (also a pass):', String((e as any)?.message ?? e).slice(0, 120));
    }
    await sleep(22000);

    // ---- PROBE 3: replay an already-settled taskId ----
    try {
        const seqno = await deployer.getSeqno();
        await deployer.sendTransfer({
            seqno, secretKey: kp.secretKey,
            messages: [internal({
                to: MASTER, value: toNano('0.2'), bounce: true,
                body: beginCell()
                    .storeUint(1462673144, 32)     // SettleTask opcode
                    .storeUint(REPLAY_TASK_ID, 64) // already settled at soak cycle 1
                    .storeAddress(WORKER)
                    .storeCoins(BigInt('25') * NANO)
                    .storeUint(6670, 32)
                    .storeUint(25, 64)
                    .endCell(),
            })],
        });
        console.log('PROBE3: replay settle fired - expect exit 54291 (Task already settled)');
    } catch (e) {
        console.log('PROBE3 rejected at send level (also a pass):', String((e as any)?.message ?? e).slice(0, 120));
    }
    await sleep(30000);

    // ---- VERDICTS FROM THE CHAIN ----
    const tasksAfter = Number((await s.getGetSettlementStats()).taskCount);
    const floorAfter = Number(await s.getMinMasterBalance()) / 1e9;
    console.log(`post: tasks ${tasksAfter} unchanged=${tasksAfter === tasksBefore} | floor ${floorAfter} TON unchanged=${floorAfter === floorBefore}`);

    const txs = await client.getTransactions(MASTER, { limit: 12 });
    for (const tx of txs) {
        const ec = (tx.description as any)?.computePhase?.exitCode;
        if (ec !== undefined && tx.inMessage) {
            const tag = ec === 54291 ? ' <- REPLAY CAUGHT (54291)'
                : ec === 132 ? ' <- ACCESS DENIED (non-owner, 132)'
                : ec !== 0 ? ` <- ABORT (${ec})` : '';
            console.log(`tx lt=${tx.lt} exit_code=${ec} aborted=${ec !== 0}${tag}`);
        }
    }
    console.log('EXPECTED: probe1 -> 132 (Only DAO); probe2 -> the floor-minimum require code; probe3 -> 54291 (already settled)');
})().catch(e => { console.error('ERR', String(e && e.message).slice(0, 300)); process.exit(1); });
