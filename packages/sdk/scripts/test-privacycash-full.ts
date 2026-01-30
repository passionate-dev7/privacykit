#!/usr/bin/env bun
/**
 * Privacy Cash Full Test - Deposit, Transfer, Withdraw
 * Using api3.privacycash.org
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
  log('  Privacy Cash Full Test (Deposit → Withdraw)', 'blue');
  log('='.repeat(70) + '\n', 'blue');

  // Load wallet
  const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

  log(`Wallet: ${wallet.publicKey.toBase58()}`, 'cyan');

  const mainnet = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const mainnetBal = await mainnet.getBalance(wallet.publicKey);
  log(`Mainnet SOL: ${mainnetBal / LAMPORTS_PER_SOL} SOL\n`, 'cyan');

  // Test API connectivity first
  log('--- Step 0: Test API Connectivity ---', 'magenta');
  try {
    const healthResp = await fetch('https://api3.privacycash.org/', {
      signal: AbortSignal.timeout(10000),
    });
    log(`  API Status: ${healthResp.status} ${healthResp.statusText}`, healthResp.ok ? 'green' : 'red');
    const healthText = await healthResp.text();
    log(`  Response: ${healthText.slice(0, 200)}`, 'cyan');
  } catch (e: any) {
    log(`  [ERROR] API unreachable: ${e.message}`, 'red');
    return;
  }

  // Import Privacy Cash SDK
  log('\n--- Step 1: Initialize Privacy Cash Client ---', 'magenta');
  try {
    const { PrivacyCash } = await import('privacycash');

    const client = new PrivacyCash({
      RPC_url: 'https://api.mainnet-beta.solana.com',
      owner: wallet,
      enableDebug: true,
    });

    log(`  [SUCCESS] Client initialized`, 'green');
    log(`  Public Key: ${client.publicKey?.toBase58()}`, 'cyan');

    // Step 2: Check private balance
    log('\n--- Step 2: Check Private Balance ---', 'magenta');
    try {
      const { lamports, utxos } = await client.getPrivateBalance();
      log(`  Private Balance: ${lamports / LAMPORTS_PER_SOL} SOL`, 'cyan');
      log(`  UTXOs: ${utxos?.length || 0}`, 'cyan');
    } catch (e: any) {
      log(`  [INFO] No private balance yet: ${e.message}`, 'yellow');
    }

    // Step 3: Deposit SOL (0.01 SOL for testing)
    log('\n--- Step 3: Deposit 0.01 SOL ---', 'magenta');
    const depositAmount = 0.01 * LAMPORTS_PER_SOL;
    log(`  Depositing ${depositAmount} lamports (${depositAmount / LAMPORTS_PER_SOL} SOL)...`, 'cyan');

    try {
      // Privacy Cash expects { lamports: amount } format
      const depositResult = await client.deposit({ lamports: depositAmount });

      log(`  Deposit Result:`, 'cyan');
      console.log(JSON.stringify(depositResult, null, 2));

      if (depositResult.signature || depositResult.txSignature) {
        const sig = depositResult.signature || depositResult.txSignature;
        log(`  [SUCCESS] Deposit submitted!`, 'green');
        log(`  TX Signature: ${sig}`, 'cyan');
        log(`  Explorer: https://solscan.io/tx/${sig}`, 'cyan');

        // Wait for confirmation
        log(`  Waiting for confirmation...`, 'yellow');
        await mainnet.confirmTransaction(sig, 'confirmed');
        log(`  [SUCCESS] Deposit confirmed!`, 'green');
      }
    } catch (e: any) {
      log(`  [ERROR] Deposit failed: ${e.message}`, 'red');
      if (e.logs) {
        log(`  Logs: ${e.logs.join('\n')}`, 'red');
      }
    }

    // Step 4: Check balance after deposit
    log('\n--- Step 4: Check Balance After Deposit ---', 'magenta');
    await new Promise(r => setTimeout(r, 3000)); // Wait for state to update

    try {
      const { lamports: newBalance, utxos } = await client.getPrivateBalance();
      log(`  Private Balance: ${newBalance / LAMPORTS_PER_SOL} SOL`, 'cyan');
      log(`  UTXOs: ${utxos?.length || 0}`, 'cyan');

      // Step 5: If we have balance, try withdrawal
      if (newBalance > 0) {
        log('\n--- Step 5: Withdraw ---', 'magenta');
        const withdrawAmount = Math.min(newBalance / 2, 0.005 * LAMPORTS_PER_SOL);
        log(`  Withdrawing ${withdrawAmount} lamports...`, 'cyan');

        try {
          // Privacy Cash expects { lamports: amount } format
          const withdrawResult = await client.withdraw({ lamports: withdrawAmount });

          log(`  Withdraw Result:`, 'cyan');
          console.log(JSON.stringify(withdrawResult, null, 2));

          if (withdrawResult.signature || withdrawResult.txSignature) {
            const sig = withdrawResult.signature || withdrawResult.txSignature;
            log(`  [SUCCESS] Withdrawal submitted!`, 'green');
            log(`  TX Signature: ${sig}`, 'cyan');
            log(`  Explorer: https://solscan.io/tx/${sig}`, 'cyan');
          }
        } catch (e: any) {
          log(`  [ERROR] Withdraw failed: ${e.message}`, 'red');
        }
      }
    } catch (e: any) {
      log(`  [ERROR] Balance check failed: ${e.message}`, 'red');
    }

    // Final balance check
    log('\n--- Final Balance Check ---', 'magenta');
    const finalMainnetBal = await mainnet.getBalance(wallet.publicKey);
    log(`  Mainnet SOL: ${finalMainnetBal / LAMPORTS_PER_SOL} SOL`, 'cyan');

  } catch (e: any) {
    log(`  [ERROR] Client error: ${e.message}`, 'red');
    log(`  Stack: ${e.stack}`, 'red');
  }

  log('\n' + '='.repeat(70), 'blue');
  log('  Privacy Cash Test Complete', 'blue');
  log('='.repeat(70) + '\n', 'blue');
}

main().catch(console.error);
