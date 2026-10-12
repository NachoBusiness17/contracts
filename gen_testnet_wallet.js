// gen_testnet_wallet.js - generates a TON testnet wallet for GSTD deployment
// Run on the estate in the gstdcoin/contracts dir. Prints mnemonic + address.
// THE MNEMONIC IS THE KEY - it appears on the estate console for the operator only.
const { mnemonicNew, mnemonicToPrivateKey } = require('@ton/crypto');
const { WalletContractV4 } = require('@ton/ton');

(async () => {
    const m = await mnemonicNew();
    const kp = await mnemonicToPrivateKey(m);
    const w = WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 });
    console.log('=== YOUR TESTNET WALLET ===');
    console.log('WORDS: ' + m.join(' '));
    console.log('ADDRESS: ' + w.address.toString());
    console.log('=== SAVE THE WORDS, FUND THE ADDRESS ===');
})();
