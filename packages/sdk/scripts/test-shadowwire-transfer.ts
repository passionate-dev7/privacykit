#!/usr/bin/env bun
/**
 * ShadowWire Transfer Test
 * Tests actual deposit and transfer operations
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
  log('  ShadowWire Transfer Test', 'blue');
  log('='.repeat(70) + '\n', 'blue');

  // Load wallet
  const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

  log(`Wallet: ${wallet.publicKey.toBase58()}`, 'cyan');

  const mainnet = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const mainnetBal = await mainnet.getBalance(wallet.publicKey);
  log(`Mainnet SOL: ${mainnetBal / LAMPORTS_PER_SOL} SOL\n`, 'cyan');

  // Import SDK directly
  const sw = await import('@radr/shadowwire');

  // Create client with debug
  const client = new sw.ShadowWireClient({ debug: true });

  // Check current shielded balance
  log('--- Current Shielded Balance ---', 'magenta');
  const balance = await client.getBalance(wallet.publicKey.toBase58(), 'SOL');
  log(`  Available: ${balance.available} lamports (${balance.available / LAMPORTS_PER_SOL} SOL)`, 'cyan');
  log(`  Deposited: ${balance.deposited} lamports`, 'cyan');
  log(`  Pool Address: ${balance.pool_address}`, 'cyan');

  // Test 1: Deposit
  log('\n--- Test 1: Deposit Request ---', 'magenta');
  const depositAmount = 0.005 * LAMPORTS_PER_SOL; // 0.005 SOL = 5,000,000 lamports
  log(`  Attempting to deposit ${depositAmount} lamports (${depositAmount / LAMPORTS_PER_SOL} SOL)...`, 'cyan');

  try {
    const depositResponse = await client.deposit({
      wallet: wallet.publicKey.toBase58(),
      amount: depositAmount,
    });

    log(`  Response:`, 'cyan');
    console.log(JSON.stringify(depositResponse, null, 2));

    if (depositResponse.unsigned_tx_base64) {
      log(`  [PASS] Deposit transaction prepared!`, 'green');
      log(`  Pool Address: ${depositResponse.pool_address}`, 'cyan');
      log(`  User Balance PDA: ${depositResponse.user_balance_pda}`, 'cyan');
      log(`  TX Base64 length: ${depositResponse.unsigned_tx_base64.length}`, 'cyan');

      // We would need to sign and submit this transaction
      log(`\n  Note: Transaction needs to be signed and submitted`, 'yellow');
    }
  } catch (e: any) {
    log(`  [ERROR] Deposit failed: ${e.message}`, 'red');
    if (e.response) {
      console.log('  Response:', e.response);
    }
  }

  // Test 2: Withdraw (if we have balance)
  if (balance.available > 0) {
    log('\n--- Test 2: Withdraw Request ---', 'magenta');
    const withdrawAmount = Math.min(balance.available, 0.001 * LAMPORTS_PER_SOL);
    log(`  Attempting to withdraw ${withdrawAmount} lamports...`, 'cyan');

    try {
      const withdrawResponse = await client.withdraw({
        wallet: wallet.publicKey.toBase58(),
        amount: withdrawAmount,
      });

      log(`  Response:`, 'cyan');
      console.log(JSON.stringify(withdrawResponse, null, 2));

      if (withdrawResponse.success) {
        log(`  [PASS] Withdrawal successful!`, 'green');
        log(`  TX Signature: ${withdrawResponse.tx_signature}`, 'cyan');
        log(`  Amount: ${withdrawResponse.amount_withdrawn}`, 'cyan');
        log(`  Fee: ${withdrawResponse.fee}`, 'cyan');
      }
    } catch (e: any) {
      log(`  [ERROR] Withdraw failed: ${e.message}`, 'red');
    }
  } else {
    log('\n--- Test 2: Withdraw ---', 'magenta');
    log(`  [SKIP] No shielded balance to withdraw`, 'yellow');
  }

  // Test 3: Transfer (internal - amount hidden)
  log('\n--- Test 3: Internal Transfer Request ---', 'magenta');
  const testRecipient = 'So11111111111111111111111111111111111111112'; // Test recipient

  if (balance.available > 0) {
    const transferAmount = Math.min(balance.available / 2, 0.001 * LAMPORTS_PER_SOL);
    log(`  Attempting internal transfer of ${transferAmount} lamports to ${testRecipient.slice(0, 20)}...`, 'cyan');

    try {
      // Create wallet adapter for signing
      const walletAdapter = {
        signMessage: async (message: Uint8Array) => {
          const nacl = await import('tweetnacl');
          return nacl.sign.detached(message, wallet.secretKey);
        },
      };

      const transferResponse = await client.transfer({
        sender: wallet.publicKey.toBase58(),
        recipient: testRecipient,
        amount: transferAmount,
        token: 'SOL',
        type: 'internal',
        wallet: walletAdapter,
      });

      log(`  Response:`, 'cyan');
      console.log(JSON.stringify(transferResponse, null, 2));

      if (transferResponse.success) {
        log(`  [PASS] Transfer successful!`, 'green');
        log(`  TX Signature: ${transferResponse.tx_signature}`, 'cyan');
      }
    } catch (e: any) {
      log(`  [ERROR] Transfer failed: ${e.message}`, 'red');
      if (e.name === 'RecipientNotFoundError') {
        log(`  Note: Recipient doesn't have a ShadowWire account yet`, 'yellow');
      }
    }
  } else {
    log(`  [SKIP] No shielded balance for transfer`, 'yellow');
  }

  // Test 4: External Transfer
  log('\n--- Test 4: External Transfer Request ---', 'magenta');
  if (balance.available > 0) {
    const transferAmount = Math.min(balance.available / 2, 0.001 * LAMPORTS_PER_SOL);
    log(`  Attempting external transfer of ${transferAmount} lamports...`, 'cyan');

    try {
      const walletAdapter = {
        signMessage: async (message: Uint8Array) => {
          const nacl = await import('tweetnacl');
          return nacl.sign.detached(message, wallet.secretKey);
        },
      };

      const transferResponse = await client.transfer({
        sender: wallet.publicKey.toBase58(),
        recipient: wallet.publicKey.toBase58(), // Send back to self for testing
        amount: transferAmount,
        token: 'SOL',
        type: 'external',
        wallet: walletAdapter,
      });

      log(`  Response:`, 'cyan');
      console.log(JSON.stringify(transferResponse, null, 2));

      if (transferResponse.success) {
        log(`  [PASS] External transfer successful!`, 'green');
      }
    } catch (e: any) {
      log(`  [ERROR] External transfer failed: ${e.message}`, 'red');
    }
  } else {
    log(`  [SKIP] No shielded balance for transfer`, 'yellow');
  }

  log('\n' + '='.repeat(70), 'blue');
  log('  Summary', 'blue');
  log('='.repeat(70), 'blue');
  log(`
  ShadowWire SDK Transfer Test Results:

  The SDK provides these operations:
  - deposit(): Returns unsigned transaction to deposit funds
  - withdraw(): Withdraws from shielded balance
  - transfer(): Internal (amount hidden) or external transfers

  Current wallet shielded balance: ${balance.available / LAMPORTS_PER_SOL} SOL

  To test actual transfers, you need:
  1. Deposit funds first (sign and submit the deposit tx)
  2. Then transfer or withdraw from shielded balance
  `, 'cyan');

  log('='.repeat(70) + '\n', 'blue');
}

main().catch(console.error);
