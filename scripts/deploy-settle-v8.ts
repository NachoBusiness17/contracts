// deploy-settle-v8.ts - deploy SettlementMaster v8 (the two-tier relay build),
// wire the pool, rate it, fund it. Same pattern as deploy-settle-v7.ts.
//
// v8 = same init args as v7 (owner deployer, jetton v2, TreasuryGold v1,
// protocolFee deployer) but rebuilt code from PR #1 head (f46f700+):
//   2026-10-13: checked bonus relay (myBalance() gate + BonusDeferred event
//               + deferredBonusCount getter) - deferred, not dropped;
//   2026-10-14: contract-level balance band (minMasterBalance state, default
//               1 TON; settles below floor + 0.35 relay reserve REVERT);
//   2026-10-14: TWO-TIER RELAY - warm workers (rep > 0) cost 0.15 TON relay
//               gas, cold first-settle workers 0.3. The fountain fix: master
//               net per settle drops from ~-0.25 to ~-0.05 warm.
// The fresh code hashes -> a fresh address; v6 keeps serving the standing
// cron until this build soaks and replaces it.
//
// Post-deploy verification prints min_master_balance (amended-bytecode
// proof) and the deploy leaves the master at 2.5 TON: dozens of warm-settle
// headroom for the burn measurement.
import 'dotenv/config';
import { Address, beginCell, contractAddress, internal, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const TREASURY = Address.parse('EQAYhNIIPq85ND1D0RCEvaETD-Oz-WIjIbGAnCcLamD_opp6');
const NANO = BigInt('1000000000');
const MASTER_TON_FUND = process.env.V8_FUND_TON || '2.5';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const deployerAddr = deployer.address;
    console.log('deployer:', deployerAddr.toString());

    // 1. deploy SettlementMaster v8 (fresh code from the amended build -> fresh address)
    const settleInit = await SettlementMaster.init(deployerAddr, V2J, TREASURY, deployerAddr);
    const settleAddr = contractAddress(0, settleInit);
    console.log('SettlementMaster v8:', settleAddr.toString());
    const settlement = client.open(new SettlementMaster(settleAddr, settleInit));
    await settlement.send(deployer.sender(kp.secretKey), { value: toNano('0.3') }, {
        $$type: 'Deploy', queryId: BigInt(Date.now()),
    });
    await sleep(8000);

    // 2. wire the pool wallet
    const jetton = client.open(new GSTDJetton(V2J));
    const poolAddr = await jetton.getGetWalletAddress(settleAddr);
    console.log('v8 pool wallet:', poolAddr.toString());
    await settlement.send(deployer.sender(kp.secretKey), { value: toNano('0.05') }, {
        $$type: 'SetOwnJettonWallet', wallet: poolAddr,
    });
    await sleep(6000);

    // 3. baseRate 1 GSTD per CU (the shipped 0.001 default caps bonuses to dust)
    await settlement.send(deployer.sender(kp.secretKey), { value: toNano('0.05') }, {
        $$type: 'SetBaseRate', rate: NANO,
    });
    await sleep(6000);

    // 4. fund the GSTD bonus pool (100K) from the deployer's jetton wallet
    const dwAddr = await jetton.getGetWalletAddress(deployerAddr);
    const dw = client.open(new GSTDJettonWallet(dwAddr));
    await dw.send(deployer.sender(kp.secretKey), { value: toNano('0.1') }, {
        $$type: 'Transfer',
        queryId: BigInt(Date.now()),
        amount: BigInt('100000') * NANO,
        destination: settleAddr,
        responseDestination: deployerAddr,
        customPayload: null,
        forwardTonAmount: toNano('0.01'),
        forwardPayload: beginCell().storeUint(0, 32).endCell().asSlice(),
    });
    await sleep(8000);

    // 5. fund the master's TON side (the relay burns master gas per settle;
    // the band floor keeps it out of the drop band)
    await deployer.sendTransfer({
        seqno: await deployer.getSeqno(),
        secretKey: kp.secretKey,
        messages: [internal({ to: settleAddr, value: toNano(MASTER_TON_FUND), bounce: false })],
    });
    await sleep(8000);

    // 6. verify: the amended getters must answer
    const stats = await settlement.getGetSettlementStats();
    const minFloor = await settlement.getMinMasterBalance();
    const deferred = await settlement.getDeferredBonusCount();
    const masterBal = Number(await client.getBalance(settleAddr)) / 1e9;
    const pool = client.open(new GSTDJettonWallet(poolAddr));
    const poolBal = Number((await pool.getGetWalletData()).balance) / 1e9;
    console.log('v8 baseRate:', stats.baseRate.toString());
    console.log('v8 min_master_balance:', minFloor.toString(), '(amended-bytecode proof)');
    console.log('v8 deferred_bonus_count:', deferred.toString());
    console.log('v8 master TON:', masterBal);
    console.log('v8 pool GSTD:', poolBal);
    console.log(masterBal >= 1 && poolBal >= 100000 && minFloor === NANO
        ? 'VERDICT: v8 live, wired, in band, pool funded. Point the burn measurement at this address.'
        : 'VERDICT: v8 not ready - inspect the getter reads above');
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 300)); process.exit(1); });
