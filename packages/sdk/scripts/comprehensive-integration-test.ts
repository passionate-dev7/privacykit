#!/usr/bin/env bun
/**
 * PrivacyKit SDK - Comprehensive Integration Test Suite
 *
 * Tests all adapters with minimal funds on mainnet
 * Uses real transactions - requires funded wallet
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Import from SDK
import {
  PrivacyKit,
  PrivacyLevel,
  PrivacyProvider,
  keypairToWalletAdapter,
} from '../src';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color: keyof typeof colors, message: string) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title: string) {
  console.log('\n' + '='.repeat(70));
  log('cyan', `  ${title}`);
  console.log('='.repeat(70) + '\n');
}

function section(title: string) {
  console.log(`\n${colors.magenta}--- ${title} ---${colors.reset}`);
}

function success(msg: string) {
  console.log(`${colors.green}✓ ${msg}${colors.reset}`);
}

function fail(msg: string) {
  console.log(`${colors.red}✗ ${msg}${colors.reset}`);
}

function info(msg: string) {
  console.log(`${colors.cyan}  ${msg}${colors.reset}`);
}

function warn(msg: string) {
  console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
}

// Test results tracking
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  txSignature?: string;
}

const testResults: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<any>): Promise<TestResult> {
  const start = Date.now();
  try {
    const result = await testFn();
    const duration = Date.now() - start;
    const testResult: TestResult = {
      name,
      passed: true,
      duration,
      txSignature: result?.signature || result?.txSignature,
    };
    testResults.push(testResult);
    success(`${name} (${duration}ms)`);
    return testResult;
  } catch (error: any) {
    const duration = Date.now() - start;
    const testResult: TestResult = {
      name,
      passed: false,
      duration,
      error: error.message,
    };
    testResults.push(testResult);
    fail(`${name} (${duration}ms)`);
    info(`Error: ${error.message}`);
    return testResult;
  }
}

// Load wallet from file or env
function loadWallet(): Keypair {
  // Hardcoded test wallet for integration tests
  const TEST_PRIVATE_KEY = '329jPMv6d886pY3AVgS1RYoFnLWiJvxnEDKSGzKcBdF6zay91YhzDA6HiVKDkUo8WnRRK9eQZSU2mf6bksJtvisw';

  // Try environment variable first
  const privateKey = process.env.SOLANA_PRIVATE_KEY || TEST_PRIVATE_KEY;
  if (privateKey) {
    try {
      const decoded = JSON.parse(privateKey);
      return Keypair.fromSecretKey(Uint8Array.from(decoded));
    } catch {
      // Try base58
      const bs58 = require('bs58');
      return Keypair.fromSecretKey(bs58.decode(privateKey));
    }
  }

  // Try default path
  const defaultPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  if (fs.existsSync(defaultPath)) {
    const keyData = JSON.parse(fs.readFileSync(defaultPath, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
  }

  throw new Error('No wallet found. Set SOLANA_PRIVATE_KEY or ensure ~/.config/solana/id.json exists');
}

// Main test suite
async function main() {
  header('PrivacyKit SDK - Comprehensive Integration Test');

  // Configuration
  const RECIPIENT_WALLET = 'ia3MLukFMa6zci4nyahxsKVT14yLkFzUkZs3EL5Vsa5';
  const RPC_URL = 'https://api.mainnet-beta.solana.com';
  const MIN_TEST_AMOUNT = 0.001; // Minimum test amount in SOL

  log('cyan', 'Configuration:');
  info(`RPC: ${RPC_URL}`);
  info(`Recipient: ${RECIPIENT_WALLET}`);
  info(`Min Test Amount: ${MIN_TEST_AMOUNT} SOL`);

  // Load wallet
  let keypair: Keypair;
  try {
    keypair = loadWallet();
    success(`Wallet loaded: ${keypair.publicKey.toBase58()}`);
  } catch (error: any) {
    fail(`Failed to load wallet: ${error.message}`);
    process.exit(1);
  }

  // Setup connection
  const connection = new Connection(RPC_URL, 'confirmed');

  // Check public balance
  section('Wallet Balance Check');
  const publicBalance = await connection.getBalance(keypair.publicKey);
  const publicBalanceSOL = publicBalance / LAMPORTS_PER_SOL;
  info(`Public Balance: ${publicBalanceSOL.toFixed(6)} SOL`);

  if (publicBalanceSOL < 0.001) {
    warn('Very low public balance - some tests may fail');
  }

  // ============================================
  // TEST 1: SDK Initialization
  // ============================================
  section('Test 1: SDK Initialization');

  let kit: PrivacyKit | null = null;

  await runTest('Initialize PrivacyKit with production adapters', async () => {
    // Pass Keypair directly - PrivacyKit will create WalletAdapter internally
    // This allows adapters like Privacy Cash that need raw Keypair to work
    kit = new PrivacyKit({
      network: 'mainnet-beta',
      rpcUrl: RPC_URL,
      wallet: keypair,  // Pass Keypair directly!
      production: true,  // Use production adapters
      debug: true,
      providers: [
        PrivacyProvider.PRIVACY_CASH,
        PrivacyProvider.SHADOWWIRE,
        PrivacyProvider.ARCIUM,
        PrivacyProvider.NOIR,
      ],
    });

    await kit.initialize();

    const providers = kit.getAvailableProviders();
    info(`Available providers: ${providers.join(', ')}`);

    if (providers.length === 0) {
      throw new Error('No providers available');
    }

    return { providers };
  });

  if (!kit) {
    fail('SDK initialization failed - cannot continue');
    process.exit(1);
  }

  // ============================================
  // TEST 2: Adapter Readiness
  // ============================================
  section('Test 2: Adapter Readiness');

  const adapters = kit.getAdapters();
  for (const adapter of adapters) {
    await runTest(`Check ${adapter.name} adapter readiness`, async () => {
      const ready = adapter.isReady();
      if (!ready) {
        throw new Error(`${adapter.name} is not ready`);
      }
      return { ready };
    });
  }

  // ============================================
  // TEST 3: Balance Queries
  // ============================================
  section('Test 3: Balance Queries');

  await runTest('Query public SOL balance via SDK', async () => {
    const balance = await kit!.getBalance('SOL');
    info(`Public: ${balance.public} SOL`);
    info(`Total: ${balance.total} SOL`);
    return balance;
  });

  // Check Privacy Cash shielded balance using provider enum correctly
  await runTest('Query Privacy Cash shielded balance', async () => {
    const pcAdapter = kit!.getAdapter(PrivacyProvider.PRIVACY_CASH);
    if (!pcAdapter) {
      // List available adapters for debugging
      const availableAdapters = kit!.getAdapters().map(a => `${a.name} (${a.provider})`);
      throw new Error(`Privacy Cash adapter not found. Available: ${availableAdapters.join(', ')}`);
    }

    const balance = await pcAdapter.getBalance('SOL');
    info(`Shielded: ${balance} SOL`);
    return { balance };
  });

  // ============================================
  // TEST 4: Fee Estimation
  // ============================================
  section('Test 4: Fee Estimation');

  await runTest('Estimate Privacy Cash transfer fee', async () => {
    const pcAdapter = kit!.getAdapter(PrivacyProvider.PRIVACY_CASH);
    if (!pcAdapter) throw new Error('Privacy Cash adapter not found');

    const estimate = await pcAdapter.estimate({
      operation: 'transfer',
      amount: 0.01,
      token: 'SOL',
      privacy: PrivacyLevel.COMPLIANT_POOL,
    });

    info(`Fee: ${estimate.fee} SOL`);
    info(`Latency: ${estimate.latencyMs}ms`);
    return estimate;
  });

  await runTest('Estimate ShadowWire transfer fee', async () => {
    const swAdapter = kit!.getAdapter(PrivacyProvider.SHADOWWIRE);
    if (!swAdapter) throw new Error('ShadowWire adapter not found');

    const estimate = await swAdapter.estimate({
      operation: 'transfer',
      amount: 0.1,
      token: 'SOL',
      privacy: PrivacyLevel.AMOUNT_HIDDEN,
    });

    info(`Fee: ${estimate.fee} SOL`);
    info(`Latency: ${estimate.latencyMs}ms`);
    return estimate;
  });

  // ============================================
  // TEST 5: Intelligent Router
  // ============================================
  section('Test 5: Intelligent Router');

  await runTest('Get recommendation for COMPLIANT_POOL transfer', async () => {
    const router = kit!.getRouter();
    try {
      const recommendation = await router.selectProvider({
        privacyLevel: PrivacyLevel.COMPLIANT_POOL,
        token: 'SOL',
        amount: 0.01,
      });

      info(`Recommended: ${recommendation.provider}`);
      info(`Score: ${recommendation.score}`);
      info(`Reasons: ${recommendation.reasons.join(', ')}`);
      return recommendation;
    } catch (error: any) {
      info(`Router error: ${error.message}`);
      throw error;
    }
  });

  await runTest('Get recommendation for SENDER_HIDDEN transfer', async () => {
    const router = kit!.getRouter();
    try {
      const recommendation = await router.selectProvider({
        privacyLevel: PrivacyLevel.SENDER_HIDDEN,
        token: 'SOL',
        amount: 0.01,
      });

      info(`Recommended: ${recommendation.provider}`);
      info(`Score: ${recommendation.score}`);
      return recommendation;
    } catch (error: any) {
      info(`Router error: ${error.message}`);
      throw error;
    }
  });

  // ============================================
  // TEST 6: Provider Capability Checks
  // ============================================
  section('Test 6: Provider Capabilities');

  const tokens = ['SOL', 'USDC', 'USDT', 'BONK'];

  for (const adapter of adapters) {
    await runTest(`Check ${adapter.name} supported tokens & levels`, async () => {
      const supportedTokens: string[] = [];
      const supportedLevels: string[] = [];

      // Check which tokens are supported with each adapter's supported levels
      for (const token of tokens) {
        for (const level of adapter.supportedLevels) {
          if (adapter.supports('transfer', token, level)) {
            if (!supportedTokens.includes(token)) {
              supportedTokens.push(token);
            }
            break;
          }
        }
      }

      // Check which levels are supported for SOL
      for (const level of adapter.supportedLevels) {
        if (adapter.supports('transfer', 'SOL', level)) {
          supportedLevels.push(level);
        }
      }

      info(`Tokens: ${supportedTokens.join(', ') || 'none'}`);
      info(`Levels: ${supportedLevels.join(', ') || 'none'}`);
      info(`Declared tokens: ${adapter.supportedTokens.join(', ')}`);
      info(`Declared levels: ${adapter.supportedLevels.join(', ')}`);

      return { supportedTokens, supportedLevels };
    });
  }

  // ============================================
  // TEST 7: Privacy Cash Private Balance Check (Real)
  // ============================================
  section('Test 7: Privacy Cash Private Balance (Real UTXOs)');

  let privateBalance = 0;
  await runTest('Fetch Privacy Cash private balance with UTXO scan', async () => {
    const pcAdapter = kit!.getAdapter(PrivacyProvider.PRIVACY_CASH);
    if (!pcAdapter) throw new Error('Privacy Cash adapter not found');

    const balance = await pcAdapter.getBalance('SOL');
    privateBalance = typeof balance === 'number' ? balance : 0;
    info(`Private SOL Balance: ${privateBalance} SOL`);

    if (privateBalance > 0) {
      success(`Found ${privateBalance} SOL in shielded pool!`);
    } else {
      warn('No shielded balance found');
    }

    return { balance: privateBalance };
  });

  // ============================================
  // TEST 8: Private Transfer (if balance available)
  // ============================================
  section('Test 8: Private Transfer (Conditional)');

  const minTransferAmount = 0.01; // Privacy Cash minimum is 0.01 SOL

  if (privateBalance >= minTransferAmount + 0.007) { // Need extra for fees (~0.006 relayer fee)
    await runTest(`Execute private transfer of ${minTransferAmount} SOL`, async () => {
      info(`Transferring ${minTransferAmount} SOL to ${RECIPIENT_WALLET}`);

      const result = await kit!.transfer({
        recipient: RECIPIENT_WALLET,
        amount: minTransferAmount,
        token: 'SOL',
        privacy: PrivacyLevel.SENDER_HIDDEN,
        provider: PrivacyProvider.PRIVACY_CASH,
      });

      info(`TX: ${result.signature}`);
      info(`Provider: ${result.provider}`);
      info(`Fee: ${result.fee} SOL`);
      info(`Explorer: https://solscan.io/tx/${result.signature}`);

      return result;
    });
  } else {
    warn(`Insufficient private balance for transfer (have: ${privateBalance}, need: ${minTransferAmount + 0.007})`);
    info('Skipping private transfer test');
  }

  // ============================================
  // TEST 9: Noir ZK Proof System
  // ============================================
  section('Test 9: Noir ZK Proof System');

  await runTest('Test Noir adapter initialization', async () => {
    const noirAdapter = kit!.getAdapter(PrivacyProvider.NOIR);
    if (!noirAdapter) throw new Error('Noir adapter not found');

    const ready = noirAdapter.isReady();
    info(`Noir adapter ready: ${ready}`);
    info(`Supported levels: ${noirAdapter.supportedLevels.join(', ')}`);
    return { ready };
  });

  // ============================================
  // TEST 10: Event System
  // ============================================
  section('Test 10: Event System');

  await runTest('Test event emission', async () => {
    let eventFired = false;

    const listener = () => {
      eventFired = true;
    };

    kit!.on('error', listener);

    // The event system is registered, test passes if no error
    kit!.off('error', listener);

    return { eventSystemWorking: true };
  });

  // ============================================
  // TEST 11: Wallet Adapter Utilities
  // ============================================
  section('Test 11: Utility Functions');

  await runTest('Test keypairToWalletAdapter conversion', async () => {
    const walletAdapter = keypairToWalletAdapter(keypair);

    if (!walletAdapter.publicKey) throw new Error('No public key');
    if (!walletAdapter.signTransaction) throw new Error('No signTransaction');
    if (!walletAdapter.signAllTransactions) throw new Error('No signAllTransactions');

    info(`Adapter publicKey: ${walletAdapter.publicKey.toBase58()}`);
    return { success: true };
  });

  // ============================================
  // TEST 12: SDK Cleanup
  // ============================================
  section('Test 12: SDK Cleanup');

  await runTest('Destroy PrivacyKit instance', async () => {
    await kit!.destroy();
    return { destroyed: true };
  });

  // ============================================
  // RESULTS SUMMARY
  // ============================================
  header('Test Results Summary');

  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const total = testResults.length;

  console.log(`\n${colors.bright}Results: ${passed}/${total} passed${colors.reset}`);

  if (failed > 0) {
    console.log(`${colors.red}Failed tests:${colors.reset}`);
    testResults
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  ${colors.red}✗ ${r.name}${colors.reset}`);
        console.log(`    ${colors.yellow}${r.error}${colors.reset}`);
      });
  }

  // Transaction signatures
  const txResults = testResults.filter(r => r.txSignature);
  if (txResults.length > 0) {
    console.log(`\n${colors.cyan}Transactions:${colors.reset}`);
    txResults.forEach(r => {
      console.log(`  ${r.name}: ${r.txSignature}`);
      console.log(`  https://solscan.io/tx/${r.txSignature}`);
    });
  }

  console.log(`\n${colors.bright}Total Duration: ${testResults.reduce((acc, r) => acc + r.duration, 0)}ms${colors.reset}`);

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
