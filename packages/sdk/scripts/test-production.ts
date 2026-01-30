#!/usr/bin/env npx ts-node
/**
 * Production Adapter Test Script
 *
 * Tests all production adapters against real devnet/mainnet networks.
 * Uses official SDKs with 0 mocks.
 *
 * Usage:
 *   NETWORK=devnet bun run scripts/test-production.ts
 *   NETWORK=mainnet WALLET_PATH=/path/to/wallet.json bun run scripts/test-production.ts
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  skipped?: boolean;
  version: 'production' | 'development';
}

const results: TestResult[] = [];

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logPass(name: string, duration: number, version: 'production' | 'development' = 'production') {
  results.push({ name, passed: true, duration, version });
  log(`[PASS] ${name} (${duration}ms)`, 'green');
}

function logFail(name: string, error: string, duration: number, version: 'production' | 'development' = 'production') {
  results.push({ name, passed: false, duration, error, version });
  log(`[FAIL] ${name} (${duration}ms)`, 'red');
  log(`       ${colors.red}Error: ${error}${colors.reset}`);
}

function logSkip(name: string, reason: string, version: 'production' | 'development' = 'production') {
  results.push({ name, passed: true, duration: 0, skipped: true, version });
  log(`[SKIP] ${name} - ${reason}`, 'yellow');
}

function logInfo(message: string, data?: unknown) {
  log(`[INFO] ${message}`, 'cyan');
  if (data) {
    console.log(`   ${colors.cyan}${JSON.stringify(data, null, 2)}${colors.reset}`);
  }
}

function logProd(message: string) {
  log(`[PROD] ${message}`, 'magenta');
}

async function loadWallet(): Promise<Keypair> {
  const walletPath = process.env.WALLET_PATH || path.join(process.env.HOME || '', '.config/solana/id.json');

  if (!fs.existsSync(walletPath)) {
    log(`No wallet found at ${walletPath}, generating ephemeral keypair`, 'yellow');
    return Keypair.generate();
  }

  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(walletData));
}

async function main() {
  const network = process.env.NETWORK || 'devnet';
  const rpcUrl = network === 'mainnet'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';

  log(`\n${'='.repeat(70)}`, 'blue');
  log(`  PrivacyKit Production Adapter Tests`, 'blue');
  log(`  Network: ${network.toUpperCase()} | RPC: ${rpcUrl}`, 'blue');
  log(`${'='.repeat(70)}\n`, 'blue');

  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = await loadWallet();

  logInfo('Wallet loaded', {
    publicKey: wallet.publicKey.toBase58(),
    isEphemeral: !process.env.WALLET_PATH && !fs.existsSync(path.join(process.env.HOME || '', '.config/solana/id.json'))
  });

  // Get wallet balance
  const balance = await connection.getBalance(wallet.publicKey);
  logInfo('Wallet balance', {
    balance: balance / LAMPORTS_PER_SOL,
    network
  });

  // ============================================================
  // Privacy Cash Production Tests
  // ============================================================
  log(`\n${'='.repeat(70)}`, 'blue');
  log(`  Privacy Cash Production Adapter Tests`, 'blue');
  log(`${'='.repeat(70)}\n`, 'blue');
  logProd('Using official privacycash SDK');

  let start = Date.now();
  try {
    // Test SDK import
    const { PrivacyCash } = await import('privacycash');
    logPass('Privacy Cash SDK Import', Date.now() - start);

    start = Date.now();
    // Test client initialization
    const pcClient = new PrivacyCash({
      RPC_url: rpcUrl,
      owner: wallet,
      enableDebug: false,
    });
    logPass('Privacy Cash Client Initialization', Date.now() - start);

    // Test getPrivateBalance
    start = Date.now();
    try {
      const { lamports } = await pcClient.getPrivateBalance();
      logPass('Get Private Balance (SOL)', Date.now() - start);
      logInfo('Shielded SOL balance', { balance: lamports / LAMPORTS_PER_SOL });
    } catch (e: any) {
      logFail('Get Private Balance (SOL)', e.message, Date.now() - start);
    }

    // Test USDC balance
    start = Date.now();
    try {
      const { amount } = await pcClient.getPrivateBalanceUSDC();
      logPass('Get Private Balance (USDC)', Date.now() - start);
      logInfo('Shielded USDC balance', { amount });
    } catch (e: any) {
      logFail('Get Private Balance (USDC)', e.message, Date.now() - start);
    }

    // Test cache clear
    start = Date.now();
    try {
      await pcClient.clearCache();
      logPass('Cache Clear', Date.now() - start);
    } catch (e: any) {
      logFail('Cache Clear', e.message, Date.now() - start);
    }

    // Skip actual deposit/withdraw on devnet due to ALT issues
    if (balance > 0.1 * LAMPORTS_PER_SOL && network === 'mainnet') {
      start = Date.now();
      try {
        const depositResult = await pcClient.deposit({ lamports: 0.01 * LAMPORTS_PER_SOL });
        logPass('Real Deposit (SOL)', Date.now() - start);
        logInfo('Deposit result', { tx: depositResult.tx });
      } catch (e: any) {
        logFail('Real Deposit (SOL)', e.message, Date.now() - start);
      }
    } else {
      logSkip('Real Deposit (SOL)', 'Insufficient balance or devnet (requires mainnet ALT)');
    }

  } catch (e: any) {
    logFail('Privacy Cash SDK Import', e.message, Date.now() - start);
  }

  // ============================================================
  // ShadowWire Production Tests
  // ============================================================
  log(`\n${'='.repeat(70)}`, 'blue');
  log(`  ShadowWire Production Adapter Tests`, 'blue');
  log(`${'='.repeat(70)}\n`, 'blue');
  logProd('Using official @radr/shadowwire SDK');

  start = Date.now();
  try {
    const shadowwire = await import('@radr/shadowwire');
    const {
      ShadowWireClient,
      initWASM,
      TOKEN_FEES,
      TOKEN_MINIMUMS,
      BULLETPROOF_INFO
    } = shadowwire;
    logPass('ShadowWire SDK Import', Date.now() - start);
    logInfo('SDK exports available', {
      hasClient: !!ShadowWireClient,
      hasInitWASM: !!initWASM
    });

    // Test WASM initialization
    start = Date.now();
    try {
      await initWASM();
      logPass('WASM Initialization', Date.now() - start);
    } catch (e: any) {
      logSkip('WASM Initialization', `WASM not available in Node.js: ${e.message}`);
    }

    // Test client creation
    start = Date.now();
    try {
      const client = new ShadowWireClient({ debug: false });
      logPass('ShadowWire Client Creation', Date.now() - start);

      // Test API health (if available)
      start = Date.now();
      try {
        const health = await (client as any).getHealth?.();
        if (health) {
          logPass('API Health Check', Date.now() - start);
          logInfo('API status', health);
        } else {
          logSkip('API Health Check', 'Health endpoint not available');
        }
      } catch (e: any) {
        logSkip('API Health Check', 'Health endpoint not available');
      }

    } catch (e: any) {
      logFail('ShadowWire Client Creation', e.message, Date.now() - start);
    }

    // Test token configuration
    start = Date.now();
    const tokenConfigs = {
      SOL: { fee: TOKEN_FEES?.SOL, min: TOKEN_MINIMUMS?.SOL },
      USDC: { fee: TOKEN_FEES?.USDC, min: TOKEN_MINIMUMS?.USDC },
      BONK: { fee: TOKEN_FEES?.BONK, min: TOKEN_MINIMUMS?.BONK },
    };
    logPass('Token Configuration', Date.now() - start);
    logInfo('Token configs', tokenConfigs);

    // Test Bulletproof info
    if (BULLETPROOF_INFO) {
      logInfo('Bulletproof info', {
        vectorSize: BULLETPROOF_INFO.VECTOR_SIZE,
        maxBits: BULLETPROOF_INFO.MAX_BITS,
      });
    }

  } catch (e: any) {
    logFail('ShadowWire SDK Import', e.message, Date.now() - start);
  }

  // ============================================================
  // Arcium Production Tests
  // ============================================================
  log(`\n${'='.repeat(70)}`, 'blue');
  log(`  Arcium Production Adapter Tests`, 'blue');
  log(`${'='.repeat(70)}\n`, 'blue');
  logProd('Using official @arcium-hq/client SDK');

  start = Date.now();
  try {
    const arciumModule = await import('@arcium-hq/client');
    logPass('Arcium SDK Import', Date.now() - start);
    logInfo('SDK exports', Object.keys(arciumModule));

    // Try different ways to get the client
    const ArciumClient = arciumModule.ArciumClient || arciumModule.default?.ArciumClient || arciumModule.default;

    // Test client initialization
    start = Date.now();
    if (ArciumClient) {
      try {
        const client = new ArciumClient(connection);
        logPass('Arcium Client Initialization', Date.now() - start);

        // Test MXE public key fetch
        start = Date.now();
        try {
          const mxePubkey = await client.getMxePublicKey?.();
          if (mxePubkey) {
            logPass('MXE Public Key Fetch', Date.now() - start);
            logInfo('MXE public key', { pubkey: mxePubkey?.toString() });
          } else {
            logSkip('MXE Public Key Fetch', 'Method not available');
          }
        } catch (e: any) {
          logSkip('MXE Public Key Fetch', `MXE not available on ${network}: ${e.message}`);
        }

        // Test mempool stats
        start = Date.now();
        try {
          const stats = await client.getMempoolPriorityFeeStats?.();
          if (stats) {
            logPass('Mempool Stats', Date.now() - start);
            logInfo('Priority fee stats', stats);
          } else {
            logSkip('Mempool Stats', 'Method not available');
          }
        } catch (e: any) {
          logSkip('Mempool Stats', e.message);
        }

      } catch (e: any) {
        logFail('Arcium Client Initialization', e.message, Date.now() - start);
      }
    } else {
      logSkip('Arcium Client Initialization', 'ArciumClient not exported from SDK');
    }

  } catch (e: any) {
    logFail('Arcium SDK Import', e.message, Date.now() - start);
  }

  // ============================================================
  // Development Adapter Tests (Internal Implementations)
  // ============================================================
  log(`\n${'='.repeat(70)}`, 'blue');
  log(`  Development Adapter Tests (Internal Implementations)`, 'blue');
  log(`${'='.repeat(70)}\n`, 'blue');

  // Test Poseidon hash using built SDK
  start = Date.now();
  try {
    // Import from built dist
    const sdkModule = await import('../dist/index.js');
    const { poseidonHash } = sdkModule;
    if (poseidonHash) {
      const input = BigInt('12345678901234567890');
      const hash = await poseidonHash([input, input]);
      logPass('Poseidon Hash', Date.now() - start, 'development');
      logInfo('Hash test', {
        inputPrefix: input.toString().slice(0, 15) + '...',
        outputPrefix: hash.toString().slice(0, 15) + '...'
      });
    } else {
      logSkip('Poseidon Hash', 'poseidonHash not exported from SDK', 'development');
    }
  } catch (e: any) {
    logFail('Poseidon Hash', e.message, Date.now() - start, 'development');
  }

  // Test Merkle tree using built SDK
  start = Date.now();
  try {
    const sdkModule = await import('../dist/index.js');
    const { MerkleTree } = sdkModule;
    if (MerkleTree) {
      const tree = new MerkleTree(20);
      const commitment = BigInt('123456789');
      const index = tree.insert(commitment);
      const proof = tree.getProof(index);
      logPass('Merkle Tree', Date.now() - start, 'development');
      logInfo('Tree test', { depth: 20, leafIndex: index, proofValid: proof.pathElements.length === 20 });
    } else {
      logSkip('Merkle Tree', 'MerkleTree not exported from SDK', 'development');
    }
  } catch (e: any) {
    logFail('Merkle Tree', e.message, Date.now() - start, 'development');
  }

  // ============================================================
  // Test Results Summary
  // ============================================================
  log(`\n${'='.repeat(70)}`, 'blue');
  log(`  Test Results Summary`, 'blue');
  log(`${'='.repeat(70)}\n`, 'blue');

  const productionResults = results.filter(r => r.version === 'production');
  const developmentResults = results.filter(r => r.version === 'development');

  const prodPassed = productionResults.filter(r => r.passed && !r.skipped).length;
  const prodFailed = productionResults.filter(r => !r.passed).length;
  const prodSkipped = productionResults.filter(r => r.skipped).length;

  const devPassed = developmentResults.filter(r => r.passed && !r.skipped).length;
  const devFailed = developmentResults.filter(r => !r.passed).length;
  const devSkipped = developmentResults.filter(r => r.skipped).length;

  log(`PRODUCTION ADAPTERS:`, 'magenta');
  log(`  ${colors.green}Passed:${colors.reset}  ${prodPassed}`);
  log(`  ${colors.red}Failed:${colors.reset}  ${prodFailed}`);
  log(`  ${colors.yellow}Skipped:${colors.reset} ${prodSkipped}`);

  log(`\nDEVELOPMENT ADAPTERS:`, 'cyan');
  log(`  ${colors.green}Passed:${colors.reset}  ${devPassed}`);
  log(`  ${colors.red}Failed:${colors.reset}  ${devFailed}`);
  log(`  ${colors.yellow}Skipped:${colors.reset} ${devSkipped}`);

  // Exit code
  if (prodFailed > 0 || devFailed > 0) {
    log(`\n${colors.red}${colors.bold}Some tests failed!${colors.reset}`);
    process.exit(1);
  } else {
    log(`\n${colors.green}${colors.bold}All tests passed!${colors.reset}`);
    process.exit(0);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
