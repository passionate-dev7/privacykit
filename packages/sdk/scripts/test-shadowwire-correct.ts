#!/usr/bin/env bun
/**
 * ShadowWire SDK Test - Using Correct API
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(msg: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function main() {
  log('\n' + '='.repeat(70), 'blue');
  log('  ShadowWire SDK Test (Correct API)', 'blue');
  log('='.repeat(70) + '\n', 'blue');

  // Load wallet
  const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

  log(`Wallet: ${wallet.publicKey.toBase58()}`, 'cyan');

  // Test correct API endpoint first
  log('\n--- API Endpoint Test ---', 'magenta');
  const apiBase = 'https://shadow.radr.fun/shadowpay/api';

  try {
    const balanceResp = await fetch(`${apiBase}/pool/balance/${wallet.publicKey.toBase58()}`);
    const balanceData = await balanceResp.json();
    log(`[PASS] API is reachable: ${balanceResp.status}`, 'green');
    log(`  Response: ${JSON.stringify(balanceData)}`, 'cyan');
  } catch (e: any) {
    log(`[FAIL] API error: ${e.message}`, 'red');
  }

  // Import SDK
  log('\n--- SDK Import ---', 'magenta');
  const sw = await import('@radr/shadowwire');
  log(`[PASS] SDK imported`, 'green');
  log(`  Exports: ${Object.keys(sw).join(', ')}`, 'cyan');

  // Create client
  log('\n--- Client Initialization ---', 'magenta');
  try {
    const client = new sw.ShadowWireClient({
      debug: true,
    });
    log(`[PASS] ShadowWireClient created`, 'green');

    // Get balance using SDK
    log('\n--- Get Balance via SDK ---', 'magenta');
    try {
      const balance = await client.getBalance(wallet.publicKey.toBase58(), 'SOL');
      log(`[PASS] Balance retrieved:`, 'green');
      log(`  Available: ${balance.available} lamports`, 'cyan');
      log(`  Deposited: ${balance.deposited} lamports`, 'cyan');
      log(`  Pool Address: ${balance.pool_address}`, 'cyan');
    } catch (e: any) {
      log(`[FAIL] getBalance error: ${e.message}`, 'red');
    }

    // Check WASM support
    log('\n--- WASM Support ---', 'magenta');
    const wasmSupported = sw.isWASMSupported();
    log(`  WASM Supported: ${wasmSupported}`, wasmSupported ? 'green' : 'yellow');

    // List supported tokens
    log('\n--- Supported Tokens ---', 'magenta');
    log(`  Tokens: ${Object.keys(sw.SUPPORTED_TOKENS || {}).join(', ')}`, 'cyan');
    log(`  Token Mints: ${JSON.stringify(sw.TOKEN_MINTS, null, 2).slice(0, 300)}...`, 'cyan');

    // Try to get balances for multiple tokens
    log('\n--- Multi-Token Balances ---', 'magenta');
    const tokens = ['SOL', 'USDC', 'ORE'];
    for (const token of tokens) {
      try {
        const bal = await client.getBalance(wallet.publicKey.toBase58(), token);
        log(`  ${token}: ${bal.available} available`, 'cyan');
      } catch (e: any) {
        log(`  ${token}: ${e.message}`, 'yellow');
      }
    }

  } catch (e: any) {
    log(`[FAIL] Client error: ${e.message}`, 'red');
    log(`  Stack: ${e.stack}`, 'red');
  }

  log('\n' + '='.repeat(70), 'blue');
  log('  Test Complete', 'blue');
  log('='.repeat(70) + '\n', 'blue');
}

main().catch(console.error);
