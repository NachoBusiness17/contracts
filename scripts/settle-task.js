#!/usr/bin/env node
/**
 * settle-task.js -- GSTD testnet SettlementMaster: route ONE test task and
 * settle it, exercising the 85/10/5 revenue split.
 *
 * Target contract : SettlementMaster EQBRH9yC6trjOlLzOUuUIRJye7yxaEHf2diiDZQndncMekMw (TON testnet)
 * Message sent    : SettleTask (opcode 1462673144, read from the built Tact wrapper
 *                   build/SettlementMaster/SettlementMaster_SettlementMaster.ts:877)
 *   fields        : taskId          uint64
 *                   workerAddr      Address
 *                   gstdBonusAmount coins   (0 = no bonus jetton transfer)
 *                   qualityScore    uint32  (0-10000, 2 decimals)
 *                   computeUnits    uint64
 *
 * Contract math (SettlementMaster.tact, receive(SettleTask)):
 *   gas reserve = 0.1 TON,  total = context().value - 0.1 TON
 *   worker   = total * workerShare(85)   / 100
 *   treasury = total * treasuryShare(10) / 100
 *   protocol = total - worker - treasury            (5%, taken as the remainder)
 *
 * Secrets: reads DEPLOYER_MNEMONIC and TON_API_KEY from contracts/.env (cwd).
 * Nothing secret is printed; only public values (addresses, ids, hashes, amounts).
 *
 * Run from the contracts dir:  node scripts/settle-task.js
 */

require('dotenv/config');
const { Address, beginCell, toNano, TonClient, WalletContractV4 } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

const SETTLEMENT = process.env.SETTLEMENT_ADDRESS || 'EQBRH9yC6trjOlLzOUuUIRJye7yxaEHf2diiDZQndncMekMw';
const ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const OP_SETTLE_TASK = 1462673144;

const VALUE_TON = process.env.SETTLE_VALUE_TON || '1.1';      // 1.1 -> total 1.0 after the 0.1 gas reserve
const TASK_ID = BigInt(process.env.TASK_ID || String(Date.now()));
const QUALITY = Number(process.env.TASK_QUALITY || 7500);      // 75.00
const COMPUTE_UNITS = BigInt(process.env.TASK_CU || '1');
const GSTD_BONUS = BigInt(process.env.TASK_BONUS || '0');      // 0 = skip jetton bonus leg

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const mn = (process.env.DEPLOYER_MNEMONIC || '').trim();
  if (!mn) {
    console.error('FATAL: DEPLOYER_MNEMONIC not set in contracts/.env');
    process.exit(1);
  }

  const client = new TonClient({ endpoint: ENDPOINT, apiKey: process.env.TON_API_KEY || '' });
  const kp = await mnemonicToPrivateKey(mn.split(/\s+/));
  const wallet = client.open(WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 }));
  const walletAddr = wallet.address;

  // worker defaults to the settlement sender's own (alive) wallet so the 85%
  // leg lands on chain without bouncing. Override with WORKER_ADDRESS.
  const workerAddr = process.env.WORKER_ADDRESS ? Address.parse(process.env.WORKER_ADDRESS) : walletAddr;

  const body = beginCell()
    .storeUint(OP_SETTLE_TASK, 32)
    .storeUint(TASK_ID, 64)
    .storeAddress(workerAddr)
    .storeCoins(GSTD_BONUS)
    .storeUint(QUALITY, 32)
    .storeUint(COMPUTE_UNITS, 64)
    .endCell();

  const value = toNano(VALUE_TON);
  const total = value - toNano('0.1');
  const expectedWorker = (total * 85n) / 100n;
  const expectedTreasury = (total * 10n) / 100n;
  const expectedProtocol = total - expectedWorker - expectedTreasury;

  console.log(JSON.stringify({
    step: 'settle',
    network: 'testnet',
    settlement: SETTLEMENT,
    sender_wallet: walletAddr.toString(),
    worker: workerAddr.toString(),
    task_id: TASK_ID.toString(),
    quality_score: QUALITY,
    compute_units: COMPUTE_UNITS.toString(),
    gstd_bonus: GSTD_BONUS.toString(),
    value_ton: VALUE_TON,
    value_nano: value.toString(),
    total_nano: total.toString(),
    expected_worker_nano: expectedWorker.toString(),
    expected_treasury_nano: expectedTreasury.toString(),
    expected_protocol_nano: expectedProtocol.toString(),
    body_hash: body.hash().toString('hex'),
  }, null, 2));

  const balance = await client.getBalance(wallet.address);
  console.log('deployer_balance_ton=' + (Number(balance) / 1e9));

  const seqnoBefore = await wallet.getSeqno();
  console.log('seqno_before=' + seqnoBefore);

  await wallet.sender(kp.secretKey).send({
    to: Address.parse(SETTLEMENT),
    value,
    body,
    bounce: true,
  });

  let confirmed = false;
  for (let i = 0; i < 30; i++) {
    await sleep(4000);
    const cur = await wallet.getSeqno();
    if (cur > seqnoBefore) { confirmed = true; break; }
  }

  console.log(JSON.stringify({ step: 'sent', seqno_before: seqnoBefore, seqno_confirmed: confirmed, wallet: walletAddr.toString() }, null, 2));

  if (!confirmed) {
    console.error('FATAL: transaction not confirmed after 120s');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error('ERROR: ' + (e && e.message ? e.message : String(e)));
  process.exit(1);
});