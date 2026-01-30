#!/usr/bin/env bun
/**
 * ShadowWire API Direct Test
 * Tests the ShadowWire/ShadowPay API directly
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as nacl from 'tweetnacl';

const API_BASE = 'https://shadow.radr.fun';

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

async function loadWallet(): Promise<Keypair> {
  const walletPath = process.env.WALLET_PATH || path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(walletData));
}

async function main() {
  log('\n' + '='.repeat(70), 'blue');
  log('  ShadowWire API Direct Test', 'blue');
  log('='.repeat(70) + '\n', 'blue');

  const wallet = await loadWallet();
  log(`Wallet: ${wallet.publicKey.toBase58()}`, 'cyan');

  // Test 1: API Health
  log('\n--- API Health Check ---', 'magenta');
  try {
    const health = await fetch(`${API_BASE}/health`);
    const healthData = await health.text();
    log(`[PASS] API Health: ${health.status} - ${healthData}`, 'green');
  } catch (e: any) {
    log(`[FAIL] API Health: ${e.message}`, 'red');
  }

  // Test 2: Get API Config
  log('\n--- API Configuration ---', 'magenta');
  try {
    const config = await fetch(`${API_BASE}/config`);
    const configData = await config.json();
    log(`[PASS] API Config loaded`, 'green');
    log(`  Tokens: ${Object.keys(configData.tokens || {}).join(', ')}`, 'cyan');
    log(`  Fee: ${configData.fee || 'N/A'}`, 'cyan');
  } catch (e: any) {
    log(`[INFO] Config: ${e.message}`, 'yellow');
  }

  // Test 3: Get pool balances
  log('\n--- Pool Balances ---', 'magenta');
  for (const token of ['SOL', 'USDC', 'RADR']) {
    try {
      const resp = await fetch(`${API_BASE}/pool/${token}/balance`);
      if (resp.ok) {
        const data = await resp.json();
        log(`[PASS] ${token} Pool: ${JSON.stringify(data)}`, 'green');
      } else {
        log(`[INFO] ${token} Pool: ${resp.status} ${resp.statusText}`, 'yellow');
      }
    } catch (e: any) {
      log(`[INFO] ${token} Pool: ${e.message}`, 'yellow');
    }
  }

  // Test 4: Get user balance
  log('\n--- User Balance ---', 'magenta');
  try {
    const resp = await fetch(`${API_BASE}/user/${wallet.publicKey.toBase58()}/balance`);
    if (resp.ok) {
      const data = await resp.json();
      log(`[PASS] User balance: ${JSON.stringify(data)}`, 'green');
    } else {
      const text = await resp.text();
      log(`[INFO] User balance: ${resp.status} - ${text}`, 'yellow');
    }
  } catch (e: any) {
    log(`[INFO] User balance: ${e.message}`, 'yellow');
  }

  // Test 5: Generate signature and attempt transfer
  log('\n--- Generate Transfer Signature ---', 'magenta');
  try {
    const timestamp = Date.now();
    const message = `shadowwire:transfer:${wallet.publicKey.toBase58()}:${wallet.publicKey.toBase58()}:0.001:SOL:${timestamp}`;
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, wallet.secretKey);
    const signatureBase64 = Buffer.from(signature).toString('base64');
    
    log(`[PASS] Signature generated`, 'green');
    log(`  Message: ${message.slice(0, 50)}...`, 'cyan');
    log(`  Signature: ${signatureBase64.slice(0, 30)}...`, 'cyan');

    // Try internal transfer
    log('\n--- Internal Transfer Request ---', 'magenta');
    const transferResp = await fetch(`${API_BASE}/transfer/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderAddress: wallet.publicKey.toBase58(),
        recipientAddress: wallet.publicKey.toBase58(),
        amount: 0.001,
        token: 'SOL',
        signature: signatureBase64,
        timestamp,
      }),
    });
    
    const transferData = await transferResp.text();
    if (transferResp.ok) {
      log(`[PASS] Transfer response: ${transferData}`, 'green');
    } else {
      log(`[INFO] Transfer response: ${transferResp.status} - ${transferData}`, 'yellow');
    }
  } catch (e: any) {
    log(`[INFO] Transfer: ${e.message}`, 'yellow');
  }

  // Test 6: Deposit endpoint
  log('\n--- Deposit Endpoint ---', 'magenta');
  try {
    const timestamp = Date.now();
    const message = `shadowwire:deposit:${wallet.publicKey.toBase58()}:0.01:SOL:${timestamp}`;
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, wallet.secretKey);
    
    const depositResp = await fetch(`${API_BASE}/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderAddress: wallet.publicKey.toBase58(),
        amount: 0.01,
        token: 'SOL',
        signature: Buffer.from(signature).toString('base64'),
        timestamp,
      }),
    });
    
    const depositData = await depositResp.text();
    if (depositResp.ok) {
      log(`[PASS] Deposit response: ${depositData}`, 'green');
    } else {
      log(`[INFO] Deposit response: ${depositResp.status} - ${depositData}`, 'yellow');
    }
  } catch (e: any) {
    log(`[INFO] Deposit: ${e.message}`, 'yellow');
  }

  // Test 7: List available endpoints
  log('\n--- Testing More Endpoints ---', 'magenta');
  const endpoints = [
    '/tokens',
    '/fees',
    '/stats',
    '/api/v1/info',
  ];
  
  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(`${API_BASE}${endpoint}`);
      if (resp.ok) {
        const data = await resp.text();
        log(`[PASS] ${endpoint}: ${data.slice(0, 100)}...`, 'green');
      } else {
        log(`[INFO] ${endpoint}: ${resp.status}`, 'yellow');
      }
    } catch (e: any) {
      log(`[INFO] ${endpoint}: ${e.message}`, 'yellow');
    }
  }

  log('\n' + '='.repeat(70), 'blue');
  log('  Test Complete', 'blue');
  log('='.repeat(70) + '\n', 'blue');
}

main().catch(console.error);
