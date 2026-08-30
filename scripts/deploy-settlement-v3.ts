/**
 * Deploy SettlementMasterV3 (adds ClaimUptime user-initiated voucher claims).
 *
 * After deploy:
 *   1. Call SetOwnJettonWallet with the V3 contract's computed jetton wallet address
 *   2. Transfer GSTD from V2's jetton wallet to V3's (via Tonkeeper)
 *   3. Call SetClaimVerifier with the platform pubkey (from generate-claim-keypair.ts)
 *   4. Update SETTLEMENT_ADDRESS in contracts/.env and MEMORY
 *
 * Run:
 *   npx ts-node --project tsconfig.deploy.json scripts/deploy-settlement-v3.ts
 */

import 'dotenv/config';
import { Address, toNano, TonClient, WalletContractV4, beginCell } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { SettlementMaster } from '../build/SettlementMaster/SettlementMaster_SettlementMaster';

const MNEMONIC    = process.env.DEPLOYER_MNEMONIC || '';
const TON_API_KEY = process.env.TON_API_KEY || '';
const GSTD_JETTON = 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO';
const TREASURY    = 'EQAbtTCsty8-gpX-45eotGWxnYG1c7ew7NFsZ9LJBRiv_Ii_';
const PROTOCOL_FEE = 'UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED'; // admin wallet for now

async function main() {
    if (!MNEMONIC) { console.error('❌ DEPLOYER_MNEMONIC not set'); process.exit(1); }

    const client  = new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC', apiKey: TON_API_KEY });
    const keyPair = await mnemonicToPrivateKey(MNEMONIC.split(' '));
    const wallet  = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const provider = client.open(wallet);

    const ownerAddr = wallet.address;
    console.log('Deployer wallet:', ownerAddr.toString());

    const balance = await provider.getBalance();
    console.log('Balance:', Number(balance) / 1e9, 'TON');
    if (balance < toNano('0.5')) {
        console.error('❌ Need at least 0.5 TON for deploy');
        process.exit(1);
    }

    console.log('\n📦 Deploying SettlementMasterV3...');
    const sm = provider.open(
        await SettlementMaster.fromInit(
            ownerAddr,
            Address.parse(GSTD_JETTON),
            Address.parse(TREASURY),
            Address.parse(PROTOCOL_FEE),
        )
    );

    const seqno = await provider.getSeqno();
    await sm.send(
        provider.sender(keyPair.secretKey),
        { value: toNano('0.3') },
        { $$type: 'Deploy', queryId: 0n }
    );

    // Wait for deployment
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const cur = await provider.getSeqno();
        if (cur > seqno) break;
    }

    const smAddress = sm.address.toString();
    console.log('\n✅ SettlementMasterV3 deployed at:', smAddress);

    // Set gateway to the Pi node wallet (same as V2)
    console.log('\n🔧 Setting gateway...');
    const seqno2 = await provider.getSeqno();
    await sm.send(
        provider.sender(keyPair.secretKey),
        { value: toNano('0.05') },
        { $$type: 'SetGateway', gateway: Address.parse('UQB03R2DuNR9LKkW1AxbWUDsegAjxCRVwRimZlyNQX2Gc8ve') }
    );
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        if (await provider.getSeqno() > seqno2) break;
    }
    console.log('   Gateway set');

    console.log('\n📋 Next steps:');
    console.log('   1. Compute V3 own jetton wallet address (use compute_jetton_wallet script)');
    console.log('      then call SetOwnJettonWallet:', smAddress);
    console.log('   2. Transfer GSTD from V2 jetton wallet to V3 jetton wallet (Tonkeeper)');
    console.log('   3. Call SetClaimVerifier with pubkey:');
    console.log('      33768676763462558199545182467252167953663994817740498778149755135435440742875');
    console.log('   4. Update contracts/.env: SETTLEMENT_ADDRESS="' + smAddress + '"');
    console.log('   5. Update deployment-mainnet.json');
}

main().catch(e => { console.error('DEPLOY FAILED:', e.message); process.exit(1); });
