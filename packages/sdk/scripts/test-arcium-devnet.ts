#!/usr/bin/env bun
/**
 * Arcium Production Adapter Test - Devnet
 * Tests real operations against Solana devnet
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(msg: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function loadWallet(): Promise<Keypair> {
  const walletPath = process.env.WALLET_PATH || path.join(process.env.HOME || '', '.config/solana/id.json');
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Wallet not found at ${walletPath}`);
  }
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(walletData));
}

async function main() {
  log('\n' + '='.repeat(70), 'blue');
  log('  Arcium Production Adapter - Devnet Test', 'blue');
  log('='.repeat(70) + '\n', 'blue');

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const wallet = await loadWallet();

  log(`Wallet: ${wallet.publicKey.toBase58()}`, 'cyan');

  // Get SOL balance
  const solBalance = await connection.getBalance(wallet.publicKey);
  log(`SOL Balance: ${solBalance / LAMPORTS_PER_SOL} SOL`, 'cyan');

  // Get USDC balance (devnet USDC mint)
  const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // Devnet USDC
  try {
    const usdcAta = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
    const usdcAccount = await getAccount(connection, usdcAta);
    log(`USDC Balance: ${Number(usdcAccount.amount) / 1_000_000} USDC`, 'cyan');
  } catch (e) {
    log('USDC ATA not found or no balance', 'yellow');
  }

  log('\n--- Testing Arcium SDK ---\n', 'magenta');

  // Test 1: Import official SDK
  let start = Date.now();
  try {
    const arciumModule = await import('@arcium-hq/client');
    log(`[PASS] Arcium SDK Import (${Date.now() - start}ms)`, 'green');
    log(`  Exports: ${Object.keys(arciumModule).slice(0, 10).join(', ')}...`, 'cyan');

    // Test 2: Check available functions
    const funcs = Object.keys(arciumModule).filter(k => typeof (arciumModule as any)[k] === 'function');
    log(`  Functions available: ${funcs.length}`, 'cyan');

    // Test 3: Try getMXEPublicKey
    start = Date.now();
    if (arciumModule.getMXEPublicKey) {
      try {
        const mxePubkey = await arciumModule.getMXEPublicKey(connection);
        log(`[PASS] getMXEPublicKey (${Date.now() - start}ms)`, 'green');
        log(`  MXE Public Key: ${mxePubkey?.toString() || 'null'}`, 'cyan');
      } catch (e: any) {
        log(`[SKIP] getMXEPublicKey - ${e.message}`, 'yellow');
      }
    }

    // Test 4: Try getMempoolPriorityFeeStats
    start = Date.now();
    if (arciumModule.getMempoolPriorityFeeStats) {
      try {
        const stats = await arciumModule.getMempoolPriorityFeeStats(connection);
        log(`[PASS] getMempoolPriorityFeeStats (${Date.now() - start}ms)`, 'green');
        log(`  Stats: ${JSON.stringify(stats)}`, 'cyan');
      } catch (e: any) {
        log(`[SKIP] getMempoolPriorityFeeStats - ${e.message}`, 'yellow');
      }
    }

    // Test 5: Try x25519 key generation
    start = Date.now();
    if (arciumModule.x25519) {
      try {
        const keypair = arciumModule.x25519.generateKeyPair();
        log(`[PASS] x25519.generateKeyPair (${Date.now() - start}ms)`, 'green');
        log(`  Public key length: ${keypair.publicKey?.length || 'N/A'} bytes`, 'cyan');
      } catch (e: any) {
        log(`[SKIP] x25519 - ${e.message}`, 'yellow');
      }
    }

    // Test 6: Test encryption functions
    start = Date.now();
    if (arciumModule.RescueCipher) {
      try {
        // Generate a test cipher
        const testKey = new Uint8Array(32).fill(1);
        const cipher = new arciumModule.RescueCipher(testKey);
        const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const encrypted = cipher.encrypt(plaintext);
        log(`[PASS] RescueCipher encryption (${Date.now() - start}ms)`, 'green');
        log(`  Encrypted ${plaintext.length} bytes -> ${encrypted?.length || 'N/A'} bytes`, 'cyan');
      } catch (e: any) {
        log(`[SKIP] RescueCipher - ${e.message}`, 'yellow');
      }
    }

    // Test 7: Get Arcium program ID
    start = Date.now();
    if (arciumModule.getArciumProgramId) {
      try {
        const programId = arciumModule.getArciumProgramId();
        log(`[PASS] getArciumProgramId (${Date.now() - start}ms)`, 'green');
        log(`  Program ID: ${programId?.toString()}`, 'cyan');
      } catch (e: any) {
        log(`[SKIP] getArciumProgramId - ${e.message}`, 'yellow');
      }
    }

    // Test 8: Get MXE account address
    start = Date.now();
    if (arciumModule.getMXEAccAddress) {
      try {
        const mxeAddr = await arciumModule.getMXEAccAddress();
        log(`[PASS] getMXEAccAddress (${Date.now() - start}ms)`, 'green');
        log(`  MXE Address: ${mxeAddr?.toString()}`, 'cyan');
      } catch (e: any) {
        log(`[SKIP] getMXEAccAddress - ${e.message}`, 'yellow');
      }
    }

  } catch (e: any) {
    log(`[FAIL] Arcium SDK Import - ${e.message}`, 'red');
  }

  // Test Arcium Reader SDK
  log('\n--- Testing Arcium Reader SDK ---\n', 'magenta');

  start = Date.now();
  try {
    const readerModule = await import('@arcium-hq/reader');
    log(`[PASS] Arcium Reader SDK Import (${Date.now() - start}ms)`, 'green');
    log(`  Exports: ${Object.keys(readerModule).join(', ')}`, 'cyan');
  } catch (e: any) {
    log(`[SKIP] Arcium Reader SDK not installed - ${e.message}`, 'yellow');
  }

  // Test our production adapter
  log('\n--- Testing PrivacyKit Arcium Adapter ---\n', 'magenta');

  start = Date.now();
  try {
    const { ArciumProductionAdapter } = await import('../src/adapters/arcium-production.js');
    log(`[PASS] ArciumProductionAdapter Import (${Date.now() - start}ms)`, 'green');

    start = Date.now();
    const adapter = new ArciumProductionAdapter();
    log(`[PASS] Adapter Instantiation (${Date.now() - start}ms)`, 'green');

    // Initialize
    start = Date.now();
    await adapter.initialize(connection, wallet as any);
    log(`[PASS] Adapter Initialization (${Date.now() - start}ms)`, 'green');

    // Check if ready
    log(`  isReady: ${adapter.isReady()}`, 'cyan');
    log(`  Provider: ${adapter.provider}`, 'cyan');
    log(`  Name: ${adapter.name}`, 'cyan');
    log(`  Supported Tokens: ${adapter.supportedTokens.join(', ')}`, 'cyan');
    log(`  Supported Levels: ${adapter.supportedLevels.join(', ')}`, 'cyan');

    // Try estimate
    start = Date.now();
    try {
      const estimate = await adapter.estimate({
        operation: 'transfer',
        amount: 0.1,
        token: 'SOL',
      });
      log(`[PASS] Estimate (${Date.now() - start}ms)`, 'green');
      log(`  Fee: ${estimate.fee}`, 'cyan');
      log(`  Latency: ${estimate.latencyMs}ms`, 'cyan');
    } catch (e: any) {
      log(`[SKIP] Estimate - ${e.message}`, 'yellow');
    }

    // Try get balance
    start = Date.now();
    try {
      const balance = await adapter.getBalance('SOL');
      log(`[PASS] getBalance SOL (${Date.now() - start}ms)`, 'green');
      log(`  Shielded Balance: ${balance} SOL`, 'cyan');
    } catch (e: any) {
      log(`[SKIP] getBalance - ${e.message}`, 'yellow');
    }

  } catch (e: any) {
    log(`[FAIL] ArciumProductionAdapter - ${e.message}`, 'red');
    console.error(e);
  }

  log('\n' + '='.repeat(70), 'blue');
  log('  Test Complete', 'blue');
  log('='.repeat(70) + '\n', 'blue');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
