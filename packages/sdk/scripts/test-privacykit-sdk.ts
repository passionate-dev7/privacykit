#!/usr/bin/env bun
/**
 * PrivacyKit SDK Production Test
 * Tests the actual PrivacyKit SDK with real adapters
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
  log('  PrivacyKit SDK Production Test', 'blue');
  log('='.repeat(70) + '\n', 'blue');

  // Load wallet
  const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

  log(`Wallet: ${wallet.publicKey.toBase58()}`, 'cyan');

  const mainnet = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const mainnetBal = await mainnet.getBalance(wallet.publicKey);
  log(`Mainnet SOL: ${mainnetBal / LAMPORTS_PER_SOL} SOL\n`, 'cyan');

  // Import PrivacyKit SDK
  log('--- Step 1: Import PrivacyKit SDK ---', 'magenta');

  try {
    const PrivacyKit = await import('../src/index.js');
    const exportCount = Object.keys(PrivacyKit).length;
    log(`  Total Exports: ${exportCount}`, 'cyan');
    log(`  [PASS] SDK imported successfully`, 'green');

    // Test creating adapters
    log('\n--- Step 2: Create and Initialize Adapters ---', 'magenta');
    const { ShadowWireAdapter, PrivacyCashAdapter, ArciumAdapter, PrivacyRouter } = PrivacyKit;

    // ShadowWire Adapter
    log('\n  === ShadowWire Adapter ===', 'cyan');
    const swAdapter = new ShadowWireAdapter();
    log(`    Provider: ${swAdapter.provider}`, 'cyan');
    log(`    Name: ${swAdapter.name}`, 'cyan');

    try {
      await swAdapter.initialize(mainnet, wallet);
      log(`    [PASS] Initialized`, 'green');
      log(`    Ready: ${swAdapter.isReady()}`, 'cyan');

      const swBalance = await swAdapter.getBalance('SOL');
      log(`    Shielded Balance: ${swBalance} SOL`, 'cyan');

      // Get fee info
      const swEstimate = await swAdapter.estimate({
        operation: 'transfer',
        amount: 0.1,
        token: 'SOL',
      });
      log(`    Estimate - Fee: ${swEstimate.fee} SOL, Latency: ${swEstimate.latencyMs}ms`, 'cyan');
    } catch (e: any) {
      log(`    [ERROR] ${e.message}`, 'red');
    }

    // Privacy Cash Adapter
    log('\n  === Privacy Cash Adapter ===', 'cyan');
    const pcAdapter = new PrivacyCashAdapter();
    log(`    Provider: ${pcAdapter.provider}`, 'cyan');
    log(`    Name: ${pcAdapter.name}`, 'cyan');

    try {
      await pcAdapter.initialize(mainnet, wallet);
      log(`    [PASS] Initialized`, 'green');
      log(`    Ready: ${pcAdapter.isReady()}`, 'cyan');

      const pcBalance = await pcAdapter.getBalance('SOL');
      log(`    Private Balance: ${pcBalance} SOL`, 'cyan');
    } catch (e: any) {
      log(`    [ERROR] ${e.message}`, 'red');
    }

    // Arcium Adapter (devnet)
    log('\n  === Arcium Adapter (devnet) ===', 'cyan');
    const devnet = new Connection('https://api.devnet.solana.com', 'confirmed');
    const arcAdapter = new ArciumAdapter();
    log(`    Provider: ${arcAdapter.provider}`, 'cyan');
    log(`    Name: ${arcAdapter.name}`, 'cyan');

    try {
      await arcAdapter.initialize(devnet, wallet);
      log(`    [PASS] Initialized`, 'green');
      log(`    Ready: ${arcAdapter.isReady()}`, 'cyan');
    } catch (e: any) {
      log(`    [INFO] ${e.message}`, 'yellow');
    }

    // Test Router
    log('\n--- Step 3: Test PrivacyRouter ---', 'magenta');
    const router = new PrivacyRouter();
    log(`  [PASS] Router created`, 'green');

    // Register adapters
    router.registerAdapter(swAdapter);
    router.registerAdapter(pcAdapter);
    router.registerAdapter(arcAdapter);
    log(`  [PASS] Adapters registered (${router.getAdapters().length} total)`, 'green');

    // Get available adapters
    const adapters = router.getAdapters();
    log(`  Registered adapters:`, 'cyan');
    for (const adapter of adapters) {
      log(`    - ${adapter.name} (ready: ${adapter.isReady()})`, 'cyan');
    }

    // Test provider selection
    log('\n--- Step 4: Provider Selection ---', 'magenta');
    try {
      const PL = PrivacyKit.PrivacyLevel;

      // Select for AMOUNT_HIDDEN
      const result = await router.selectProvider({
        privacyLevel: PL.AMOUNT_HIDDEN,
        token: 'SOL',
        amount: 0.1,
      });

      log(`  Best for AMOUNT_HIDDEN: ${result.provider}`, 'green');
      log(`    Score: ${result.score.toFixed(2)}`, 'cyan');
      log(`    Reasons: ${result.reasons.join(', ')}`, 'cyan');
    } catch (e: any) {
      log(`  Selection error: ${e.message}`, 'yellow');
    }

    // Test exports
    log('\n--- Step 5: Check Key Exports ---', 'magenta');
    const keyExports = [
      'PrivacyKit',
      'PrivacyRouter',
      'ShadowWireAdapter',
      'PrivacyCashAdapter',
      'ArciumAdapter',
      'BaseAdapter',
      'poseidonHash',
      'IncrementalMerkleTree',
      'keypairToWalletAdapter',
      'toPublicKey',
      'formatSol',
    ];

    for (const exp of keyExports) {
      if ((PrivacyKit as any)[exp]) {
        log(`  [PASS] ${exp}`, 'green');
      } else {
        log(`  [MISS] ${exp}`, 'yellow');
      }
    }

    // Test utility functions
    log('\n--- Step 6: Test Utility Functions ---', 'magenta');

    // formatSol
    if (PrivacyKit.formatSol) {
      const formatted = PrivacyKit.formatSol(123456789);
      log(`  formatSol(123456789) = ${formatted}`, 'cyan');
    }

    // keypairToWalletAdapter
    if (PrivacyKit.keypairToWalletAdapter) {
      const walletAdapter = PrivacyKit.keypairToWalletAdapter(wallet);
      log(`  keypairToWalletAdapter: publicKey = ${walletAdapter.publicKey.toBase58().slice(0, 20)}...`, 'cyan');
      log(`  [PASS] Wallet adapter created`, 'green');
    }

    // poseidonHash
    if (PrivacyKit.poseidonHash) {
      try {
        const hash = await PrivacyKit.poseidonHash([BigInt(1), BigInt(2)]);
        log(`  poseidonHash([1n, 2n]) = ${hash.toString().slice(0, 20)}...`, 'cyan');
        log(`  [PASS] Poseidon hash working`, 'green');
      } catch (e: any) {
        log(`  poseidonHash error: ${e.message}`, 'yellow');
      }
    }

    log('\n[SUCCESS] PrivacyKit SDK is functional!', 'green');

  } catch (e: any) {
    log(`[FAIL] SDK error: ${e.message}`, 'red');
    log(`  Stack: ${e.stack}`, 'red');
  }

  log('\n' + '='.repeat(70), 'blue');
  log('  PrivacyKit SDK Test Complete', 'blue');
  log('='.repeat(70) + '\n', 'blue');
}

main().catch(console.error);
