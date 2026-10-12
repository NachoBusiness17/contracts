#!/usr/bin/env node
/**
 * register-node.js -- GSTD testnet AgentRegistry: register the estate's first agent node.
 *
 * Target contract : AgentRegistry EQC1BmbbaUkTufXN6_ZiuvvYyCh8tlKdQELDsb5iZmByCzmO (TON testnet)
 * Message sent    : RegisterNode
 *   opcode        : 1868853951 (0x6F5F9E1F-style crc header emitted by the Tact compiler)
 *   fields        : nodeId uint256 = sha256(publicKey)
 *                   nodeType uint8      (0=Edge 1=CPU 2=GPU 3=Head)
 *                   publicKey slice(32B) stored as a ref cell
 *                   genesisHash uint256  (contract only enforces this when its
 *                                         genesisManifestHash != 0; pre-run getter
 *                                         returned 0, so the field is informational)
 *                   capabilities uint32  (bitmask LLM=1 Embed=2 Vision=4 Code=8)
 *                   region uint8         (0=EU 1=US-E 2=US-W 3=ASIA-JP 4=ASIA-SG 5=AFRICA)
 *
 * Secrets: reads DEPLOYER_MNEMONIC and TON_API_KEY from contracts/.env (cwd).
 * Nothing secret is printed; only public values (addresses, node id, hashes) appear in output.
 *
 * Run from the contracts dir:  node scripts/register-node.js
 */

require('dotenv/config');
const crypto = require('crypto');
const { Address, beginCell, toNano, TonClient, WalletContractV4 } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

const REGISTRY = 'EQC1BmbbaUkTufXN6_ZiuvvYyCh8tlKdQELDsb5iZmByCzmO';
const ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const OP_REGISTER_NODE = 1868853951;

const NODE_TYPE = Number(process.env.NODE_TYPE || 3);      // 3 = Head (the estate is the head node)
const CAPABILITIES = Number(process.env.NODE_CAPS || 9);   // 1 = LLM | 8 = Code
const REGION = Number(process.env.NODE_REGION || 1);       // 1 = US-E
const VALUE_TON = process.env.NODE_VALUE_TON || '0.2';     // contract forwards 0.05 to the NodeIdentity deploy

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const mn = (process.env.DEPLOYER_MNEMONIC || '').trim();
  if (!mn) {
    console.error('FATAL: DEPLOYER_MNEMONIC not set in contracts/.env');
    process.exit(1);
  }

  const client = new TonClient({ endpoint: ENDPOINT, apiKey: process.env.TON_API_KEY || '' });
  const kp = await mnemonicToPrivateKey(mn.split(/\s+/));
  const pub = Buffer.from(kp.publicKey);
  if (pub.length !== 32) {
    console.error('FATAL: public key is not 32 bytes');
    process.exit(1);
  }

  const nodeId = BigInt('0x' + crypto.createHash('sha256').update(pub).digest('hex'));
  const registry = Address.parse(REGISTRY);
  const wallet = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
  const walletAddr = wallet.address.toString();

  const body = beginCell()
    .storeUint(OP_REGISTER_NODE, 32)
    .storeUint(nodeId, 256)
    .storeUint(NODE_TYPE, 8)
    .storeRef(beginCell().storeBuffer(pub).endCell())
    .storeUint(0n, 256)              // genesisHash: manifest hash on-chain is 0, so unchecked
    .storeUint(CAPABILITIES, 32)
    .storeUint(REGION, 8)
    .endCell();

  console.log(JSON.stringify({
    step: 'register',
    network: 'testnet',
    registry: REGISTRY,
    sender_wallet: walletAddr,
    public_key_hex: pub.toString('hex'),
    node_id_hex: nodeId.toString(16).padStart(64, '0'),
    node_type: NODE_TYPE,
    capabilities: CAPABILITIES,
    region: REGION,
    value_ton: VALUE_TON,
    body_hash: body.hash().toString('hex'),
  }, null, 2));

  const balance = await client.getBalance(wallet.address);
  console.log('deployer_balance_ton=' + (Number(balance) / 1e9));

  const seqnoBefore = await wallet.getSeqno();
  console.log('seqno_before=' + seqnoBefore);

  await wallet.sender(kp.secretKey).send({
    to: registry,
    value: toNano(VALUE_TON),
    body,
    bounce: false,
  });

  let confirmed = false;
  for (let i = 0; i < 30; i++) {
    await sleep(4000);
    const cur = await wallet.getSeqno();
    if (cur > seqnoBefore) { confirmed = true; break; }
  }

  console.log(JSON.stringify({
    step: 'sent',
    seqno_before: seqnoBefore,
    seqno_confirmed: confirmed,
    wallet: walletAddr,
  }, null, 2));

  if (!confirmed) {
    console.error('FATAL: transaction not confirmed after 120s');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error('ERROR: ' + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
