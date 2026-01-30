#!/usr/bin/env bun
/**
 * PrivacyKit SDK - Private Transfer Test
 * Tests actual private transfer (sender hidden) via Privacy Cash
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
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
  log('  PrivacyKit SDK - Private Transfer Test', 'blue');
  log('='.repeat(70) + '\n', 'blue');

  // Load wallet
  const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

  log(`Sender Wallet: ${wallet.publicKey.toBase58()}`, 'cyan');

  // Create a recipient (user's second wallet)
  const recipientAddress = 'ia3MLukFMa6zci4nyahxsKVT14yLkFzUkZs3EL5Vsa5'; // User's second wallet
  log(`Recipient: ${recipientAddress}`, 'cyan');

  const mainnet = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

  // Import PrivacyKit SDK
  const { PrivacyCashProductionAdapter, PrivacyLevel } = await import('../src/index.js');

  const pcAdapter = new PrivacyCashProductionAdapter();
  await pcAdapter.initialize(mainnet, wallet);
  log(`[INIT] Privacy Cash adapter ready\n`, 'green');

  // Check private balance
  log('--- Current Private Balance ---', 'magenta');
  const balance = await pcAdapter.getBalance('SOL');
  log(`  Private SOL: ${balance}`, 'cyan');

  if (balance < 0.01) {
    log(`\n[ERROR] Insufficient private balance for transfer. Need at least 0.01 SOL`, 'red');
    return;
  }

  // Execute private transfer
  log('\n--- Executing Private Transfer ---', 'magenta');
  log(`  Amount: 0.01 SOL`, 'cyan');
  log(`  To: ${recipientAddress}`, 'cyan');
  log(`  Privacy Level: SENDER_HIDDEN`, 'cyan');

  try {
    const transferResult = await pcAdapter.transfer({
      recipient: recipientAddress,
      amount: 0.01,
      token: 'SOL',
      privacyLevel: PrivacyLevel.SENDER_HIDDEN,
    });

    log(`\nTransfer Result:`, 'cyan');
    console.log(JSON.stringify(transferResult, null, 2));

    if (transferResult.signature) {
      log(`\n[SUCCESS] Private Transfer Complete!`, 'green');
      log(`  TX Signature: ${transferResult.signature}`, 'cyan');
      log(`  Explorer: https://solscan.io/tx/${transferResult.signature}`, 'cyan');
      log(`  OrbMarkets: https://orbmarkets.io/tx/${transferResult.signature}`, 'cyan');
    }
  } catch (e: any) {
    log(`\n[ERROR] Transfer failed: ${e.message}`, 'red');
    console.log(e);
  }

  // Check balance after transfer
  log('\n--- Balance After Transfer ---', 'magenta');
  const newBalance = await pcAdapter.getBalance('SOL');
  log(`  Private SOL: ${newBalance}`, 'cyan');

  log('\n' + '='.repeat(70), 'blue');
  log('  Test Complete', 'blue');
  log('='.repeat(70) + '\n', 'blue');
}

main().catch(console.error);
