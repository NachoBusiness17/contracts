// gen-mainnet-wallet.js - generate a TON MAINNET wallet for the real-TON GSTD run.
// KEY LAW (hardened for mainnet): the mnemonic is appended DIRECTLY to the
// machine-local .env (gitignored) and NEVER printed to stdout or chat. Only the
// public address prints. Usage:
//   node gen-mainnet-wallet.js <ENV_VAR_NAME>
// Example: node gen-mainnet-wallet.js MAINNET_DEPLOYER_MNEMONIC
const fs = require('fs');
const path = require('path');
const { mnemonicNew, mnemonicToPrivateKey } = require('@ton/crypto');
const { WalletContractV4 } = require('@ton/ton');

(async () => {
    const envName = process.argv[2];
    if (!envName || !/^[A-Z0-9_]+$/.test(envName)) {
        console.error('usage: node gen-mainnet-wallet.js <ENV_VAR_NAME>');
        process.exit(2);
    }
    const envPath = path.join(__dirname, '.env');
    if (fs.readFileSync(envPath, 'utf-8').includes(envName + '=')) {
        console.error(`refusing: ${envName} already exists in .env (a generated mainnet key is never regenerated over)`);
        process.exit(2);
    }
    const m = await mnemonicNew();
    const kp = await mnemonicToPrivateKey(m);
    const w = WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 });
    fs.appendFileSync(envPath, `\n${envName}=${m.join(' ')}\n${envName}_ADDRESS=${w.address.toString()}\n`);
    console.log(`${envName} wallet generated (mnemonic appended to machine-local .env, never printed)`);
    console.log(`ADDRESS: ${w.address.toString()}`);
    console.log('Fund this address from the exchange, then deploy. The mnemonic lives only in .env.');
})();
