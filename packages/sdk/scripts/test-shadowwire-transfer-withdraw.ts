#!/usr/bin/env bun
/**
 * ShadowWire Transfer & Withdraw Test
 * Tests transfer and withdraw from existing shielded balance
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, VersionedTransaction, Transaction } from '@solana/web3.js';
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
  log('  ShadowWire Transfer & Withdraw Test', 'blue');
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
  log('--- Step 1: Check Shielded Balance ---', 'magenta');
  const balance = await client.getBalance(wallet.publicKey.toBase58(), 'SOL');
  log(`  Available: ${balance.available} lamports (${balance.available / LAMPORTS_PER_SOL} SOL)`, 'cyan');
  log(`  Deposited: ${balance.deposited} lamports`, 'cyan');
  log(`  Pool Address: ${balance.pool_address}`, 'cyan');

  if (balance.available <= 0) {
    log('\n  [SKIP] No shielded balance available for testing', 'yellow');
    return;
  }

  // Create wallet adapter for signing
  const walletAdapter = {
    signMessage: async (message: Uint8Array) => {
      return nacl.sign.detached(message, wallet.secretKey);
    },
  };

  // Step 2: Internal Transfer (amount hidden)
  log('\n--- Step 2: Internal Transfer (Self-Transfer) ---', 'magenta');
  const transferAmount = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL
  log(`  Transferring ${transferAmount} lamports (${transferAmount / LAMPORTS_PER_SOL} SOL) internally...`, 'cyan');

  try {
    const transferResponse = await client.transfer({
      sender: wallet.publicKey.toBase58(),
      recipient: wallet.publicKey.toBase58(), // Self-transfer for testing
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
    log(`  [ERROR] Internal transfer failed: ${e.message}`, 'red');
    if (e.name === 'RecipientNotFoundError') {
      log(`  Note: May need to use external transfer instead`, 'yellow');
    }
  }

  // Wait a moment
  await new Promise(r => setTimeout(r, 2000));

  // Check balance after internal transfer
  log('\n--- Step 3: Balance After Internal Transfer ---', 'magenta');
  const balanceAfterTransfer = await client.getBalance(wallet.publicKey.toBase58(), 'SOL');
  log(`  Available: ${balanceAfterTransfer.available} lamports (${balanceAfterTransfer.available / LAMPORTS_PER_SOL} SOL)`, 'cyan');

  // Step 4: Withdraw (unshield)
  log('\n--- Step 4: Withdraw (Unshield) ---', 'magenta');
  const withdrawAmount = Math.min(balance.available / 4, 0.02 * LAMPORTS_PER_SOL); // 0.02 SOL or 25% of balance
  log(`  Withdrawing ${withdrawAmount} lamports (${withdrawAmount / LAMPORTS_PER_SOL} SOL)...`, 'cyan');

  try {
    const withdrawResponse = await client.withdraw({
      wallet: wallet.publicKey.toBase58(),
      amount: withdrawAmount,
    });

    log(`  Withdraw Response:`, 'cyan');
    console.log(JSON.stringify(withdrawResponse, null, 2));

    if (withdrawResponse.success || withdrawResponse.unsigned_tx_base64) {
      log(`  [SUCCESS] Withdrawal prepared!`, 'green');
      log(`  Amount to Withdraw: ${withdrawResponse.amount_withdrawn} lamports`, 'cyan');
      log(`  Fee: ${withdrawResponse.fee} lamports (${(withdrawResponse.fee / withdrawResponse.amount_withdrawn * 100).toFixed(2)}%)`, 'cyan');

      if (withdrawResponse.unsigned_tx_base64) {
        log(`\n  Signing and submitting withdraw transaction...`, 'yellow');

        const txBuffer = Buffer.from(withdrawResponse.unsigned_tx_base64, 'base64');

        // Try to deserialize and sign
        try {
          const versionedTx = VersionedTransaction.deserialize(txBuffer);
          versionedTx.sign([wallet]);

          const signature = await mainnet.sendRawTransaction(versionedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });

          log(`  TX Signature: ${signature}`, 'green');

          // Wait for confirmation
          log(`  Waiting for confirmation...`, 'yellow');
          const confirmation = await mainnet.confirmTransaction(signature, 'confirmed');
          if (confirmation.value.err) {
            log(`  [ERROR] Transaction failed: ${JSON.stringify(confirmation.value.err)}`, 'red');
          } else {
            log(`  [SUCCESS] Withdrawal confirmed!`, 'green');
            log(`  Explorer: https://solscan.io/tx/${signature}`, 'cyan');
          }
        } catch (signErr: any) {
          log(`  [ERROR] Signing failed: ${signErr.message}`, 'red');

          // Try legacy transaction
          try {
            const legacyTx = Transaction.from(txBuffer);
            legacyTx.partialSign(wallet);

            const signature = await mainnet.sendRawTransaction(legacyTx.serialize(), {
              skipPreflight: false,
              preflightCommitment: 'confirmed',
            });

            log(`  TX Signature (legacy): ${signature}`, 'green');
            const confirmation = await mainnet.confirmTransaction(signature, 'confirmed');
            if (!confirmation.value.err) {
              log(`  [SUCCESS] Withdrawal confirmed!`, 'green');
            }
          } catch (legacyErr: any) {
            log(`  [ERROR] Legacy signing failed: ${legacyErr.message}`, 'red');
          }
        }
      }

      if (withdrawResponse.tx_signature) {
        log(`  TX Signature: ${withdrawResponse.tx_signature}`, 'cyan');
      }
    }
  } catch (e: any) {
    log(`  [ERROR] Withdraw failed: ${e.message}`, 'red');
  }

  // Final balance check
  log('\n--- Final Balance Check ---', 'magenta');
  await new Promise(r => setTimeout(r, 2000));

  const finalShieldedBalance = await client.getBalance(wallet.publicKey.toBase58(), 'SOL');
  log(`  Shielded: ${finalShieldedBalance.available} lamports (${finalShieldedBalance.available / LAMPORTS_PER_SOL} SOL)`, 'cyan');

  const finalMainnetBal = await mainnet.getBalance(wallet.publicKey);
  log(`  Mainnet: ${finalMainnetBal / LAMPORTS_PER_SOL} SOL`, 'cyan');

  log('\n' + '='.repeat(70), 'blue');
  log('  ShadowWire Transfer & Withdraw Test Complete', 'blue');
  log('='.repeat(70) + '\n', 'blue');
}

main().catch(console.error);
