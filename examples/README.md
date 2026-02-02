# PrivacyKit Examples

This directory contains example applications demonstrating how to use PrivacyKit for private transfers on Solana.

## Examples

### 1. Basic Transfer (`basic-transfer/`)

A Node.js script demonstrating all core PrivacyKit features:

- Simple amount-hidden transfers
- Sender-hidden transfers
- Full encryption with Arcium MPC
- Compliant pool transfers with Privacy Cash
- Using the Privacy Router for automatic provider selection
- Deposit and withdrawal lifecycle
- Multi-token transfers

**Run the example:**

```bash
cd basic-transfer
npm install
npm start
```

### 2. React App (`react-app/`)

A complete Next.js application with:

- Wallet connection (Phantom, Solflare, Backpack, Ledger)
- Private transfer form with privacy level selection
- Balance overview with provider breakdown
- Fee estimation
- Transaction results display
- Responsive UI with Tailwind CSS

**Run the example:**

```bash
cd react-app
npm install
npm run dev
```

Then open http://localhost:3000 in your browser.

## Project Structure

```
examples/
├── basic-transfer/
│   ├── index.ts          # Main script with all examples
│   └── package.json      # Dependencies
│
└── react-app/
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx    # Root layout with providers
    │   │   ├── page.tsx      # Main page component
    │   │   └── globals.css   # Global styles
    │   ├── components/
    │   │   ├── PrivateTransfer.tsx  # Transfer form
    │   │   └── Balance.tsx          # Balance display
    │   ├── context/
    │   │   └── PrivacyKitContext.tsx # React context
    │   └── hooks/
    │       ├── usePrivateTransfer.ts # Transfer hook
    │       └── usePrivateBalance.ts  # Balance hook
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.js
    └── tsconfig.json
```

## Key Concepts Demonstrated

### Privacy Levels

Each example shows different privacy levels:

| Level | Description | Provider |
|-------|-------------|----------|
| `AMOUNT_HIDDEN` | Hide transfer amount | ShadowWire |
| `SENDER_HIDDEN` | Anonymize sender | ShadowWire |
| `FULL_ENCRYPTED` | Encrypt all data | Arcium |
| `COMPLIANT_POOL` | Privacy with compliance | Privacy Cash |

### Using Hooks

The React app demonstrates the recommended hook pattern:

```tsx
import { usePrivateTransfer, usePrivateBalance } from '@/hooks';

function MyComponent() {
  const { executeTransfer, isLoading, result } = usePrivateTransfer();
  const { balance, refresh } = usePrivateBalance('SOL');

  // Use hooks to build your UI
}
```

### Context Provider

Wrap your app with the PrivacyKit provider:

```tsx
import { PrivacyKitProvider } from '@/context/PrivacyKitContext';

function App({ children }) {
  return (
    <ConnectionProvider endpoint={rpcUrl}>
      <WalletProvider wallets={wallets}>
        <PrivacyKitProvider network="devnet">
          {children}
        </PrivacyKitProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

## Configuration

### Environment Variables

Create a `.env.local` file in the react-app directory:

```env
# RPC URL (optional, defaults to devnet)
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com

# For mainnet with Helius
# NEXT_PUBLIC_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

### Network Selection

Change the network in the PrivacyKitProvider:

```tsx
<PrivacyKitProvider network="mainnet-beta">
  {children}
</PrivacyKitProvider>
```

## Customization

### Adding New Tokens

The examples support tokens defined in the SDK. To add UI for additional tokens:

```tsx
const tokens = ['SOL', 'USDC', 'USDT', 'BONK', 'YOUR_TOKEN'];

<TokenSelector tokens={tokens} />
```

### Custom Styling

The React app uses Tailwind CSS. Customize colors in `tailwind.config.js`:

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        privacy: {
          // Your custom colors
        },
      },
    },
  },
};
```

## Troubleshooting

### Wallet Connection Issues

Make sure you have a Solana wallet extension installed:
- [Phantom](https://phantom.app/)
- [Solflare](https://solflare.com/)
- [Backpack](https://backpack.app/)

### RPC Errors

If you see RPC errors, try using a dedicated RPC provider:
- [Helius](https://helius.xyz/)
- [QuickNode](https://quicknode.com/)

### Build Errors

Clear the cache and reinstall:

```bash
rm -rf node_modules .next
npm install
npm run dev
```

## Learn More

- [PrivacyKit Documentation](../docs)
- [API Reference](../docs/api-reference.md)
- [Getting Started Guide](../docs/getting-started.md)
