/**
 * Read-only verification of contract accounts listed in deployment-mainnet.json.
 *
 * This checks account code and GSTD Jetton master data through TonAPI. It does
 * not prove that every contract's business logic or cross-contract wiring works.
 */
const fs = require('fs');
const path = require('path');

const NETWORK = process.env.TON_NETWORK || 'mainnet';
const API_BASE = (process.env.TONAPI_BASE_URL || 'https://tonapi.io/v2').replace(/\/$/, '');

async function getJson(url) {
    const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        throw new Error(`${url} returned HTTP ${response.status}`);
    }
    return response.json();
}

function getDeclaredContracts(deployment) {
    const sections = [deployment.contracts, deployment.phase2_completed];
    const contracts = new Map();
    for (const section of sections) {
        if (!section || typeof section !== 'object') continue;
        for (const [name, address] of Object.entries(section)) {
            if (typeof address === 'string' && /^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(address)) {
                contracts.set(name, address);
            }
        }
    }
    return contracts;
}

async function verifyAccount(name, address) {
    try {
        const account = await getJson(`${API_BASE}/blockchain/accounts/${encodeURIComponent(address)}`);
        const active = account.status === 'active';
        const hasCode = typeof account.code === 'string' && account.code.length > 0;
        const passed = active && hasCode;
        console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${active ? 'active' : account.status || 'unknown'} account, ${hasCode ? 'code present' : 'no code'}`);
        return passed;
    } catch (error) {
        console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

async function verifyJettonMaster(address) {
    try {
        const result = await getJson(
            `${API_BASE}/blockchain/accounts/${encodeURIComponent(address)}/methods/get_jetton_data`
        );
        const data = result.decoded;
        if (!result.success || !data || !/^\d+$/.test(String(data.total_supply))) {
            throw new Error('get_jetton_data did not return decoded Jetton state');
        }
        const totalSupply = BigInt(data.total_supply);
        const expectedSupply = 1_000_000_000n * 1_000_000_000n;
        const valid = totalSupply === expectedSupply &&
            data.mintable === false &&
            (data.admin_address === '' || data.admin_address === null);
        console.log(`${valid ? 'PASS' : 'FAIL'} GSTDJetton state: supply=${totalSupply}, mintable=${data.mintable}, admin=${data.admin_address || 'none'}`);
        return valid;
    } catch (error) {
        console.error(`FAIL GSTDJetton state: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

async function main() {
    if (NETWORK !== 'mainnet') {
        throw new Error(`Only mainnet is configured; TON_NETWORK=${NETWORK}`);
    }

    const deploymentFile = path.join(__dirname, '..', `deployment-${NETWORK}.json`);
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    const contracts = getDeclaredContracts(deployment);
    const jettonAddress = contracts.get('GSTDJetton');

    if (contracts.size === 0 || !jettonAddress) {
        throw new Error(`No valid deployed contract addresses found in ${deploymentFile}`);
    }

    console.log(`Read-only TON ${NETWORK} account verification via ${API_BASE}`);
    console.log('Account code checks do not verify business logic, ownership wiring, or end-to-end settlement.');

    const entries = [...contracts.entries()];
    let passed = 0;
    for (let index = 0; index < entries.length; index += 3) {
        const batch = entries.slice(index, index + 3);
        const results = await Promise.all(batch.map(([name, address]) => verifyAccount(name, address)));
        passed += results.filter(Boolean).length;
    }

    const jettonPassed = await verifyJettonMaster(jettonAddress);
    const total = contracts.size + 1;
    passed += Number(jettonPassed);
    console.log(`\n${passed}/${total} read-only checks passed.`);
    if (passed !== total) process.exitCode = 1;
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
