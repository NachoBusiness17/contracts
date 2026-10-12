// gen_perimeter_wallets.js - mint per-device TON testnet wallets for the GB
// perimeter (2026-10-10, operator GO "Let's go"). One wallet per surface:
// DESKTOP, BOB, T90 (PIXEL reserved until the phone joins).
//
// KEY LAW: mnemonics are appended to the machine-local .env (gitignored,
// never committed, never printed). stdout carries ADDRESSES ONLY. These are
// TESTNET-ONLY keys with zero real value; treat them as burnable anyway.
const fs = require('fs');
const path = require('path');
const { mnemonicNew, mnemonicToPrivateKey } = require('@ton/crypto');
const { WalletContractV4 } = require('@ton/ton');

const ENV_PATH = path.join(__dirname, '.env');
const DEVICES = (process.argv[2] || 'DESKTOP,BOB,T90').split(',').map(s => s.trim()).filter(Boolean);

(async () => {
    const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    const lines = [];
    for (const device of DEVICES) {
        if (existing.includes(`WALLET_${device}_MNEMONIC`)) {
            const addr = (existing.match(new RegExp(`WALLET_${device}_ADDRESS=(\\S+)`)) || [])[1];
            console.log(`${device}: already minted -> ${addr || '(address missing from .env)'}`);
            continue;
        }
        const m = await mnemonicNew();
        const kp = await mnemonicToPrivateKey(m);
        const w = WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 });
        const addr = w.address.toString({ bounceable: false });
        lines.push(`WALLET_${device}_MNEMONIC=${m.join(' ')}`);
        lines.push(`WALLET_${device}_ADDRESS=${addr}`);
        console.log(`${device}: ${addr}`);
    }
    if (lines.length) {
        fs.appendFileSync(ENV_PATH, '\n# === GB perimeter per-device testnet wallets (2026-10-10; TESTNET ONLY) ===\n' + lines.join('\n') + '\n');
    }
})();
