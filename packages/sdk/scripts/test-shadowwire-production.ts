#!/usr/bin/env bun
/**
 * ShadowWire Production Adapter Test
 * Tests the actual PrivacyKit adapter with the working API
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
  log('  ShadowWire Production Adapter Test', 'blue');
  log('='.repeat(70) + '\n', 'blue');

  // Load wallet
  const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

  log(`Wallet: ${wallet.publicKey.toBase58()}`, 'cyan');

  // Check balances
  const devnet = new Connection('https://api.devnet.solana.com', 'confirmed');
  const mainnet = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

  const devnetBal = await devnet.getBalance(wallet.publicKey);
  const mainnetBal = await mainnet.getBalance(wallet.publicKey);

  log(`Devnet SOL:  ${devnetBal / LAMPORTS_PER_SOL} SOL`, 'cyan');
  log(`Mainnet SOL: ${mainnetBal / LAMPORTS_PER_SOL} SOL\n`, 'cyan');

  // Import and test our production adapter
  log('--- PrivacyKit ShadowWire Adapter ---', 'magenta');

  try {
    const { ShadowWireProductionAdapter } = await import('../src/adapters/shadowwire-production.js');

    const adapter = new ShadowWireProductionAdapter(undefined, true);
    log('[PASS] Adapter instantiated', 'green');

    // Initialize with mainnet connection
    await adapter.initialize(mainnet, wallet);
    log('[PASS] Adapter initialized', 'green');
    log(`  Ready: ${adapter.isReady()}`, 'cyan');
    log(`  WASM Available: ${adapter.isWASMAvailable()}`, 'cyan');

    // Get balances
    log('\n--- Shielded Balances (via Adapter) ---', 'magenta');
    const tokens = ['SOL', 'USDC', 'ORE', 'RADR'];
    for (const token of tokens) {
      try {
        const balance = await adapter.getBalance(token);
        log(`  ${token}: ${balance} (shielded)`, 'cyan');
      } catch (e: any) {
        log(`  ${token}: Error - ${e.message}`, 'yellow');
      }
    }

    // Get fee info
    log('\n--- Fee Information ---', 'magenta');
    for (const token of ['SOL', 'USDC', 'ORE']) {
      const feePercent = adapter.getFeePercentage(token);
      const minAmount = adapter.getMinimumAmount(token);
      const decimals = adapter.getTokenDecimals(token);
      log(`  ${token}: fee=${feePercent * 100}%, min=${minAmount}, decimals=${decimals}`, 'cyan');
    }

    // Get estimate
    log('\n--- Transfer Estimate ---', 'magenta');
    const estimate = await adapter.estimate({
      operation: 'transfer',
      amount: 0.1,
      token: 'SOL',
    });
    log(`  Fee: ${estimate.fee} SOL`, 'cyan');
    log(`  Latency: ${estimate.latencyMs}ms`, 'cyan');
    log(`  Anonymity Set: ${estimate.anonymitySet}`, 'cyan');

    // Calculate fee breakdown
    log('\n--- Fee Calculation (0.5 SOL transfer) ---', 'magenta');
    const feeCalc = adapter.calculateFee(0.5, 'SOL');
    log(`  Amount: 0.5 SOL`, 'cyan');
    log(`  Fee: ${feeCalc.fee} SOL (${feeCalc.feePercentage * 100}%)`, 'cyan');
    log(`  Net Amount: ${feeCalc.netAmount} SOL`, 'cyan');

    // Check Bulletproof info
    log('\n--- Bulletproof Info ---', 'magenta');
    const bpInfo = adapter.getBulletproofInfo();
    log(`  Default Bit Length: ${bpInfo.DEFAULT_BIT_LENGTH}`, 'cyan');

    log('\n[SUCCESS] ShadowWire adapter is fully functional!', 'green');

  } catch (e: any) {
    log(`[FAIL] Adapter error: ${e.message}`, 'red');
    log(`  Stack: ${e.stack}`, 'red');
  }

  log('\n' + '='.repeat(70), 'blue');
  log('  Test Complete', 'blue');
  log('='.repeat(70) + '\n', 'blue');
}

main().catch(console.error);
