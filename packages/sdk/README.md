# PrivacyKit SDK

**The Unified Privacy Layer for Solana**

[![npm version](https://img.shields.io/npm/v/privacykit-sdk.svg)](https://www.npmjs.com/package/privacykit-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

PrivacyKit SDK provides a single, unified interface to access multiple privacy-preserving protocols on Solana. Stop juggling different SDKs - one import, one API, all privacy providers.

## Features

- **4 Privacy Providers** - ShadowWire, Arcium, Privacy Cash, and Noir
- **6 Privacy Levels** - From amount-hidden to full encryption
- **Intelligent Router** - Automatic provider selection based on your requirements
- **Production Ready** - Real mainnet transactions with official SDKs
- **TypeScript First** - Full type safety and autocomplete

## Supported Providers

| Provider | Privacy Levels | Tokens | Technology |
|----------|---------------|--------|------------|
| **Privacy Cash** | COMPLIANT_POOL, SENDER_HIDDEN | SOL, USDC, USDT, ORE, ZEC | Tornado-style ZK pools |
| **ShadowWire** | AMOUNT_HIDDEN, SENDER_HIDDEN | SOL, USDC, RADR, BONK, ORE | ElGamal + Bulletproofs |
| **Arcium** | FULL_ENCRYPTED, AMOUNT_HIDDEN | SOL, USDC, USDT, BONK | Multi-Party Computation |
| **Noir** | ZK_PROVEN | Any | Custom ZK circuits |

## Installation

```bash
# Using npm
npm install privacykit-sdk

# Using yarn
yarn add privacykit-sdk

# Using bun
bun add privacykit-sdk
```

## Quick Start

```typescript
import { PrivacyKit, PrivacyLevel, PrivacyProvider } from 'privacykit-sdk';
import { Keypair } from '@solana/web3.js';

// Load your wallet
const keypair = Keypair.fromSecretKey(/* your secret key */);

// Initialize PrivacyKit
const kit = new PrivacyKit({
  network: 'mainnet-beta',
  wallet: keypair,           // Can be Keypair or WalletAdapter
  production: true,          // Use real SDKs (not mocks)
  providers: [
    PrivacyProvider.PRIVACY_CASH,
    PrivacyProvider.SHADOWWIRE,
    PrivacyProvider.ARCIUM,
    PrivacyProvider.NOIR,
  ],
});

await kit.initialize();

// Execute a private transfer
const result = await kit.transfer({
  recipient: 'recipient-address...',
  amount: 0.1,
  token: 'SOL',
  privacy: PrivacyLevel.SENDER_HIDDEN,
});

console.log('Transaction:', result.signature);
console.log('Provider used:', result.provider);
console.log('Fee:', result.fee);
```

## Privacy Levels

```typescript
import { PrivacyLevel } from 'privacykit-sdk';

// Amount is encrypted, sender/recipient visible
PrivacyLevel.AMOUNT_HIDDEN    // → ShadowWire

// Sender identity is hidden via relayers
PrivacyLevel.SENDER_HIDDEN    // → ShadowWire or Privacy Cash

// All transaction data is encrypted (MPC)
PrivacyLevel.FULL_ENCRYPTED   // → Arcium

// Custom ZK proofs
PrivacyLevel.ZK_PROVEN        // → Noir

// Tornado-style pools with compliance features
PrivacyLevel.COMPLIANT_POOL   // → Privacy Cash

// Standard Solana transaction (no privacy)
PrivacyLevel.NONE
```

## API Reference

### Initialization

```typescript
const kit = new PrivacyKit({
  // Required
  network: 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet',

  // Optional
  wallet?: Keypair | WalletAdapter,  // For signing transactions
  rpcUrl?: string,                    // Custom RPC endpoint
  production?: boolean,               // Use official SDKs (default: false)
  debug?: boolean,                    // Enable debug logging
  providers?: PrivacyProvider[],      // Which providers to enable
  shadowWireApiKey?: string,          // ShadowWire API key
});

await kit.initialize();
```

### Transfer

```typescript
const result = await kit.transfer({
  recipient: string | PublicKey,  // Destination address
  amount: number,                  // Amount in token units (not lamports)
  token: string,                   // 'SOL', 'USDC', etc.
  privacy: PrivacyLevel,           // Desired privacy level
  provider?: PrivacyProvider,      // Force specific provider (optional)
});

// Result
{
  signature: string,         // Transaction signature
  provider: PrivacyProvider, // Which provider was used
  privacyLevel: PrivacyLevel,
  fee: number,               // Fee paid in SOL
}
```

### Deposit (into privacy pool)

```typescript
const result = await kit.deposit({
  amount: number,
  token: string,
  provider?: PrivacyProvider,  // Which pool to deposit into
});

// Result
{
  signature: string,
  provider: PrivacyProvider,
  commitment?: string,  // Note/commitment for withdrawal
  fee: number,
}
```

### Withdraw (from privacy pool)

```typescript
const result = await kit.withdraw({
  amount: number,
  token: string,
  recipient: string | PublicKey,
  provider?: PrivacyProvider,
  commitment?: string,  // Note from deposit
});

// Result
{
  signature: string,
  provider: PrivacyProvider,
  fee: number,
}
```

### Get Balance

```typescript
const balance = await kit.getBalance('SOL');

// Result
{
  public: number,           // Public wallet balance
  shielded: {               // Shielded balance per provider
    privacycash?: number,
    shadowwire?: number,
    arcium?: number,
  },
  total: number,            // public + sum(shielded)
  token: string,
}
```

### Estimate Fees

```typescript
const estimate = await kit.estimate({
  operation: 'transfer' | 'deposit' | 'withdraw',
  amount: number,
  token: string,
  privacy?: PrivacyLevel,
  provider?: PrivacyProvider,
});

// Result
{
  fee: number,              // Estimated fee in SOL
  provider: PrivacyProvider,
  latencyMs: number,        // Expected time
  anonymitySet?: number,    // Size of privacy set
  warnings: string[],       // Any concerns
}
```

### Pipeline (Chain Operations)

```typescript
const result = await kit.pipeline()
  .deposit({ amount: 1, token: 'SOL', provider: PrivacyProvider.PRIVACY_CASH })
  .wait(5000)  // Wait 5 seconds
  .transfer({
    recipient: 'addr...',
    amount: 0.5,
    token: 'SOL',
    privacy: PrivacyLevel.SENDER_HIDDEN,
  })
  .withdraw({
    recipient: 'final-addr...',
    amount: 0.5,
    token: 'SOL',
  })
  .execute();
```

### Get Provider Recommendation

```typescript
const recommendation = await kit.getRouter().selectProvider({
  privacyLevel: PrivacyLevel.SENDER_HIDDEN,
  token: 'SOL',
  amount: 0.1,
  maxFee: 0.01,
});

console.log(recommendation.provider);  // 'shadowwire' or 'privacycash'
console.log(recommendation.score);     // Confidence score
console.log(recommendation.reasons);   // Why this provider
```

### Events

```typescript
kit.on('transfer:start', (request) => {
  console.log('Starting transfer:', request);
});

kit.on('transfer:complete', (result) => {
  console.log('Transfer complete:', result.signature);
});

kit.on('transfer:error', (error, request) => {
  console.error('Transfer failed:', error.message);
});

// Available events:
// - initialized
// - wallet:connected / wallet:disconnected
// - transfer:start / transfer:complete / transfer:error
// - deposit:start / deposit:complete / deposit:error
// - withdraw:start / withdraw:complete / withdraw:error
// - prove:start / prove:complete / prove:error
// - error
```

### Direct Adapter Access

```typescript
// Get a specific adapter
const privacyCash = kit.getAdapter(PrivacyProvider.PRIVACY_CASH);
const balance = await privacyCash.getBalance('SOL');

// Get all adapters
const adapters = kit.getAdapters();
for (const adapter of adapters) {
  console.log(adapter.name, adapter.supportedTokens);
}

// Check provider capabilities
const supported = adapter.supports('transfer', 'SOL', PrivacyLevel.SENDER_HIDDEN);
```

### Cleanup

```typescript
await kit.destroy();
```

## Advanced Usage

### Using with Wallet Adapters

```typescript
import { useWallet } from '@solana/wallet-adapter-react';

const { publicKey, signTransaction, signAllTransactions, signMessage } = useWallet();

const kit = new PrivacyKit({
  network: 'mainnet-beta',
  wallet: {
    publicKey,
    signTransaction,
    signAllTransactions,
    signMessage,
  },
  production: true,
});
```

### Custom ZK Proofs (Noir)

```typescript
const proof = await kit.prove({
  circuit: 'balance-threshold',
  publicInputs: { threshold: 1000 },
  privateInputs: { balance: actualBalance },
  provider: PrivacyProvider.NOIR,
});

// Proof can be verified on-chain
console.log('Proof:', proof.proof);
console.log('Public inputs:', proof.publicInputs);
```

### Error Handling

```typescript
import {
  PrivacyKitError,
  InsufficientBalanceError,
  AmountBelowMinimumError,
  ProviderNotAvailableError,
} from 'privacykit-sdk';

try {
  await kit.transfer({ ... });
} catch (error) {
  if (error instanceof InsufficientBalanceError) {
    console.log(`Need ${error.required} but have ${error.available}`);
  } else if (error instanceof AmountBelowMinimumError) {
    console.log(`Minimum for ${error.provider} is ${error.minimum} ${error.token}`);
  } else if (error instanceof ProviderNotAvailableError) {
    console.log(`Provider ${error.provider} is not available`);
  }
}
```

## Configuration

### Environment Variables

```bash
# Optional: Custom RPC endpoint
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Optional: ShadowWire API key
SHADOWWIRE_API_KEY=your-api-key

# Optional: Enable debug logging
PRIVACY_KIT_DEBUG=true
```

### Provider Minimums

| Provider | SOL Minimum | USDC Minimum |
|----------|-------------|--------------|
| Privacy Cash | 0.01 SOL | 2 USDC |
| ShadowWire | 0.1 SOL | 1 USDC |
| Arcium | 0.001 SOL | 0.1 USDC |
| Noir | No minimum | No minimum |

### Fee Structure

| Provider | Deposit Fee | Withdrawal Fee |
|----------|-------------|----------------|
| Privacy Cash | 0% | 0.35% |
| ShadowWire | 0.3-1% | 0.3-1% |
| Arcium | 0.2% | 0.2% |
| Noir | Gas only | Gas only |

## Testing

```bash
# Run unit tests
bun test

# Run integration tests (requires funded wallet)
bun run scripts/comprehensive-integration-test.ts

# Run specific provider test
bun run scripts/test-private-transfer.ts
```

## Documentation

- [Architecture Overview](./ARCHITECTURE.md) - System design and component diagrams
- [Technical Deep Dive](./TECHNICAL_DEEP_DIVE.md) - Implementation details and protocol specifics
- [Demo Video Script](./DEMO_VIDEO_SCRIPT.md) - Presentation guide

## Examples

### Private Payment

```typescript
// Send SOL privately (sender hidden)
await kit.transfer({
  recipient: 'merchant-address',
  amount: 0.5,
  token: 'SOL',
  privacy: PrivacyLevel.SENDER_HIDDEN,
});
```

### Confidential Token Transfer

```typescript
// Transfer with encrypted amount (Arcium MPC)
await kit.transfer({
  recipient: 'recipient-address',
  amount: 100,
  token: 'USDC',
  privacy: PrivacyLevel.FULL_ENCRYPTED,
  provider: PrivacyProvider.ARCIUM,
});
```

### Anonymous Withdrawal

```typescript
// Deposit, wait, then withdraw to new address
await kit.deposit({ amount: 1, token: 'SOL', provider: PrivacyProvider.PRIVACY_CASH });

// Wait for anonymity set to grow
await new Promise(resolve => setTimeout(resolve, 60000));

// Withdraw to fresh address
await kit.withdraw({
  amount: 0.99,  // minus fees
  token: 'SOL',
  recipient: 'fresh-address',
  provider: PrivacyProvider.PRIVACY_CASH,
});
```

## Mainnet Transactions

Real transactions executed via PrivacyKit SDK:

- [`574LtCnCAMwZ8XwXH8VhJFk5ika88LJR3LF4WsmriRJDfYusAa7eNMgyP6T63w6K3FHWKYtL4bxac1K3PuH34k2i`](https://solscan.io/tx/574LtCnCAMwZ8XwXH8VhJFk5ika88LJR3LF4WsmriRJDfYusAa7eNMgyP6T63w6K3FHWKYtL4bxac1K3PuH34k2i)
- [`yXhutY1ScsjEuRtbXwBJChW63c6wpujV66QoWegAKUk2sc4NSVcdW9hcHFnjirFCUZor7sribPWs3MMD4px8hD7`](https://solscan.io/tx/yXhutY1ScsjEuRtbXwBJChW63c6wpujV66QoWegAKUk2sc4NSVcdW9hcHFnjirFCUZor7sribPWs3MMD4px8hD7)

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

```bash
# Clone the repo
git clone https://github.com/privacykit/sdk.git
cd sdk/packages/sdk

# Install dependencies
bun install

# Run tests
bun test

# Build
bun run build
```

## Security

- **Keys:** Never expose private keys. Use WalletAdapter when possible.
- **Proofs:** ZK proofs are generated client-side; secrets never leave your device.
- **Audits:** Underlying protocols (Privacy Cash, ShadowWire, etc.) have their own audits.

If you discover a security vulnerability, please email security@privacykit.dev.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Acknowledgments

Built with support from:
- [Privacy Cash](https://privacycash.org) - ZK privacy pools
- [RADR Labs](https://radr.fun) - ShadowWire/ShadowPay
- [Arcium](https://arcium.com) - MPC confidential computing
- [Noir](https://noir-lang.org) - ZK circuit language

---

**Privacy without complexity.**

[Documentation](./ARCHITECTURE.md) · [GitHub](https://github.com/privacykit/sdk) · [npm](https://www.npmjs.com/package/privacykit-sdk)
