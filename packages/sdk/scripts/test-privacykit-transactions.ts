#!/usr/bin/env bun
/**
 * PrivacyKit SDK - Real Transaction Test
 * Tests actual deposit, transfer, and withdraw via SDK adapters
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
  log('  PrivacyKit SDK - Real Transaction Test', 'blue');
  log('='.repeat(70) + '\n', 'blue');

  // Load wallet
  const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

  log(`Wallet: ${wallet.publicKey.toBase58()}`, 'cyan');

  const mainnet = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const mainnetBal = await mainnet.getBalance(wallet.publicKey);
  log(`Mainnet SOL: ${mainnetBal / LAMPORTS_PER_SOL} SOL\n`, 'cyan');

  // Import PrivacyKit SDK - use Production adapters that use official SDKs
  const { ShadowWireProductionAdapter, PrivacyCashProductionAdapter, PrivacyLevel } = await import('../src/index.js');

  // =========================================================================
  // Test 1: ShadowWire Adapter - Deposit & Withdraw
  // =========================================================================
  log('█'.repeat(70), 'blue');
  log('  TEST 1: ShadowWire Adapter Transactions', 'blue');
  log('█'.repeat(70) + '\n', 'blue');

  const swAdapter = new ShadowWireProductionAdapter();
  await swAdapter.initialize(mainnet, wallet);
  log(`[INIT] ShadowWire Production adapter ready: ${swAdapter.isReady()}`, 'green');

  // Check initial balance
  const swBalanceBefore = await swAdapter.getBalance('SOL');
  log(`[BALANCE] Shielded SOL before: ${swBalanceBefore}`, 'cyan');

  // Deposit 0.1 SOL (minimum)
  log('\n--- Deposit via ShadowWire Adapter ---', 'magenta');
  try {
    const depositResult = await swAdapter.deposit({
      amount: 0.1,
      token: 'SOL',
    });

    log(`Deposit Result:`, 'cyan');
    console.log(JSON.stringify(depositResult, null, 2));

    if (depositResult.signature) {
      log(`[SUCCESS] Deposit TX: ${depositResult.signature}`, 'green');
      log(`Explorer: https://solscan.io/tx/${depositResult.signature}`, 'cyan');
    } else if (depositResult.unsignedTransaction) {
      log(`[INFO] Deposit requires signing - unsigned TX returned`, 'yellow');
    }
  } catch (e: any) {
    log(`[ERROR] Deposit failed: ${e.message}`, 'red');
  }

  // Check balance after deposit
  await new Promise(r => setTimeout(r, 3000));
  const swBalanceAfterDeposit = await swAdapter.getBalance('SOL');
  log(`\n[BALANCE] Shielded SOL after deposit: ${swBalanceAfterDeposit}`, 'cyan');

  // Withdraw if we have balance
  if (swBalanceAfterDeposit > 0) {
    log('\n--- Withdraw via ShadowWire Adapter ---', 'magenta');
    try {
      const withdrawResult = await swAdapter.withdraw({
        amount: swBalanceAfterDeposit,
        token: 'SOL',
      });

      log(`Withdraw Result:`, 'cyan');
      console.log(JSON.stringify(withdrawResult, null, 2));

      if (withdrawResult.signature) {
        log(`[SUCCESS] Withdraw TX: ${withdrawResult.signature}`, 'green');
      }
    } catch (e: any) {
      log(`[ERROR] Withdraw failed: ${e.message}`, 'red');
    }
  }

  // =========================================================================
  // Test 2: Privacy Cash Adapter - Deposit & Withdraw
  // =========================================================================
  log('\n' + '█'.repeat(70), 'blue');
  log('  TEST 2: Privacy Cash Adapter Transactions', 'blue');
  log('█'.repeat(70) + '\n', 'blue');

  const pcAdapter = new PrivacyCashProductionAdapter();
  await pcAdapter.initialize(mainnet, wallet);
  log(`[INIT] Privacy Cash Production adapter ready: ${pcAdapter.isReady()}`, 'green');

  // Check initial balance
  const pcBalanceBefore = await pcAdapter.getBalance('SOL');
  log(`[BALANCE] Private SOL before: ${pcBalanceBefore}`, 'cyan');

  // Deposit 0.01 SOL
  log('\n--- Deposit via Privacy Cash Adapter ---', 'magenta');
  try {
    const depositResult = await pcAdapter.deposit({
      amount: 0.01,
      token: 'SOL',
    });

    log(`Deposit Result:`, 'cyan');
    console.log(JSON.stringify(depositResult, null, 2));

    if (depositResult.signature) {
      log(`[SUCCESS] Deposit TX: ${depositResult.signature}`, 'green');
      log(`Explorer: https://solscan.io/tx/${depositResult.signature}`, 'cyan');
    }
  } catch (e: any) {
    log(`[ERROR] Deposit failed: ${e.message}`, 'red');
  }

  // Check balance after deposit
  await new Promise(r => setTimeout(r, 3000));
  const pcBalanceAfterDeposit = await pcAdapter.getBalance('SOL');
  log(`\n[BALANCE] Private SOL after deposit: ${pcBalanceAfterDeposit}`, 'cyan');

  // =========================================================================
  // Test 3: Private Transfer (if balance available)
  // =========================================================================
  if (pcBalanceAfterDeposit > 0.01) {
    log('\n' + '█'.repeat(70), 'blue');
    log('  TEST 3: Private Transfer via Privacy Cash', 'blue');
    log('█'.repeat(70) + '\n', 'blue');

    try {
      const transferResult = await pcAdapter.transfer({
        recipient: wallet.publicKey.toBase58(), // Self-transfer for test
        amount: 0.005,
        token: 'SOL',
        privacyLevel: PrivacyLevel.SENDER_HIDDEN,
      });

      log(`Transfer Result:`, 'cyan');
      console.log(JSON.stringify(transferResult, null, 2));

      if (transferResult.signature) {
        log(`[SUCCESS] Transfer TX: ${transferResult.signature}`, 'green');
      }
    } catch (e: any) {
      log(`[ERROR] Transfer failed: ${e.message}`, 'red');
    }
  }

  // Final balances
  log('\n' + '='.repeat(70), 'blue');
  log('  Final Balances', 'blue');
  log('='.repeat(70), 'blue');

  const finalMainnetBal = await mainnet.getBalance(wallet.publicKey);
  const finalSwBalance = await swAdapter.getBalance('SOL');
  const finalPcBalance = await pcAdapter.getBalance('SOL');

  log(`  Mainnet SOL:     ${finalMainnetBal / LAMPORTS_PER_SOL} SOL`, 'cyan');
  log(`  ShadowWire:      ${finalSwBalance} SOL (shielded)`, 'cyan');
  log(`  Privacy Cash:    ${finalPcBalance} SOL (private)`, 'cyan');

  log('\n' + '='.repeat(70), 'blue');
  log('  Test Complete', 'blue');
  log('='.repeat(70) + '\n', 'blue');
}

main().catch(console.error);
