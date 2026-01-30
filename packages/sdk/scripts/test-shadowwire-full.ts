#!/usr/bin/env bun
/**
 * ShadowWire Full Test - Deposit, Transfer, Withdraw
 * Using 0.1 SOL minimum requirement
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, VersionedTransaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as nacl from 'tweetnacl';

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
  log('  ShadowWire Full Test (Deposit → Transfer → Withdraw)', 'blue');
  log('='.repeat(70) + '\n', 'blue');

  // Load wallet
  const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

  log(`Wallet: ${wallet.publicKey.toBase58()}`, 'cyan');

  const mainnet = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const mainnetBal = await mainnet.getBalance(wallet.publicKey);
  log(`Mainnet SOL: ${mainnetBal / LAMPORTS_PER_SOL} SOL\n`, 'cyan');

  // Import SDK
  const sw = await import('@radr/shadowwire');
  const client = new sw.ShadowWireClient({ debug: true });

  // Check current shielded balance
  log('--- Step 1: Check Current Shielded Balance ---', 'magenta');
  const balance = await client.getBalance(wallet.publicKey.toBase58(), 'SOL');
  log(`  Available: ${balance.available} lamports (${balance.available / LAMPORTS_PER_SOL} SOL)`, 'cyan');
  log(`  Deposited: ${balance.deposited} lamports`, 'cyan');
  log(`  Pool Address: ${balance.pool_address}`, 'cyan');

  // Step 2: Deposit 0.1 SOL (minimum amount)
  log('\n--- Step 2: Deposit 0.1 SOL ---', 'magenta');
  const depositAmount = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL = 100,000,000 lamports
  log(`  Depositing ${depositAmount} lamports (${depositAmount / LAMPORTS_PER_SOL} SOL)...`, 'cyan');

  try {
    const depositResponse = await client.deposit({
      wallet: wallet.publicKey.toBase58(),
      amount: depositAmount,
    });

    log(`  Deposit Response:`, 'cyan');
    console.log(JSON.stringify(depositResponse, null, 2));

    if (depositResponse.unsigned_tx_base64) {
      log(`  [SUCCESS] Deposit transaction prepared!`, 'green');
      log(`  Pool Address: ${depositResponse.pool_address}`, 'cyan');
      log(`  User Balance PDA: ${depositResponse.user_balance_pda}`, 'cyan');

      // Decode and sign the transaction
      log(`\n  Signing and submitting transaction...`, 'yellow');

      const txBuffer = Buffer.from(depositResponse.unsigned_tx_base64, 'base64');

      // Try to deserialize as VersionedTransaction first, then as legacy Transaction
      let signedTx: string;
      try {
        const versionedTx = VersionedTransaction.deserialize(txBuffer);
        versionedTx.sign([wallet]);
        signedTx = Buffer.from(versionedTx.serialize()).toString('base64');
        log(`  Signed as VersionedTransaction`, 'cyan');
      } catch {
        const legacyTx = Transaction.from(txBuffer);
        legacyTx.partialSign(wallet);
        signedTx = legacyTx.serialize().toString('base64');
        log(`  Signed as Legacy Transaction`, 'cyan');
      }

      // Submit the signed transaction
      log(`  Submitting to network...`, 'yellow');

      // Use the SDK's submit method if available, otherwise submit directly
      if (client.submitTransaction) {
        const submitResult = await client.submitTransaction(signedTx);
        log(`  Submit Result: ${JSON.stringify(submitResult)}`, 'cyan');
      } else {
        // Submit directly to Solana
        const txBuf = Buffer.from(signedTx, 'base64');
        const signature = await mainnet.sendRawTransaction(txBuf, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        log(`  Transaction Signature: ${signature}`, 'green');

        // Wait for confirmation
        log(`  Waiting for confirmation...`, 'yellow');
        const confirmation = await mainnet.confirmTransaction(signature, 'confirmed');
        if (confirmation.value.err) {
          log(`  [ERROR] Transaction failed: ${JSON.stringify(confirmation.value.err)}`, 'red');
        } else {
          log(`  [SUCCESS] Deposit confirmed!`, 'green');
          log(`  Explorer: https://solscan.io/tx/${signature}`, 'cyan');
        }
      }
    }
  } catch (e: any) {
    log(`  [ERROR] Deposit failed: ${e.message}`, 'red');
    if (e.response) {
      console.log('  Response:', e.response);
    }
  }

  // Check balance after deposit
  log('\n--- Step 3: Check Balance After Deposit ---', 'magenta');
  await new Promise(r => setTimeout(r, 2000)); // Wait a bit
  const balanceAfter = await client.getBalance(wallet.publicKey.toBase58(), 'SOL');
  log(`  Available: ${balanceAfter.available} lamports (${balanceAfter.available / LAMPORTS_PER_SOL} SOL)`, 'cyan');

  // Step 4: If we have shielded balance, try an internal transfer
  if (balanceAfter.available > 0) {
    log('\n--- Step 4: Internal Transfer (Amount Hidden) ---', 'magenta');
    const transferAmount = Math.min(balanceAfter.available / 2, 0.01 * LAMPORTS_PER_SOL);

    // Transfer to ourselves for testing
    const testRecipient = wallet.publicKey.toBase58();
    log(`  Transferring ${transferAmount} lamports internally...`, 'cyan');

    try {
      const walletAdapter = {
        signMessage: async (message: Uint8Array) => {
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

      log(`  Transfer Response:`, 'cyan');
      console.log(JSON.stringify(transferResponse, null, 2));

      if (transferResponse.success) {
        log(`  [SUCCESS] Internal transfer completed!`, 'green');
        log(`  TX Signature: ${transferResponse.tx_signature}`, 'cyan');
      }
    } catch (e: any) {
      log(`  [ERROR] Transfer failed: ${e.message}`, 'red');
    }

    // Step 5: Withdraw some funds
    log('\n--- Step 5: Withdraw ---', 'magenta');
    const withdrawAmount = Math.min(balanceAfter.available / 4, 0.01 * LAMPORTS_PER_SOL);
    log(`  Withdrawing ${withdrawAmount} lamports...`, 'cyan');

    try {
      const withdrawResponse = await client.withdraw({
        wallet: wallet.publicKey.toBase58(),
        amount: withdrawAmount,
      });

      log(`  Withdraw Response:`, 'cyan');
      console.log(JSON.stringify(withdrawResponse, null, 2));

      if (withdrawResponse.success) {
        log(`  [SUCCESS] Withdrawal completed!`, 'green');
        log(`  TX Signature: ${withdrawResponse.tx_signature}`, 'cyan');
        log(`  Amount: ${withdrawResponse.amount_withdrawn}`, 'cyan');
        log(`  Fee: ${withdrawResponse.fee}`, 'cyan');
      }
    } catch (e: any) {
      log(`  [ERROR] Withdraw failed: ${e.message}`, 'red');
    }
  }

  // Final balance check
  log('\n--- Final Balance Check ---', 'magenta');
  const finalBalance = await client.getBalance(wallet.publicKey.toBase58(), 'SOL');
  log(`  Shielded: ${finalBalance.available} lamports (${finalBalance.available / LAMPORTS_PER_SOL} SOL)`, 'cyan');

  const finalMainnetBal = await mainnet.getBalance(wallet.publicKey);
  log(`  Mainnet: ${finalMainnetBal / LAMPORTS_PER_SOL} SOL`, 'cyan');

  log('\n' + '='.repeat(70), 'blue');
  log('  ShadowWire Test Complete', 'blue');
  log('='.repeat(70) + '\n', 'blue');
}

main().catch(console.error);
