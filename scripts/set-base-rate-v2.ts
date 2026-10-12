// set-base-rate-v2.ts - close the GSTD bonus leg: raise baseRate so the bonus
// cap cannot silently zero real bonuses.
//
// Root cause (2026-10-11, corrected finding): deployed baseRate is 1,000,000
// nanoGSTD per CU = 0.001 GSTD/CU (SettlementMaster.tact init). The settle path
// caps the bonus at maxAllowedBonus = baseRate * computeUnits before sending,
// so a 25 GSTD bonus with computeUnits 25 silently becomes 0.025 GSTD, and the
// rail (computeUnits: 1) caps any bonus at 0.001 GSTD. The earlier gas-margin
// theory (hardcoded 0.12 TON on the TEP-74 send, SendIgnoreErrors) stands as
// SECONDARY hardening only - the cap kills the bonus first.
//
// Fix: SetBaseRate to 1e9 nano (1 GSTD per CU) from the deployer, who is the
// v2 SettlementMaster owner (deploy-jetton-v2.ts init). One admin message, no
// redeploy. 25 CU then caps at exactly 25 GSTD.
import 'dotenv/config';
import { Address, toNano, TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const V2S = Address.parse('EQCfxtmiNx-D5kYFy2xWqlEIYYeU3hMpwY9fRo3ROaiKxF86');
const NEW_RATE = BigInt('1000000000'); // 1 GSTD per compute unit
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

(async () => {
    const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || '' });
    const kp = await mnemonicToPrivateKey((process.env.DEPLOYER_MNEMONIC || '').trim().split(' '));
    const deployer = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
    const settlement = client.open(new SettlementMaster(V2S));

    const before = await settlement.getGetSettlementStats();
    console.log('baseRate before:', before.baseRate.toString(), 'nanoGSTD per CU');

    await settlement.send(deployer.sender(kp.secretKey), { value: toNano('0.05') }, {
        $$type: 'SetBaseRate',
        rate: NEW_RATE,
    });
    console.log('SetBaseRate sent (1e9 nano = 1 GSTD per CU), polling chain...');

    let now = before.baseRate;
    for (let i = 0; i < 12; i++) {
        await sleep(10000);
        now = (await settlement.getGetSettlementStats()).baseRate;
        console.log('  poll', i + 1, '- baseRate:', now.toString());
        if (now === NEW_RATE) break;
    }
    console.log(now === NEW_RATE
        ? 'VERDICT: baseRate live at 1 GSTD/CU - the cap cannot zero real bonuses. Rerun bonus-test.ts to close the leg.'
        : 'VERDICT: baseRate not updated on-chain - check owner address or seqno state');
})().catch(e => { console.error('ERR:', String(e && e.message).slice(0, 200)); process.exit(1); });
