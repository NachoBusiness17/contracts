/**
 * deploy-jetton-v2.ts - the perimeter v2 settlement stack (2026-10-11, "Fund it").
 *
 * Two findings forced the full redeploy:
 *  - v1 jetton locked mintAuthority before any premint ran and SettlementMaster
 *    has no mint leg: zero testnet GSTD could ever exist on v1.
 *  - the deployed SettlementMaster predates the ownJettonWallet feature (the
 *    built wrapper lacked SetOwnJettonWallet until tonight's rebuild): the old
 *    master cannot hold a jetton pool at all.
 *
 * v2 stack, wired to the estate's perimeter wallets:
 *   1. deploy GSTDJetton v2 (owner = deployer)
 *   2. MintInitialAllocation: team 100M -> DESKTOP, ecosystem 200M -> deployer
 *      (pool holder), liquidity 100M -> BOB
 *   3. deploy SettlementMaster v2 (init: owner, v2 jetton, TreasuryGold v1,
 *      protocolFee = deployer)
 *   4. SetOwnJettonWallet on SettlementMaster v2 -> its v2 jetton wallet
 *   5. SetMintAuthority lock: v2 jetton -> SettlementMaster v2
 *   6. fund the pool: deployer TEP-74 transfer 1,000,000 GSTD -> SettlementMaster v2
 *
 * Secrets: DEPLOYER_MNEMONIC + TON_API_KEY from contracts/.env. Public values only.
 * Run: npx ts-node --project tsconfig.deploy.json scripts/deploy-jetton-v2.ts
 */
import 'dotenv/config';
import { Address, beginCell, contractAddress, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { Cell } from '@ton/core';
import { GSTDJetton } from '../build/GSTDJetton/GSTDJetton_GSTDJetton';
import { GSTDJettonWallet } from '../build/GSTDJetton/GSTDJetton_GSTDJettonWallet';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const TREASURY = Address.parse('EQAYhNIIPq85ND1D0RCEvaETD-Oz-WIjIbGAnCcLamD_opp6'); // v1 TreasuryGold, reused
const NANO = BigInt('1000000000');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function buildMetadataCell(): Cell {
    return beginCell()
        .storeUint(0, 8)
        .storeStringTail(JSON.stringify({
            name:        'GSTD Token',
            description: 'AI Compute Network Governance & Utility Token (perimeter v2)',
            symbol:      'GSTD',
            decimals:    '9',
            image:       'https://app.gstdtoken.com/gstd-logo.png',
        }))
        .endCell();
}

async function main() {
    const mn = (process.env.DEPLOYER_MNEMONIC || '').trim();
    if (!mn) { console.error('FATAL: DEPLOYER_MNEMONIC missing'); process.exit(2); }
    const client = new TonClient({ endpoint: ENDPOINT, apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey(mn.split(' '));
    const provider = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const deployerAddr = provider.address;
    console.log('deployer:', deployerAddr.toString());

    const desktop = Address.parse(process.env.WALLET_DESKTOP_ADDRESS || 'UQBX4TEs0dCvV7CzDpUmj04niFPVd0jjbCfhquO8dPxxa3BJ');
    const bob = Address.parse(process.env.WALLET_BOB_ADDRESS || 'UQAW3wO8TwzoBuOjA-XwCivj80eKhRzGAWl_PgkzUUUlbe5m');

    // 1. jetton v2
    const jettonInit = await GSTDJetton.init(deployerAddr, buildMetadataCell());
    const jettonAddr = contractAddress(0, jettonInit);
    console.log('jetton v2:', jettonAddr.toString());
    const jetton = client.open(new GSTDJetton(jettonAddr, jettonInit));
    await jetton.send(provider.sender(kp.secretKey), { value: toNano('0.5') }, {
        $$type: 'Deploy', queryId: BigInt(Date.now()),
    });
    await sleep(7000);

    // 2. premint allocation (authority still unlocked)
    await jetton.send(provider.sender(kp.secretKey), { value: toNano('0.5') }, {
        $$type: 'MintInitialAllocation',
        teamAddr: desktop,
        teamAmount: BigInt('100000000') * NANO,
        ecosystemAddr: deployerAddr,
        ecosystemAmount: BigInt('200000000') * NANO,
        liquidityAddr: bob,
        liquidityAmount: BigInt('100000000') * NANO,
    });
    console.log('allocation: team 100M -> DESKTOP | ecosystem 200M -> deployer | liquidity 100M -> BOB');
    await sleep(8000);

    // 3. SettlementMaster v2 (fresh build with the jetton pool)
    const settleInit = await SettlementMaster.init(deployerAddr, jettonAddr, TREASURY, deployerAddr);
    const settleAddr = contractAddress(0, settleInit);
    console.log('SettlementMaster v2:', settleAddr.toString());
    const settlement = client.open(new SettlementMaster(settleAddr, settleInit));
    await settlement.send(provider.sender(kp.secretKey), { value: toNano('0.3') }, {
        $$type: 'Deploy', queryId: BigInt(Date.now()),
    });
    await sleep(8000);

    // 4. wire the pool on SettlementMaster v2
    const jettonRead = client.open(new GSTDJetton(jettonAddr, jettonInit));
    const poolAddr = await jettonRead.getGetWalletAddress(settleAddr);
    console.log('pool (SettlementMaster v2 jetton wallet):', poolAddr.toString());
    await settlement.send(provider.sender(kp.secretKey), { value: toNano('0.05') }, {
        $$type: 'SetOwnJettonWallet', wallet: poolAddr,
    });
    await sleep(6000);

    // 5. lock mint authority to SettlementMaster v2
    await jetton.send(provider.sender(kp.secretKey), { value: toNano('0.05') }, {
        $$type: 'SetMintAuthority', newAuthority: settleAddr,
    });
    console.log('mint authority locked to SettlementMaster v2');
    await sleep(6000);

    // 6. fund the pool: 1,000,000 GSTD -> SettlementMaster v2
    const dwAddr = await jettonRead.getGetWalletAddress(deployerAddr);
    const dw = client.open(new GSTDJettonWallet(dwAddr));
    await dw.send(provider.sender(kp.secretKey), { value: toNano('0.1') }, {
        $$type: 'Transfer',
        queryId: BigInt(Date.now()),
        amount: BigInt('1000000') * NANO,
        destination: settleAddr,
        responseDestination: deployerAddr,
        customPayload: null,
        forwardTonAmount: toNano('0.01'),
        forwardPayload: beginCell().storeUint(0, 32).endCell().asSlice(),
    });
    console.log('pool funded: 1,000,000 GSTD -> SettlementMaster v2');
    await sleep(6000);

    console.log(JSON.stringify({
        jetton_v2: jettonAddr.toString(), settlement_v2: settleAddr.toString(), pool: poolAddr.toString(),
        desktop: desktop.toString(), bob: bob.toString(), deployer: deployerAddr.toString(),
    }, null, 2));
}

main().catch(e => { console.error('ERROR: ' + (e && e.message ? e.message : String(e))); process.exit(1); });
