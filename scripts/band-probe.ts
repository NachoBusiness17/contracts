// band-probe.ts - the deliberate BAND_BOUNCE: on-chain proof of the balance
// band (threat 3 fix) using the amended DAO setter itself.
//
// Sequence: read master balance M -> SetMinMasterBalance(floor = M + 0.1) so
// the band require (myBalance >= floor + 0.35) becomes M + 0.2 + something
// that a 0.2-attach settle cannot meet -> fire one SettleTask -> pull the
// master's latest inbound tx and read the compute-phase exit code (expect
// 24976 "Master balance below band floor") -> verify taskCount unchanged ->
// restore floor 1.0 -> verify getter.
//
// Run: GSTD_MASTER_ADDRESS=<v7> npx ts-node --project tsconfig.deploy.json scripts/band-probe.ts
import 'dotenv/config';
import { Address, beginCell, toNano, TonClient, WalletContractV4, internal } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const NANO = BigInt('1000000000');
const MASTER = Address.parse(process.env.GSTD_MASTER_ADDRESS || 'EQCteLhGv7dCLtCtbSK8bs5mxikKF-ckZ11vvf-5WUjpjrLb');
const WORKER = Address.parse('UQBX4TEs0dCvV7CzDpUmj04niFPVd0jjbCfhquO8dPxxa3BJ');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const s = client.open(new SettlementMaster(MASTER));

    const balBefore = Number(await client.getBalance(MASTER)) / 1e9;
    const tasksBefore = Number((await s.getGetSettlementStats()).taskCount);
    const floorBefore = Number(await s.getMinMasterBalance()) / 1e9;
    console.log(`pre: master ${balBefore.toFixed(4)} TON, tasks ${tasksBefore}, floor ${floorBefore}`);

    // 1. raise the floor just above the balance (owner = deployer = DAO here)
    const newFloor = BigInt(Math.round(balBefore * 1e9)) + (NANO * BigInt(100)) / BigInt(1000); // M + 0.1 TON
    await s.send(deployer.sender(kp.secretKey), { value: toNano('0.05') }, {
        $$type: 'SetMinMasterBalance', floor: newFloor,
    });
    await sleep(15000);
    const floorSet = Number(await s.getMinMasterBalance()) / 1e9;
    console.log(`floor raised to ${floorSet} (SetMinMasterBalance works: ${floorSet > balBefore ? 'YES' : 'NO'})`);

    // 2. fire one settle that must now BOUNCE
    const seqno = await deployer.getSeqno();
    await deployer.sendTransfer({
        seqno, secretKey: kp.secretKey,
        messages: [internal({
            to: MASTER,
            value: toNano('0.2'),
            bounce: true,
            body: beginCell()
                .storeUint(1462673144, 32)   // SettleTask opcode
                .storeUint(BigInt('53001' + String(Date.now()).slice(-6)), 64) // taskId
                .storeAddress(WORKER)
                .storeCoins(BigInt('25') * NANO) // gstdBonusAmount
                .storeUint(6670, 32)             // qualityScore
                .storeUint(25, 64)               // computeUnits
                .endCell(),
        })],
    });
    console.log('settle fired at floor', floorSet, '- expecting on-chain bounce, exit 24976');
    await sleep(30000);

    // 3. verify: taskCount unchanged (the settle reverted), then read the tx
    const tasksAfter = Number((await s.getGetSettlementStats()).taskCount);
    console.log(`post: tasks ${tasksBefore} -> ${tasksAfter} (unchanged = reverted: ${tasksAfter === tasksBefore ? 'YES' : 'NO'})`);

    const txs = await client.getTransactions(MASTER, { limit: 5 });
    for (const tx of txs) {
        const desc: any = (tx as any).description;
        const inMsg = tx.inMessage;
        const kind = desc?.computePhase?.exitCode;
        const aborted = desc?.computePhase?.exitCode !== undefined && desc?.computePhase?.exitCode !== 0;
        if (inMsg && kind !== undefined) {
            console.log(`tx: lt=${tx.lt} exit_code=${kind} aborted=${aborted}`,
                aborted ? `<- THE BAND BOUNCE (expect 24976)` : '');
        }
    }

    // 4. restore the production floor
    await s.send(deployer.sender(kp.secretKey), { value: toNano('0.05') }, {
        $$type: 'SetMinMasterBalance', floor: NANO,
    });
    await sleep(15000);
    const floorRestored = Number(await s.getMinMasterBalance()) / 1e9;
    console.log(`floor restored to ${floorRestored} (production band)`);
    console.log(`BAND_PROBE_VERDICT: ${tasksAfter === tasksBefore ? 'BOUNCE PROVEN (revert held, state untouched)' : 'SETTLE WENT THROUGH - BAND FAILED'}`);
})().catch(e => { console.error('ERR', String(e && e.message).slice(0, 300)); process.exit(1); });
