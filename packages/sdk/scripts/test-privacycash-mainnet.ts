#!/usr/bin/env bun
/**
 * Privacy Cash Mainnet Test
 * Tests real deposit/withdraw on mainnet (requires SOL)
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

async function loadWallet(): Promise<Keypair> {
  const walletPath = process.env.WALLET_PATH || path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(walletData));
}

async function main() {
  const network = process.env.NETWORK || 'mainnet';
  const isMainnet = network === 'mainnet';
  
  log('\n' + '='.repeat(70), 'blue');
  log(`  Privacy Cash ${isMainnet ? 'MAINNET' : 'DEVNET'} Test`, 'blue');
  log('  WARNING: This uses real SOL on mainnet!', isMainnet ? 'red' : 'yellow');
  log('='.repeat(70) + '\n', 'blue');

  const rpcUrl = isMainnet 
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';
    
  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = await loadWallet();

  log(`Wallet: ${wallet.publicKey.toBase58()}`, 'cyan');
  log(`Network: ${network}`, 'cyan');
  log(`RPC: ${rpcUrl}`, 'cyan');

  // Get balance
  const solBalance = await connection.getBalance(wallet.publicKey);
  log(`SOL Balance: ${solBalance / LAMPORTS_PER_SOL} SOL\n`, 'cyan');

  // Minimum deposit is 0.01 SOL, need some extra for fees
  if (isMainnet && solBalance < 0.005 * LAMPORTS_PER_SOL) {
    log('[SKIP] Insufficient mainnet SOL for testing (need > 0.005 SOL)', 'yellow');
    log('       Add mainnet SOL to test deposit/withdraw', 'yellow');
    return;
  }

  // Import Privacy Cash
  const { PrivacyCash } = await import('privacycash');
  log('[PASS] Privacy Cash SDK imported', 'green');

  const pcClient = new PrivacyCash({
    RPC_url: rpcUrl,
    owner: wallet,
    enableDebug: true,
  });
  log('[PASS] Privacy Cash client created', 'green');

  // Get shielded balances
  log('\n--- Current Shielded Balances ---', 'magenta');
  
  let shieldedSol = 0;
  try {
    const { lamports } = await pcClient.getPrivateBalance();
    shieldedSol = lamports;
    log(`[PASS] Shielded SOL: ${lamports / LAMPORTS_PER_SOL} SOL`, 'green');
  } catch (e: any) {
    log(`[INFO] Shielded SOL: ${e.message}`, 'yellow');
  }

  try {
    const { amount } = await pcClient.getPrivateBalanceUSDC();
    log(`[PASS] Shielded USDC: ${amount} USDC`, 'green');
  } catch (e: any) {
    log(`[INFO] Shielded USDC: ${e.message}`, 'yellow');
  }

  // Deposit (Shield) - test with available balance
  if (isMainnet && solBalance > 0.005 * LAMPORTS_PER_SOL) {
    // Use smaller amount to leave room for fees
    // Note: Privacy Cash minimum deposit is typically 0.01 SOL
    const depositAmount = Math.min(0.01 * LAMPORTS_PER_SOL, solBalance - 0.003 * LAMPORTS_PER_SOL);

    if (depositAmount >= 0.01 * LAMPORTS_PER_SOL) {
      log(`\n--- Deposit (Shield) ${depositAmount / LAMPORTS_PER_SOL} SOL ---`, 'magenta');

      try {
        log(`  Depositing ${depositAmount / LAMPORTS_PER_SOL} SOL into privacy pool...`, 'cyan');
        const depositResult = await pcClient.deposit({ lamports: depositAmount });

        log(`[PASS] Deposit successful!`, 'green');
        log(`  TX: ${depositResult.tx}`, 'cyan');
        log(`  Explorer: https://explorer.solana.com/tx/${depositResult.tx}`, 'cyan');

        // Check new shielded balance
        await new Promise(r => setTimeout(r, 3000));
        const { lamports: newShielded } = await pcClient.getPrivateBalance();
        log(`  New shielded balance: ${newShielded / LAMPORTS_PER_SOL} SOL`, 'green');
        shieldedSol = newShielded;

      } catch (e: any) {
        log(`[FAIL] Deposit failed: ${e.message}`, 'red');
      }
    } else {
      log(`\n[SKIP] Insufficient balance for minimum deposit (need 0.01 SOL + fees)`, 'yellow');
    }

    // Withdraw (Unshield) - if we have shielded balance
    if (shieldedSol > 0.01 * LAMPORTS_PER_SOL) {
      log('\n--- Withdraw (Unshield) ---', 'magenta');
      const withdrawAmount = Math.min(shieldedSol, 0.01 * LAMPORTS_PER_SOL);
      
      try {
        log(`  Withdrawing ${withdrawAmount / LAMPORTS_PER_SOL} SOL from privacy pool...`, 'cyan');
        const withdrawResult = await pcClient.withdraw({
          lamports: withdrawAmount,
          recipientAddress: wallet.publicKey.toBase58(),
        });
        
        log(`[PASS] Withdraw successful!`, 'green');
        log(`  TX: ${withdrawResult.tx}`, 'cyan');
        log(`  Partial: ${withdrawResult.isPartial}`, 'cyan');
        log(`  Amount: ${(withdrawResult.amount_in_lamports || 0) / LAMPORTS_PER_SOL} SOL`, 'cyan');
        log(`  Fee: ${(withdrawResult.fee_in_lamports || 0) / LAMPORTS_PER_SOL} SOL`, 'cyan');
        log(`  Explorer: https://explorer.solana.com/tx/${withdrawResult.tx}`, 'cyan');
        
      } catch (e: any) {
        log(`[FAIL] Withdraw failed: ${e.message}`, 'red');
      }
    } else {
      log('\n[SKIP] No shielded balance to withdraw', 'yellow');
    }
  }

  // Final balances
  log('\n--- Final Balances ---', 'magenta');
  const finalSol = await connection.getBalance(wallet.publicKey);
  log(`  Wallet SOL: ${finalSol / LAMPORTS_PER_SOL} SOL`, 'cyan');
  
  try {
    const { lamports: finalShielded } = await pcClient.getPrivateBalance();
    log(`  Shielded SOL: ${finalShielded / LAMPORTS_PER_SOL} SOL`, 'cyan');
  } catch (e) {
    // ignore
  }

  log('\n' + '='.repeat(70), 'blue');
  log('  Test Complete', 'blue');
  log('='.repeat(70) + '\n', 'blue');
}

main().catch(console.error);
