// deploy-settle-v3.ts - deploy SettlementMaster v3 (the bonus-leg fix build),
// wire the pool, raise the rate, fund it. One script, seqno-gated by sleeps.
//
// v3 = same init args as v2 (owner deployer, jetton v2, TreasuryGold v1,
// protocolFee deployer) but rebuilt code carrying:
//   fix 1: bonus jetton send uses tact header 1435380091 (the op this repo's
//          GSTDJettonWallet actually matches) instead of TEP-74 0xf8a7ea5,
//          which the wallet silently ignored (three settles, out_msgs 0);
//   fix 2: bonus gas 0.15 TON (was 0.12) so a worker jetton wallet deploy
//          fits inside the bonus send;
//   fix 3 (operational): SetBaseRate 1 GSTD/CU applied at deploy time - the
//          shipped default 0.001 GSTD/CU capped any real bonus to dust.
import 'dotenv/config';
import { Address, beginCell, contractAddress, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const V2J = Address.parse('EQCgvt0MRmJPl-zQ8rZaPXpQnQgDQMQ_21plPSeYF4-zSAf0');
const TREASURY = Address.parse('EQAYhNIIPq85ND1D0RCEvaETD-Oz-WIjIbGAnCcLamD_opp6');
const NANO = BigInt('1000000000');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const deployerAddr = deployer.address;
    console.log('deployer:', deployerAddr.toString());

    // 1. deploy SettlementMaster v3 (fresh code -> fresh address, same init args)
    const settleInit = await SettlementMaster.init(deployerAddr, V2J, TREASURY, deployerAddr);
    const settleAddr = contractAddress(0, settleInit);
    console.log('SettlementMaster v3:', settleAddr.toString());
    const settlement = client.open(new SettlementMaster(settleAddr, settleInit));
    await settlement.send(deployer.sender(kp.secretKey), { value: toNano('0.3') }, {
        $$type: 'Deploy', queryId: BigInt(Date.now()),
    });
    await sleep(8000);

    // 2. wire the pool wallet
    const jetton = client.open(new GSTDJetton(V2J));
    const poolAddr = await jetton.getGetWalletAddress(settleAddr);
    console.log('v3 pool wallet:', poolAddr.toString());
    await settlement.send(deployer.sender(kp.secretKey), { value: toNano('0.05') }, {
        $$type: 'SetOwnJettonWallet', wallet: poolAddr,
    });
    await sleep(6000);

    // 3. baseRate 1 GSTD per CU at deploy time (the shipped 0.001 default is a bonus killer)
    await settlement.send(deployer.sender(kp.secretKey), { value: toNano('0.05') }, {
        $$type: 'SetBaseRate', rate: NANO,
    });
    await sleep(6000);
    const stats = await settlement.getGetSettlementStats();
    console.log('baseRate on v3:', stats.baseRate.toString());

    // 4. fund the pool via the tact wrapper (the idiom that actually matches the wallet)
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
    const pool = client.open(new GSTDJettonWallet(poolAddr));
    const poolBal = Number((await pool.getGetWalletData()).balance) / 1e9;
    console.log('v3 pool funded, on-chain GSTD:', poolBal);
    console.log(nowOrLater(poolBal));
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });

function nowOrLater(poolBal: number): string {
    return poolBal >= 100000
        ? 'VERDICT: v3 live, wired, rated, funded. Point the bonus settle at this address.'
        : 'VERDICT: pool not funded yet - re-read the getter after the transfer settles';
}
