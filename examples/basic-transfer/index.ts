/**
 * PrivacyKit Basic Transfer Example
 *
 * This example demonstrates how to use PrivacyKit for private transfers
 * on Solana, showcasing different privacy levels and providers.
 *
 * Run with: npx ts-node index.ts
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  PrivacyLevel,
  PrivacyProvider,
  TransferRequest,
  PrivacyKitConfig,
  WalletAdapter,
  BalanceResult,
} from '@privacykit/sdk';
import {
  ShadowWireAdapter,
  ArciumAdapter,
  PrivacyCashAdapter,
  createAdapter,
} from '@privacykit/sdk/adapters';
import { PrivacyRouter } from '@privacykit/sdk/core/router';

// Configuration
const NETWORK = 'devnet' as const;
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';

/**
 * Create a mock wallet adapter from a keypair
 * In a real application, you would use a wallet adapter like @solana/wallet-adapter
 */
function createWalletFromKeypair(keypair: Keypair): WalletAdapter {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends { serialize(): Uint8Array }>(tx: T): Promise<T> => {
      // In production, sign with the keypair
      return tx;
    },
    signAllTransactions: async <T extends { serialize(): Uint8Array }>(txs: T[]): Promise<T[]> => {
      return txs;
    },
    signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
      // Sign message with nacl or similar
      const signature = new Uint8Array(64);
      // In production: nacl.sign.detached(message, keypair.secretKey)
      return signature;
    },
  };
}

/**
 * Example 1: Simple transfer with amount hidden (ShadowWire)
 * Uses Bulletproof zero-knowledge proofs to hide transfer amounts
 */
async function simpleAmountHiddenTransfer() {
  console.log('\n=== Example 1: Amount Hidden Transfer (ShadowWire) ===\n');

  // Setup connection and wallet
  const connection = new Connection(RPC_URL, 'confirmed');
  const senderKeypair = Keypair.generate(); // In production, load from secure storage
  const wallet = createWalletFromKeypair(senderKeypair);

  // Initialize ShadowWire adapter
  const adapter = new ShadowWireAdapter();
  await adapter.initialize(connection, wallet);

  // Define transfer parameters
  const recipientAddress = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK'; // Example address

  const transferRequest: TransferRequest = {
    recipient: recipientAddress,
    amount: 1.5, // 1.5 SOL
    token: 'SOL',
    privacy: PrivacyLevel.AMOUNT_HIDDEN,
  };

  console.log('Transfer Details:');
  console.log(`  From: ${wallet.publicKey.toBase58()}`);
  console.log(`  To: ${recipientAddress}`);
  console.log(`  Amount: ${transferRequest.amount} ${transferRequest.token}`);
  console.log(`  Privacy Level: ${transferRequest.privacy}`);

  // Estimate fees before transfer
  const estimate = await adapter.estimate({
    operation: 'transfer',
    amount: transferRequest.amount,
    token: transferRequest.token,
    privacy: transferRequest.privacy,
  });

  console.log('\nFee Estimate:');
  console.log(`  Fee: ${estimate.fee} ${transferRequest.token}`);
  console.log(`  Latency: ~${estimate.latencyMs / 1000}s`);
  console.log(`  Anonymity Set: ~${estimate.anonymitySet} users`);

  // Execute the transfer (uncomment in production)
  // const result = await adapter.transfer(transferRequest);
  // console.log('\nTransfer Result:');
  // console.log(`  Signature: ${result.signature}`);
  // console.log(`  Provider: ${result.provider}`);
  // console.log(`  Fee Paid: ${result.fee} ${transferRequest.token}`);

  console.log('\n[Simulated] Transfer would be executed via ShadowWire API');
}

/**
 * Example 2: Sender hidden transfer (External transfer)
 * Hides the sender's identity while keeping amounts visible
 */
