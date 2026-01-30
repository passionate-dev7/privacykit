#!/usr/bin/env bun
/**
 * Arcium Devnet Full Test - MPC Operations
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
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
  log('  Arcium DEVNET Full Test', 'blue');
  log('='.repeat(70) + '\n', 'blue');

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

  log(`Wallet: ${wallet.publicKey.toBase58()}`, 'cyan');
  const balance = await connection.getBalance(wallet.publicKey);
  log(`SOL Balance: ${balance / LAMPORTS_PER_SOL} SOL\n`, 'cyan');

  // Import Arcium SDK
  log('--- Arcium SDK ---', 'magenta');
  const arcium = await import('@arcium-hq/client');
  log(`[PASS] SDK imported (${Object.keys(arcium).length} exports)`, 'green');

  // Get program ID
  if (arcium.getArciumProgramId) {
    const programId = arcium.getArciumProgramId();
    log(`[PASS] Program ID: ${programId}`, 'green');
  }

  // Try to get MXE address
  log('\n--- MXE (Multi-party Execution Environment) ---', 'magenta');
  
  if (arcium.getMXEAccAddress) {
    try {
      const mxeAddr = await arcium.getMXEAccAddress();
      log(`[PASS] MXE Address: ${mxeAddr}`, 'green');
    } catch (e: any) {
      log(`[INFO] MXE Address: ${e.message}`, 'yellow');
    }
  }

  // Try reader SDK for devnet stats
  log('\n--- Arcium Reader SDK ---', 'magenta');
  try {
    const reader = await import('@arcium-hq/reader');
    log(`[PASS] Reader SDK imported`, 'green');
    
    // Get mempool stats
    if (reader.getMempoolPriorityFeeStats) {
      try {
        const stats = await reader.getMempoolPriorityFeeStats(connection);
        log(`[PASS] Mempool stats: ${JSON.stringify(stats)}`, 'green');
      } catch (e: any) {
        log(`[INFO] Mempool stats: ${e.message}`, 'yellow');
      }
    }

    // Get computations in mempool
    if (reader.getComputationsInMempool) {
      try {
        const comps = await reader.getComputationsInMempool(connection);
        log(`[PASS] Computations in mempool: ${comps?.length || 0}`, 'green');
      } catch (e: any) {
        log(`[INFO] Computations: ${e.message}`, 'yellow');
      }
    }

    // Get MXE account info
    if (reader.getMXEAccInfo) {
      try {
        const mxeInfo = await reader.getMXEAccInfo(connection);
        log(`[PASS] MXE Info: ${JSON.stringify(mxeInfo).slice(0, 100)}...`, 'green');
      } catch (e: any) {
        log(`[INFO] MXE Info: ${e.message}`, 'yellow');
      }
    }

    // Get cluster info
    if (reader.getClusterAccInfo) {
      try {
        const clusterInfo = await reader.getClusterAccInfo(connection, 0);
        log(`[PASS] Cluster 0 Info: ${JSON.stringify(clusterInfo).slice(0, 100)}...`, 'green');
      } catch (e: any) {
        log(`[INFO] Cluster Info: ${e.message}`, 'yellow');
      }
    }

  } catch (e: any) {
    log(`[INFO] Reader SDK: ${e.message}`, 'yellow');
  }

  // Test encryption with official SDK
  log('\n--- Encryption Functions ---', 'magenta');
  
  // Test CSplRescueCipher if available
  if (arcium.CSplRescueCipher) {
    try {
      const key = new Uint8Array(32);
      crypto.getRandomValues(key);
      const cipher = new arcium.CSplRescueCipher(key);
      log(`[PASS] CSplRescueCipher created`, 'green');
    } catch (e: any) {
      log(`[INFO] CSplRescueCipher: ${e.message}`, 'yellow');
    }
  }

  // Test AES ciphers
  for (const cipherName of ['Aes128Cipher', 'Aes256Cipher']) {
    if ((arcium as any)[cipherName]) {
      try {
        const keySize = cipherName === 'Aes128Cipher' ? 16 : 32;
        const key = new Uint8Array(keySize);
        crypto.getRandomValues(key);
        const cipher = new (arcium as any)[cipherName](key);
        
        const plaintext = new Uint8Array(16);
        plaintext.fill(42);
        const encrypted = cipher.encrypt(plaintext);
        
        log(`[PASS] ${cipherName}: encrypted ${plaintext.length} -> ${encrypted?.length || '?'} bytes`, 'green');
      } catch (e: any) {
        log(`[INFO] ${cipherName}: ${e.message}`, 'yellow');
      }
    }
  }

  // Test our production adapter
  log('\n--- PrivacyKit Arcium Adapter ---', 'magenta');
  try {
    const { ArciumProductionAdapter } = await import('../src/adapters/arcium-production.js');
    const adapter = new ArciumProductionAdapter();
    
    await adapter.initialize(connection, wallet as any);
    log(`[PASS] Adapter initialized`, 'green');
    log(`  Ready: ${adapter.isReady()}`, 'cyan');
    log(`  Tokens: ${adapter.supportedTokens.join(', ')}`, 'cyan');

    // Get balance
    const solBal = await adapter.getBalance('SOL');
    log(`[PASS] Shielded SOL: ${solBal}`, 'green');

    // Estimate deposit
    const estimate = await adapter.estimate({
      operation: 'deposit',
      amount: 0.1,
      token: 'SOL',
    });
    log(`[PASS] Deposit estimate: fee=${estimate.fee}, latency=${estimate.latencyMs}ms`, 'green');

    // Try deposit (shield)
    log('\n--- Attempting Deposit (Shield) ---', 'magenta');
    try {
      const depositResult = await adapter.deposit({
        amount: 0.01,
        token: 'SOL',
      });
      log(`[PASS] Deposit TX: ${depositResult.signature}`, 'green');
    } catch (e: any) {
      log(`[INFO] Deposit: ${e.message}`, 'yellow');
    }

  } catch (e: any) {
    log(`[FAIL] Adapter: ${e.message}`, 'red');
  }

  log('\n' + '='.repeat(70), 'blue');
  log('  Test Complete', 'blue');
  log('='.repeat(70) + '\n', 'blue');
}

main().catch(console.error);
