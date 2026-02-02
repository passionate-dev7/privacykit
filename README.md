# PrivacyKit

**Unified Privacy SDK for Solana** - One interface for all privacy technologies on Solana blockchain.

PrivacyKit provides a single, unified API to interact with multiple privacy protocols on Solana, including ShadowWire, Arcium, Noir, and Privacy Cash. Build privacy-preserving applications without worrying about the underlying protocol complexity.

## Features

- **Unified API**: Single interface for multiple privacy providers
- **Smart Routing**: Automatic selection of the best provider based on your requirements
- **Multiple Privacy Levels**: From amount hiding to full encryption
- **Multi-Token Support**: SOL, USDC, USDT, and more
- **React Hooks**: Ready-to-use hooks for React/Next.js applications
- **TypeScript First**: Full type safety and IDE support

## Supported Privacy Providers

| Provider | Privacy Features | Tokens |
|----------|-----------------|--------|
| **ShadowWire** | Amount Hidden, Sender Hidden | SOL, USDC, USDT, BONK, RADR, ORE, and more |
| **Arcium** | Full Encryption (MPC) | SOL, USDC |
| **Privacy Cash** | Compliant Pool (with proof of innocence) | SOL, USDC |
| **Noir** | ZK-Proven transfers | Any token |

## Installation

```bash
bun install @privacykit/sdk
# or
yarn add @privacykit/sdk
# or
pnpm add @privacykit/sdk
```

## Quick Start

### Basic Transfer

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { PrivacyLevel } from '@privacykit/sdk';
import { ShadowWireAdapter } from '@privacykit/sdk/adapters';

// Initialize
const connection = new Connection('https://api.devnet.solana.com');
const adapter = new ShadowWireAdapter();
await adapter.initialize(connection, wallet);

// Execute private transfer
const result = await adapter.transfer({
  recipient: 'RecipientAddress...',
  amount: 1.5,
  token: 'SOL',
  privacy: PrivacyLevel.AMOUNT_HIDDEN,
});

console.log('Transaction:', result.signature);
```

### React Integration

```tsx
import { usePrivateTransfer } from '@privacykit/react';

function TransferButton() {
  const { executeTransfer, isLoading } = usePrivateTransfer();

  const handleTransfer = async () => {
    const result = await executeTransfer({
      recipient: 'RecipientAddress...',
      amount: 1.5,
      token: 'SOL',
      privacy: PrivacyLevel.AMOUNT_HIDDEN,
    });
  };

  return (
    <button onClick={handleTransfer} disabled={isLoading}>
      Send Private Transfer
    </button>
  );
}
```

## Privacy Levels

PrivacyKit supports multiple privacy levels to match your needs:

| Level | Description | Provider |
|-------|-------------|----------|
| `AMOUNT_HIDDEN` | Transfer amount is hidden using ZK proofs | ShadowWire |
| `SENDER_HIDDEN` | Sender identity is anonymized | ShadowWire |
| `FULL_ENCRYPTED` | All transaction data encrypted via MPC | Arcium |
| `COMPLIANT_POOL` | Privacy with proof of innocence | Privacy Cash |
| `ZK_PROVEN` | Custom ZK circuit verification | Noir |

## Architecture

```
                    +-----------------+
                    |   Your dApp     |
                    +-----------------+
                           |
                           v
                    +-----------------+
                    |   PrivacyKit    |
                    |     Router      |
                    +-----------------+
                           |
        +------------------+------------------+
        |                  |                  |
        v                  v                  v
+-------------+    +-------------+    +---------------+
| ShadowWire  |    |   Arcium    |    | Privacy Cash  |
|   Adapter   |    |   Adapter   |    |    Adapter    |
+-------------+    +-------------+    +---------------+
```

## Examples

### Basic Transfer Example

See the [basic-transfer example](./examples/basic-transfer) for a complete Node.js script demonstrating all privacy levels.

```bash
cd examples/basic-transfer
npm install
npm start
```

### React/Next.js Example

See the [react-app example](./examples/react-app) for a complete Next.js application with wallet connection and transfer UI.

```bash
cd examples/react-app
npm install
npm run dev
```

## API Reference

### Core Types

```typescript
// Privacy levels
enum PrivacyLevel {
  AMOUNT_HIDDEN = 'amount-hidden',
  SENDER_HIDDEN = 'sender-hidden',
  FULL_ENCRYPTED = 'full-encrypted',
  ZK_PROVEN = 'zk-proven',
  COMPLIANT_POOL = 'compliant-pool',
  NONE = 'none',
}

// Transfer request
interface TransferRequest {
  recipient: string | PublicKey;
  amount: number;
  token: string;
  privacy: PrivacyLevel;
  provider?: PrivacyProvider;
  options?: TransferOptions;
}

// Transfer result
interface TransferResult {
  signature: TransactionSignature;
  provider: PrivacyProvider;
  privacyLevel: PrivacyLevel;
  fee: number;
  anonymitySet?: number;
}
```

### Adapter Methods

All adapters implement these core methods:

| Method | Description |
|--------|-------------|
| `initialize(connection, wallet)` | Initialize the adapter |
| `getBalance(token)` | Get shielded balance |
| `transfer(request)` | Execute private transfer |
| `deposit(request)` | Deposit into privacy pool |
| `withdraw(request)` | Withdraw from privacy pool |
| `estimate(request)` | Estimate fees and latency |

See the [full API documentation](./docs/api-reference.md) for complete details.

## Development

```bash
# Clone the repository
git clone https://github.com/passionate-dev7/privacykit.git
cd privacykit

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Start development mode
npm run dev
```

## Project Structure

```
privacykit/
├── packages/
│   └── sdk/                 # Core SDK package
│       ├── src/
│       │   ├── adapters/    # Provider adapters
│       │   ├── core/        # Router and core logic
│       │   ├── types/       # TypeScript types
│       │   └── utils/       # Utility functions
│       └── package.json
├── examples/
│   ├── basic-transfer/      # Node.js example
│   └── react-app/           # Next.js example
├── docs/                    # Documentation
└── package.json             # Root workspace config
```

## Roadmap

- [ ] Inco Network integration
- [ ] Cross-chain privacy bridges
- [ ] Mobile wallet support
- [ ] Browser extension
- [ ] Privacy analytics dashboard
- [ ] Compliance API
- [ ] Multi-sig support

## Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Security

If you discover a security vulnerability, please send an email to security@privacykit.dev. All security vulnerabilities will be promptly addressed.

## License

MIT License - see the [LICENSE](./LICENSE) file for details.

## Links

- [Documentation](https://docs.privacykit.dev)
- [API Reference](./docs/api-reference.md)
- [Examples](./examples)
- [GitHub Issues](https://github.com/privacykit/privacykit/issues)

---

Built with privacy in mind by the PrivacyKit team.
