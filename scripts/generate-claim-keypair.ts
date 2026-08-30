/**
 * Generate an Ed25519 keypair for GSTD uptime claim vouchers.
 *
 * Usage:
 *   npx ts-node --project tsconfig.deploy.json scripts/generate-claim-keypair.ts
 *
 * Outputs:
 *   - Private key hex  → store as CLAIM_VERIFIER_SECRET wrangler secret
 *   - Public key uint256 → use in SetClaimVerifier contract call
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateKeyPairSync } = require('crypto') as typeof import('crypto');

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

// Raw 32-byte private key (seed)
const privDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
const privBytes = privDer.slice(-32);
const privHex = privBytes.toString('hex');

// Raw 32-byte public key
const pubDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
const pubBytes = pubDer.slice(-32);
const pubHex = pubBytes.toString('hex');
const pubUint256 = BigInt('0x' + pubHex).toString();

console.log('\n=== GSTD Claim Verifier Keypair ===\n');
console.log('Private key (hex) — store as CLAIM_VERIFIER_SECRET wrangler secret:');
console.log(privHex);
console.log('\nPublic key (uint256 integer) — use in SetClaimVerifier contract call:');
console.log(pubUint256);
console.log('\nPublic key (hex):');
console.log(pubHex);
console.log('\n⚠️  Keep the private key secret. Never commit it to git.');
