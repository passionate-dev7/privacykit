#!/usr/bin/env npx ts-node
/**
 * PrivacyKit Mainnet/Devnet Integration Test
 *
 * Tests all adapters against real networks.
 *
 * Usage:
 *   # Devnet (recommended first)
 *   NETWORK=devnet WALLET_PATH=~/.config/solana/id.json npx ts-node scripts/test-mainnet.ts
 *
 *   # Mainnet (use small amounts!)
 *   NETWORK=mainnet WALLET_PATH=~/.config/solana/id.json npx ts-node scripts/test-mainnet.ts
 *
 * Environment Variables:
 *   NETWORK       - 'devnet' or 'mainnet' (default: devnet)
 *   WALLET_PATH   - Path to Solana keypair JSON file
 *   RPC_URL       - Custom RPC URL (optional)
 *   TEST_AMOUNT   - Amount to test with (default: 0.001 SOL)
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Import PrivacyKit
import { PrivacyKit } from '../src/core/privacykit';
import { PrivacyProvider, PrivacyLevel } from '../src/types';
import { ShadowPayApiClient, SHADOWPAY_TOKENS } from '../src/shadowwire';

// ============================================================================
// Configuration
// ============================================================================

const NETWORK = (process.env.NETWORK || 'devnet') as 'devnet' | 'mainnet';
const WALLET_PATH = process.env.WALLET_PATH || path.join(process.env.HOME || '', '.config/solana/id.json');
const TEST_AMOUNT = parseFloat(process.env.TEST_AMOUNT || '0.001');

const RPC_URLS = {
  devnet: process.env.RPC_URL || 'https://api.devnet.solana.com',
  mainnet: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
};

// ============================================================================
// Helpers
// ============================================================================

function loadWallet(walletPath: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

function createWalletAdapter(keypair: Keypair) {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async (tx: any) => {
      tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async (txs: any[]) => {
      txs.forEach(tx => tx.partialSign(keypair));
      return txs;
    },
    signMessage: async (message: Uint8Array) => {
      const { sign } = await import('@noble/ed25519');
      return sign(message, keypair.secretKey.slice(0, 32));
    },
  };
}

async function getBalance(connection: Connection, publicKey: PublicKey): Promise<number> {
  const balance = await connection.getBalance(publicKey);
  return balance / LAMPORTS_PER_SOL;
}

function log(emoji: string, message: string, data?: any) {
  console.log(`${emoji} ${message}`);
  if (data) console.log('   ', JSON.stringify(data, null, 2).split('\n').join('\n    '));
}

// ============================================================================
// Test Functions
// ============================================================================

async function testShadowWireAPI() {
  log('🔌', 'Testing ShadowWire API connectivity...');

  const client = new ShadowPayApiClient({ debug: true });

  // Test health
  const health = await client.health();
  log('✅', `ShadowWire API Status: ${health.status}`);

  // Test token support
  log('📋', 'Supported Tokens:', Object.keys(SHADOWPAY_TOKENS));

  // Test fee calculation
  const fee = client.calculateFee(1.0, 'SOL');
  log('💰', `Fee for 1 SOL transfer: ${fee} SOL (${fee * 100}%)`);

  return { success: true, health };
}

async function testPrivacyCashAPI() {
  log('🔌', 'Testing Privacy Cash API connectivity...');

  const apiUrl = 'https://api3.privacycash.org';

  try {
    // Test config endpoint
    const response = await fetch(`${apiUrl}/config`);
    if (response.ok) {
      const config = await response.json();
      log('✅', 'Privacy Cash API connected', config);
      return { success: true, config };
    } else {
      log('⚠️', `Privacy Cash API returned ${response.status}`);
      return { success: false, status: response.status };
    }
  } catch (error) {
    log('❌', 'Privacy Cash API connection failed', { error: String(error) });
    return { success: false, error: String(error) };
  }
}

async function testPrivacyKitInitialization(
  connection: Connection,
  wallet: ReturnType<typeof createWalletAdapter>
) {
  log('🚀', 'Initializing PrivacyKit...');

  const privacyKit = new PrivacyKit({
    network: NETWORK === 'mainnet' ? 'mainnet-beta' : 'devnet',
    rpcUrl: RPC_URLS[NETWORK],
    debug: true,
  });

  await privacyKit.initialize(connection, wallet);

  const providers = privacyKit.getAvailableProviders();
  log('✅', 'PrivacyKit initialized', { providers });

  return privacyKit;
}

async function testEstimates(privacyKit: PrivacyKit) {
  log('📊', 'Testing fee estimates...');

  const estimates = await Promise.all([
    privacyKit.estimate({
      operation: 'transfer',
      amount: TEST_AMOUNT,
      token: 'SOL',
      privacy: PrivacyLevel.AMOUNT_HIDDEN,
    }),
    privacyKit.estimate({
      operation: 'deposit',
      amount: TEST_AMOUNT,
      token: 'SOL',
    }),
  ]);

  log('✅', 'Transfer estimate', estimates[0]);
  log('✅', 'Deposit estimate', estimates[1]);

  return estimates;
}

async function testShadowWireTransfer(
  privacyKit: PrivacyKit,
  wallet: ReturnType<typeof createWalletAdapter>,
  recipientAddress: string
) {
  log('💸', `Testing ShadowWire transfer of ${TEST_AMOUNT} SOL...`);

  try {
    const result = await privacyKit.transfer({
      recipient: recipientAddress,
      amount: TEST_AMOUNT,
      token: 'SOL',
      privacy: PrivacyLevel.AMOUNT_HIDDEN,
      provider: PrivacyProvider.SHADOWWIRE,
    });

    log('✅', 'ShadowWire transfer complete', {
      signature: result.signature,
      fee: result.fee,
      provider: result.provider,
    });

    return result;
  } catch (error) {
    log('❌', 'ShadowWire transfer failed', { error: String(error) });
    throw error;
  }
}

async function testPrivacyCashDeposit(
  privacyKit: PrivacyKit,
  wallet: ReturnType<typeof createWalletAdapter>
) {
  log('🏦', `Testing Privacy Cash deposit of ${TEST_AMOUNT} SOL...`);

  try {
    const result = await privacyKit.deposit({
      amount: TEST_AMOUNT,
      token: 'SOL',
      provider: PrivacyProvider.PRIVACY_CASH,
    });

    log('✅', 'Privacy Cash deposit complete', {
      signature: result.signature,
      commitment: result.commitment?.substring(0, 50) + '...',
      fee: result.fee,
    });

    // IMPORTANT: Save this commitment for withdrawal!
    log('⚠️', 'SAVE THIS COMMITMENT FOR WITHDRAWAL:', result.commitment);

    return result;
  } catch (error) {
    log('❌', 'Privacy Cash deposit failed', { error: String(error) });
    throw error;
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🔐 PrivacyKit Integration Test');
  console.log('='.repeat(60));
  console.log(`Network: ${NETWORK}`);
  console.log(`RPC: ${RPC_URLS[NETWORK]}`);
  console.log(`Test Amount: ${TEST_AMOUNT} SOL`);
  console.log('='.repeat(60) + '\n');

  // Load wallet
  log('🔑', `Loading wallet from ${WALLET_PATH}`);
  const keypair = loadWallet(WALLET_PATH);
  const wallet = createWalletAdapter(keypair);
  log('✅', `Wallet loaded: ${keypair.publicKey.toBase58()}`);

  // Connect to Solana
  const connection = new Connection(RPC_URLS[NETWORK], 'confirmed');
  const balance = await getBalance(connection, keypair.publicKey);
  log('💰', `Wallet balance: ${balance} SOL`);

  if (balance < TEST_AMOUNT * 2) {
    log('❌', `Insufficient balance! Need at least ${TEST_AMOUNT * 2} SOL`);
    if (NETWORK === 'devnet') {
      log('💡', 'Get devnet SOL: solana airdrop 1');
    }
    process.exit(1);
  }

  // Run tests
  const results: Record<string, any> = {};

  // 1. Test API connectivity
  console.log('\n--- API Connectivity Tests ---\n');
  results.shadowwireApi = await testShadowWireAPI();
  results.privacyCashApi = await testPrivacyCashAPI();

  // 2. Initialize PrivacyKit
  console.log('\n--- PrivacyKit Initialization ---\n');
  const privacyKit = await testPrivacyKitInitialization(connection, wallet);

  // 3. Test estimates (safe, no transactions)
  console.log('\n--- Fee Estimates ---\n');
  results.estimates = await testEstimates(privacyKit);

  // 4. Ask before real transactions
  console.log('\n--- Transaction Tests ---\n');
  console.log('⚠️  The following tests will execute REAL transactions!');
  console.log(`    Amount: ${TEST_AMOUNT} SOL`);
  console.log(`    Network: ${NETWORK}`);
  console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...\n');

  await new Promise(resolve => setTimeout(resolve, 5000));

  // 5. Test ShadowWire transfer (sends to self)
  try {
    results.shadowwireTransfer = await testShadowWireTransfer(
      privacyKit,
      wallet,
      keypair.publicKey.toBase58() // Send to self for testing
    );
  } catch (error) {
    results.shadowwireTransfer = { error: String(error) };
  }

  // 6. Test Privacy Cash deposit
  try {
    results.privacyCashDeposit = await testPrivacyCashDeposit(privacyKit, wallet);
  } catch (error) {
    results.privacyCashDeposit = { error: String(error) };
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 Test Summary');
  console.log('='.repeat(60));

  for (const [test, result] of Object.entries(results)) {
    const status = result.error ? '❌' : '✅';
    console.log(`${status} ${test}: ${result.error || 'passed'}`);
  }

  console.log('\n✨ Integration tests complete!\n');
}

main().catch(console.error);