async function senderHiddenTransfer() {
  console.log('\n=== Example 2: Sender Hidden Transfer ===\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const senderKeypair = Keypair.generate();
  const wallet = createWalletFromKeypair(senderKeypair);

  const adapter = new ShadowWireAdapter();
  await adapter.initialize(connection, wallet);

  const transferRequest: TransferRequest = {
    recipient: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
    amount: 100, // 100 USDC
    token: 'USDC',
    privacy: PrivacyLevel.SENDER_HIDDEN,
    options: {
      maxFee: 2, // Max 2 USDC fee
      memo: 'Payment for services',
    },
  };

  console.log('Transfer Details:');
  console.log(`  To: ${transferRequest.recipient}`);
  console.log(`  Amount: ${transferRequest.amount} ${transferRequest.token}`);
  console.log(`  Privacy Level: ${transferRequest.privacy}`);
  console.log(`  Note: Sender identity will be hidden`);

  const estimate = await adapter.estimate({
    operation: 'transfer',
    amount: transferRequest.amount,
    token: transferRequest.token,
    privacy: transferRequest.privacy,
  });

  console.log('\nFee Estimate:');
  console.log(`  Fee: ${estimate.fee} ${transferRequest.token} (${(estimate.fee / transferRequest.amount * 100).toFixed(2)}%)`);

  console.log('\n[Simulated] Transfer would be executed as external ShadowWire transfer');
}

/**
 * Example 3: Full encrypted transfer (Arcium MPC)
 * Uses Multi-Party Computation for maximum privacy
 */
async function fullEncryptedTransfer() {
  console.log('\n=== Example 3: Full Encrypted Transfer (Arcium MPC) ===\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const senderKeypair = Keypair.generate();
  const wallet = createWalletFromKeypair(senderKeypair);

  const adapter = new ArciumAdapter();
  await adapter.initialize(connection, wallet);

  const transferRequest: TransferRequest = {
    recipient: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
    amount: 5, // 5 SOL
    token: 'SOL',
    privacy: PrivacyLevel.FULL_ENCRYPTED,
    provider: PrivacyProvider.ARCIUM,
  };

  console.log('Transfer Details:');
  console.log(`  Amount: ${transferRequest.amount} ${transferRequest.token}`);
  console.log(`  Privacy Level: ${transferRequest.privacy}`);
  console.log(`  Provider: Arcium (Multi-Party Computation)`);
  console.log(`  Note: All transaction data fully encrypted`);

  const estimate = await adapter.estimate({
    operation: 'transfer',
    amount: transferRequest.amount,
    token: transferRequest.token,
    privacy: transferRequest.privacy,
  });

  console.log('\nFee Estimate:');
  console.log(`  Fee: ${estimate.fee} ${transferRequest.token}`);
  console.log(`  Latency: ~${estimate.latencyMs / 1000}s`);
  if (estimate.warnings.length > 0) {
    console.log(`  Warnings: ${estimate.warnings.join(', ')}`);
  }

  console.log('\n[Simulated] Transfer would be executed via Arcium MPC network');
}

/**
 * Example 4: Compliant pool transfer (Privacy Cash)
 * Privacy with compliance - includes proof of innocence
 */
async function compliantPoolTransfer() {
  console.log('\n=== Example 4: Compliant Pool Transfer (Privacy Cash) ===\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const senderKeypair = Keypair.generate();
  const wallet = createWalletFromKeypair(senderKeypair);

  const adapter = new PrivacyCashAdapter();
  await adapter.initialize(connection, wallet);

  const transferRequest: TransferRequest = {
    recipient: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
    amount: 1000, // 1000 USDC
    token: 'USDC',
    privacy: PrivacyLevel.COMPLIANT_POOL,
    provider: PrivacyProvider.PRIVACY_CASH,
  };

  console.log('Transfer Details:');
  console.log(`  Amount: ${transferRequest.amount} ${transferRequest.token}`);
  console.log(`  Privacy Level: ${transferRequest.privacy}`);
  console.log(`  Provider: Privacy Cash`);
  console.log(`  Note: Includes proof of innocence for compliance`);

  const estimate = await adapter.estimate({
    operation: 'transfer',
    amount: transferRequest.amount,
    token: transferRequest.token,
    privacy: transferRequest.privacy,
  });

  console.log('\nFee Estimate:');
  console.log(`  Fee: ${estimate.fee} ${transferRequest.token}`);
  console.log(`  Latency: ~${estimate.latencyMs / 1000}s`);

  console.log('\n[Simulated] Transfer would be executed via Privacy Cash with compliance proofs');
}

/**
 * Example 5: Using the Privacy Router for automatic provider selection
 * The router automatically selects the best provider based on requirements
 */
async function routedTransfer() {
  console.log('\n=== Example 5: Auto-Routed Transfer ===\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const senderKeypair = Keypair.generate();
  const wallet = createWalletFromKeypair(senderKeypair);

  // Create and configure router
  const router = new PrivacyRouter();

  // Register all available adapters
  const providers = [
    PrivacyProvider.SHADOWWIRE,
    PrivacyProvider.ARCIUM,
    PrivacyProvider.PRIVACY_CASH,
  ];

  for (const provider of providers) {
    const adapter = createAdapter(provider);
    await adapter.initialize(connection, wallet);
    router.registerAdapter(adapter);
  }

  // Define transfer with requirements - let router pick best provider
  const transferRequest: TransferRequest = {
    recipient: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
    amount: 50, // 50 USDC
    token: 'USDC',
    privacy: PrivacyLevel.SENDER_HIDDEN,
    options: {
      maxFee: 1, // Max 1 USDC fee (2%)
    },
  };

  console.log('Transfer Requirements:');
  console.log(`  Amount: ${transferRequest.amount} ${transferRequest.token}`);
  console.log(`  Privacy Level: ${transferRequest.privacy}`);
  console.log(`  Max Fee: ${transferRequest.options?.maxFee} ${transferRequest.token}`);

  // Get routing recommendation
  const recommendation = await router.getRecommendation(transferRequest);

  console.log('\nRouter Recommendation:');
  console.log(recommendation.explanation);

  console.log('\nAlternative Providers:');
  for (const alt of recommendation.alternatives) {
    console.log(`  - ${alt.adapter.name}: Score ${alt.score.toFixed(0)}, Fee ${alt.estimate.fee.toFixed(4)} ${transferRequest.token}`);
  }

  // Execute with recommended provider
  // const result = await recommendation.recommended.adapter.transfer(transferRequest);

  console.log('\n[Simulated] Transfer would be executed via recommended provider');
}

/**
 * Example 6: Deposit and Withdraw from privacy pool
 * Shows the full lifecycle of private funds
 */
async function depositWithdrawCycle() {
  console.log('\n=== Example 6: Deposit & Withdraw Cycle ===\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const senderKeypair = Keypair.generate();
  const wallet = createWalletFromKeypair(senderKeypair);

  const adapter = new ShadowWireAdapter();
  await adapter.initialize(connection, wallet);

  // Step 1: Deposit into privacy pool
  console.log('Step 1: Deposit into Privacy Pool');
  console.log(`  Amount: 2 SOL`);
  console.log(`  Provider: ShadowWire`);

  const depositEstimate = await adapter.estimate({
    operation: 'deposit',
    amount: 2,
    token: 'SOL',
  });
  console.log(`  Estimated Fee: ${depositEstimate.fee} SOL`);

  // const depositResult = await adapter.deposit({
  //   amount: 2,
  //   token: 'SOL',
  // });
  // console.log(`  Commitment: ${depositResult.commitment}`);

  console.log('\n[Simulated] Deposit would be executed');

  // Step 2: Check shielded balance
  console.log('\nStep 2: Check Shielded Balance');
  // const balance = await adapter.getBalance('SOL');
  // console.log(`  Shielded Balance: ${balance} SOL`);
  console.log('  [Simulated] Would show shielded balance');

  // Step 3: Withdraw from privacy pool
  console.log('\nStep 3: Withdraw from Privacy Pool');
  console.log(`  Amount: 1.5 SOL`);
  console.log(`  To: New address for privacy`);

  const withdrawEstimate = await adapter.estimate({
    operation: 'withdraw',
    amount: 1.5,
    token: 'SOL',
  });
  console.log(`  Estimated Fee: ${withdrawEstimate.fee} SOL`);

  // const withdrawResult = await adapter.withdraw({
  //   amount: 1.5,
  //   token: 'SOL',
  //   recipient: 'NewRecipientAddress...',
  // });

  console.log('\n[Simulated] Withdrawal would be executed to new address');
}

/**
 * Example 7: Multi-token transfers
 * Demonstrates transferring different tokens with appropriate settings
 */
async function multiTokenTransfers() {
  console.log('\n=== Example 7: Multi-Token Privacy Transfers ===\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const senderKeypair = Keypair.generate();
  const wallet = createWalletFromKeypair(senderKeypair);

  const adapter = new ShadowWireAdapter();
  await adapter.initialize(connection, wallet);

  // Different tokens supported by ShadowWire
  const tokens = [
    { symbol: 'SOL', amount: 1.5, fee: '0.5%', minAmount: 0.01 },
    { symbol: 'USDC', amount: 100, fee: '1%', minAmount: 1 },
    { symbol: 'BONK', amount: 1000000, fee: '1%', minAmount: 100000 },
    { symbol: 'RADR', amount: 50, fee: '0.3%', minAmount: 0.1 },
  ];

  console.log('Supported Tokens and Fees:\n');
  console.log('Token   | Fee  | Min Amount | Example Transfer');
  console.log('--------|------|------------|------------------');

  for (const token of tokens) {
    const estimate = await adapter.estimate({
      operation: 'transfer',
      amount: token.amount,
      token: token.symbol,
      privacy: PrivacyLevel.AMOUNT_HIDDEN,
    });

    console.log(
      `${token.symbol.padEnd(7)} | ${token.fee.padEnd(4)} | ${String(token.minAmount).padEnd(10)} | ` +
      `${token.amount} ${token.symbol} -> Fee: ${estimate.fee.toFixed(4)} ${token.symbol}`
    );
  }

  console.log('\nAll tokens support AMOUNT_HIDDEN and SENDER_HIDDEN privacy levels');
}

/**
 * Main function - run all examples
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║          PrivacyKit - Basic Transfer Examples                  ║');
  console.log('║    Unified Privacy SDK for Solana Blockchain                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  try {
    await simpleAmountHiddenTransfer();
    await senderHiddenTransfer();
    await fullEncryptedTransfer();
    await compliantPoolTransfer();
    await routedTransfer();
    await depositWithdrawCycle();
    await multiTokenTransfers();

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    All Examples Complete!                      ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log('Next Steps:');
    console.log('1. Set up your wallet with real keys');
    console.log('2. Fund your wallet with SOL for fees');
    console.log('3. Deposit tokens into the privacy pool');
    console.log('4. Execute private transfers!');
    console.log('\nDocumentation: https://docs.privacykit.dev');

  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run examples
main();
