#!/usr/bin/env bun
/**
 * Detailed Error Report for Privacy Providers
 * Generates comprehensive error logs for debugging
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json');
const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

console.log('='.repeat(80));
console.log('DETAILED ERROR REPORT - Privacy Providers');
console.log('Generated:', new Date().toISOString());
console.log('Wallet:', wallet.publicKey.toBase58());
console.log('='.repeat(80));

// ============================================================================
// SHADOWWIRE ERROR DETAILS
// ============================================================================
console.log('\n\n');
console.log('█'.repeat(80));
console.log('█  SHADOWWIRE (@radr/shadowwire@1.1.15) ERROR DETAILS');
console.log('█'.repeat(80));

console.log('\n--- 1. SDK Import Test ---');
try {
  const sw = await import('@radr/shadowwire');
  console.log('✅ SDK Import: SUCCESS');
  console.log('   Exports:', Object.keys(sw).join(', '));
} catch (e: any) {
  console.log('❌ SDK Import: FAILED');
  console.log('   Error:', e.message);
  console.log('   Stack:', e.stack);
}

console.log('\n--- 2. API Endpoint Tests ---');
const shadowwireEndpoints = [
  { url: 'https://shadow.radr.fun/', method: 'GET', description: 'Root endpoint' },
  { url: 'https://shadow.radr.fun/health', method: 'GET', description: 'Health check' },
  { url: 'https://shadow.radr.fun/api', method: 'GET', description: 'API root' },
  { url: 'https://shadow.radr.fun/api/v1', method: 'GET', description: 'API v1' },
  { url: 'https://shadow.radr.fun/api/v1/config', method: 'GET', description: 'Config endpoint' },
  { url: 'https://shadow.radr.fun/api/v1/tokens', method: 'GET', description: 'Tokens endpoint' },
];

for (const endpoint of shadowwireEndpoints) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const startTime = Date.now();
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);
    const elapsed = Date.now() - startTime;

    let body = '';
    try {
      body = await response.text();
      if (body.length > 500) body = body.slice(0, 500) + '...';
    } catch {}

    console.log(`\n   ${endpoint.description}:`);
    console.log(`   URL: ${endpoint.url}`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Response Time: ${elapsed}ms`);
    console.log(`   Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);
    console.log(`   Body: ${body || '(empty)'}`);
  } catch (e: any) {
    console.log(`\n   ${endpoint.description}:`);
    console.log(`   URL: ${endpoint.url}`);
    console.log(`   ERROR: ${e.message}`);
    if (e.cause) console.log(`   Cause: ${JSON.stringify(e.cause)}`);
  }
}

console.log('\n--- 3. SDK Client Initialization Test ---');
try {
  const sw = await import('@radr/shadowwire');

  // Try to find and call initialization functions
  if (sw.ShadowWire) {
    console.log('   Found: ShadowWire class');
    try {
      const client = new sw.ShadowWire({
        rpcUrl: 'https://api.devnet.solana.com',
        wallet: wallet,
      });
      console.log('   ✅ Client created successfully');

      // Try to call methods
      if (typeof client.getBalance === 'function') {
        try {
          const balance = await client.getBalance('SOL');
          console.log(`   Balance: ${balance}`);
        } catch (e: any) {
          console.log(`   ❌ getBalance error: ${e.message}`);
        }
      }
    } catch (e: any) {
      console.log(`   ❌ Client creation error: ${e.message}`);
      console.log(`   Stack: ${e.stack}`);
    }
  }

  if (sw.createClient) {
    console.log('   Found: createClient function');
    try {
      const client = await sw.createClient({
        rpcUrl: 'https://api.devnet.solana.com',
      });
      console.log('   ✅ Client created via createClient');
    } catch (e: any) {
      console.log(`   ❌ createClient error: ${e.message}`);
    }
  }

  // List all exports with their types
  console.log('\n   All SDK exports:');
  for (const [key, value] of Object.entries(sw)) {
    const type = typeof value;
    const isClass = type === 'function' && /^class\s/.test(Function.prototype.toString.call(value));
    console.log(`     - ${key}: ${isClass ? 'class' : type}`);
  }

} catch (e: any) {
  console.log(`   ❌ SDK test error: ${e.message}`);
}

// ============================================================================
// PRIVACY CASH ERROR DETAILS
// ============================================================================
console.log('\n\n');
console.log('█'.repeat(80));
console.log('█  PRIVACY CASH (privacycash@1.1.11) ERROR DETAILS');
console.log('█'.repeat(80));

console.log('\n--- 1. SDK Import Test ---');
try {
  const pc = await import('privacycash');
  console.log('✅ SDK Import: SUCCESS');
  console.log('   Exports:', Object.keys(pc).join(', '));
} catch (e: any) {
  console.log('❌ SDK Import: FAILED');
  console.log('   Error:', e.message);
  console.log('   Stack:', e.stack);
}

console.log('\n--- 2. API Endpoint Tests ---');
const privacyCashEndpoints = [
  { url: 'https://api3.privacycash.org/', method: 'GET', description: 'Root endpoint' },
  { url: 'https://api3.privacycash.org/health', method: 'GET', description: 'Health check' },
  { url: 'https://api3.privacycash.org/config', method: 'GET', description: 'Config endpoint' },
  { url: 'https://api3.privacycash.org/utxos/range?start=0&end=100', method: 'GET', description: 'UTXO range query' },
  { url: 'https://api.privacycash.org/', method: 'GET', description: 'Alt API root' },
  { url: 'https://api2.privacycash.org/', method: 'GET', description: 'Alt API2 root' },
];

for (const endpoint of privacyCashEndpoints) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const startTime = Date.now();
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);
    const elapsed = Date.now() - startTime;

    let body = '';
    try {
      body = await response.text();
      if (body.length > 500) body = body.slice(0, 500) + '...';
    } catch {}

    console.log(`\n   ${endpoint.description}:`);
    console.log(`   URL: ${endpoint.url}`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Response Time: ${elapsed}ms`);
    console.log(`   Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);
    console.log(`   Body: ${body || '(empty)'}`);
  } catch (e: any) {
    console.log(`\n   ${endpoint.description}:`);
    console.log(`   URL: ${endpoint.url}`);
    console.log(`   ERROR: ${e.message}`);
    console.log(`   Error Name: ${e.name}`);
    if (e.cause) console.log(`   Cause: ${JSON.stringify(e.cause)}`);
  }
}

console.log('\n--- 3. SDK Client Initialization Test ---');
try {
  const { PrivacyCash } = await import('privacycash');

  console.log('   Creating PrivacyCash client...');
  const client = new PrivacyCash({
    RPC_url: 'https://api.mainnet-beta.solana.com',
    owner: wallet,
    enableDebug: true,
  });
  console.log('   ✅ Client created successfully');
  console.log(`   Public Key: ${client.publicKey?.toBase58()}`);

  // Try to get balance
  console.log('\n   Attempting to get private balance...');
  try {
    const { lamports } = await client.getPrivateBalance();
    console.log(`   ✅ Balance: ${lamports / LAMPORTS_PER_SOL} SOL`);
  } catch (e: any) {
    console.log(`   ❌ getPrivateBalance error:`);
    console.log(`      Message: ${e.message}`);
    console.log(`      Name: ${e.name}`);
    if (e.cause) console.log(`      Cause: ${JSON.stringify(e.cause)}`);
    if (e.stack) console.log(`      Stack: ${e.stack.split('\n').slice(0, 5).join('\n')}`);
  }

  // Try to get USDC balance
  console.log('\n   Attempting to get private USDC balance...');
  try {
    const { amount } = await client.getPrivateBalanceUSDC();
    console.log(`   ✅ USDC Balance: ${amount}`);
  } catch (e: any) {
    console.log(`   ❌ getPrivateBalanceUSDC error:`);
    console.log(`      Message: ${e.message}`);
  }

} catch (e: any) {
  console.log(`   ❌ Client creation error: ${e.message}`);
  console.log(`   Stack: ${e.stack}`);
}

// ============================================================================
// SYSTEM INFO
// ============================================================================
console.log('\n\n');
console.log('█'.repeat(80));
console.log('█  SYSTEM INFORMATION');
console.log('█'.repeat(80));

console.log(`\n   Node Version: ${process.version}`);
console.log(`   Bun Version: ${process.versions.bun || 'N/A'}`);
console.log(`   Platform: ${process.platform}`);
console.log(`   Arch: ${process.arch}`);
console.log(`   Date: ${new Date().toISOString()}`);
console.log(`   Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

// Network connectivity test
console.log('\n   Network Connectivity:');
try {
  const googleResp = await fetch('https://www.google.com', { signal: AbortSignal.timeout(5000) });
  console.log(`   - Google: ✅ ${googleResp.status}`);
} catch (e: any) {
  console.log(`   - Google: ❌ ${e.message}`);
}

try {
  const solanaResp = await fetch('https://api.mainnet-beta.solana.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
    signal: AbortSignal.timeout(5000)
  });
  console.log(`   - Solana RPC: ✅ ${solanaResp.status}`);
} catch (e: any) {
  console.log(`   - Solana RPC: ❌ ${e.message}`);
}

console.log('\n' + '='.repeat(80));
console.log('END OF REPORT');
console.log('='.repeat(80));
