# ShadowWire/ShadowPay Integration

This document describes the integration with the ShadowPay API by RADR Labs for private payments on Solana.

## Overview

ShadowPay is a privacy payment protocol built on Solana that uses:
- **Groth16 ZK-SNARKs** for transaction validity verification
- **ElGamal encryption** on BN254 curve for amount privacy
- **Poseidon hashing** for cryptographic commitments
- **Bitmap nullifiers** for double-spend prevention

## API Information

### Base URL

```
https://shadow.radr.fun/shadowpay/v1
```

### Authentication

The ShadowPay API uses two authentication mechanisms:

1. **API Key** (Server-side): For merchant integrations
   - Header: `X-API-Key: your_api_key`
   - Obtain from: ShadowPay dashboard

2. **Access Token** (Payment verification): For verifying payments
   - Header: `X-Access-Token: payment_access_token`
   - Returned after successful payment

### Rate Limits

- Standard rate limit: 100 requests/minute
- Burst limit: 20 requests/second
- Rate limited responses return HTTP 429 with `Retry-After` header

## Getting Started

### Installation

```bash
npm install @privacykit/sdk
```

### Quick Start

```typescript
import { ShadowWireAdapter, PrivacyLevel } from '@privacykit/sdk';
import { Connection, Keypair } from '@solana/web3.js';

// Initialize adapter
const adapter = new ShadowWireAdapter(process.env.SHADOWPAY_API_KEY);

// Connect to Solana
const connection = new Connection('https://api.mainnet-beta.solana.com');
await adapter.initialize(connection, walletAdapter);

// Execute private transfer (amount hidden)
const result = await adapter.transfer({
  recipient: 'recipient_address',
  amount: 1.0,
  token: 'SOL',
  privacy: PrivacyLevel.AMOUNT_HIDDEN
});

console.log('Transaction:', result.signature);
```

### Using the API Client Directly

```typescript
import { createShadowPayClient } from '@privacykit/sdk';

const client = createShadowPayClient({
  apiKey: process.env.SHADOWPAY_API_KEY,
  network: 'mainnet-beta'
});

// Verify a payment
const verification = await client.verifyPayment(accessToken, {
  amount: 0.001,
  token: 'SOL'
});

if (verification.authorized) {
  // Grant access
}
```

## API Endpoints

### Payment Verification

```
GET /shadowpay/v1/payment/verify-access
Headers:
  X-Access-Token: <access_token>

Response:
{
  "authorized": true,
  "status": "paid",
  "amount": 0.001,
  "token": "SOL",
  "payer": "wallet_address",
  "timestamp": 1706466000000
}
```

### Private Transfer

```
POST /shadowpay/v1/transfer
Headers:
  Content-Type: application/json

Body:
{
  "sender": "sender_wallet_address",
  "recipient": "recipient_address",
  "amount": 1.0,
  "token": "SOL",
  "type": "internal" | "external",
  "timestamp": 1706466000000,
  "signature": "base64_wallet_signature"
}

Response:
{
  "success": true,
  "transactionId": "transaction_signature",
  "fee": 0.005
}
```

### Deposit

```
POST /shadowpay/v1/deposit
Headers:
  Content-Type: application/json

Body:
{
  "wallet": "wallet_address",
  "amount": "1000000000",  // In smallest units (lamports)
  "token": "SOL",
  "timestamp": 1706466000000,
  "signature": "base64_wallet_signature"
}

Response:
{
  "success": true,
  "transactionId": "transaction_signature",
  "commitment": "commitment_hash",
  "fee": 0.005
}
```

### Withdrawal

```
POST /shadowpay/v1/withdraw
Headers:
  Content-Type: application/json

Body:
{
  "wallet": "wallet_address",
  "recipient": "recipient_address",
  "amount": "1000000000",
  "token": "SOL",
  "timestamp": 1706466000000,
  "signature": "base64_wallet_signature"
}

Response:
{
  "success": true,
  "transactionId": "transaction_signature",
  "fee": 0.005
}
```

## Transfer Types

### Internal Transfers (Amount Hidden)

- Amount is encrypted using ElGamal on BN254
- Only sender and recipient can decrypt the amount
- Uses ZK proofs to verify validity without revealing amount
- Privacy level: `PrivacyLevel.AMOUNT_HIDDEN`

### External Transfers (Sender Hidden)

- Sender identity is protected
- Amount is visible on-chain
- Uses relayer network for transaction submission
- Privacy level: `PrivacyLevel.SENDER_HIDDEN`

## Supported Tokens

| Token | Decimals | Fee | Min Amount |
|-------|----------|-----|------------|
| SOL | 9 | 0.5% | 0.001 |
| USDC | 6 | 1.0% | 0.10 |
| USDT | 6 | 1.0% | 0.10 |
| RADR | 9 | 0.3% | 0.10 |
| BONK | 5 | 1.0% | 100,000 |
| ORE | 11 | 0.3% | 0.001 |

Additional SPL tokens can be specified by mint address.

## Webhooks

ShadowPay supports webhooks for real-time payment notifications:

```typescript
import express from 'express';
import { ShadowPayApiClient } from '@privacykit/sdk';

const app = express();
const client = new ShadowPayApiClient({ apiKey: 'your_api_key' });

app.post('/webhooks/shadowpay', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-shadowpay-signature'];
  const event = client.parseWebhookEvent(req.body.toString(), signature, 'webhook_secret');

  if (!event) {
    return res.status(400).send('Invalid webhook');
  }

  switch (event.type) {
    case 'payment.success':
      console.log('Payment received:', event.data);
      break;
    case 'payment.failed':
      console.log('Payment failed:', event.data);
      break;
    case 'payment.refunded':
      console.log('Payment refunded:', event.data);
      break;
  }

  res.status(200).send('OK');
});
```

### Webhook Event Types

- `payment.success` - Payment completed successfully
- `payment.failed` - Payment failed
- `payment.refunded` - Payment was refunded
- `payment.pending` - Payment is pending confirmation
- `payment.expired` - Payment request expired

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MISSING_API_KEY` | 401 | API key not provided |
| `INVALID_API_KEY` | 401 | API key is invalid |
| `MISSING_ACCESS_TOKEN` | 401 | Access token not provided |
| `INVALID_ACCESS_TOKEN` | 401 | Access token is invalid |
| `EXPIRED_ACCESS_TOKEN` | 401 | Access token has expired |
| `PAYMENT_REQUIRED` | 402 | Payment required to access resource |
| `INSUFFICIENT_BALANCE` | 400 | Insufficient balance for operation |
| `AMOUNT_BELOW_MINIMUM` | 400 | Amount below minimum threshold |
| `INVALID_RECIPIENT` | 400 | Recipient address is invalid |
| `UNSUPPORTED_TOKEN` | 400 | Token is not supported |
| `RATE_LIMITED` | 429 | Too many requests |

## x402 Protocol Integration

ShadowPay implements the x402 payment protocol for HTTP-native payments:

```typescript
// Server-side middleware (Express)
import { ShadowPay } from '@shadowpay/server';

const shadowpay = new ShadowPay({ apiKey: process.env.SHADOWPAY_API_KEY });

app.get('/api/premium',
  shadowpay.requirePayment({ amount: 0.001, token: 'SOL' }),
  (req, res) => {
    res.json({ data: 'Premium content' });
  }
);
```

When payment is required, the server responds with HTTP 402 and the payment requirement header:

```
HTTP/1.1 402 Payment Required
X-Payment-Required: amount=0.001; token=SOL
```

## ZK Circuit URLs

For client-side proof generation:

```
WASM: https://shadow.radr.fun/shadowpay/circuit-elgamal/circuit.wasm
ZKey: https://shadow.radr.fun/shadowpay/circuit-elgamal/circuit_final.zkey
VKey: https://shadow.radr.fun/shadowpay/circuit-elgamal/verification_key.json
```

## Program IDs

- **ShadowPay Program**: `GQBqwwoikYh7p6KEUHDUu5r9dHHXx9tMGskAPubmFPzD`

## Resources

- Website: https://radrlabs.io
- API Registry: https://registry.scalar.com/@radr/apis/shadowpay-api
- NPM Packages:
  - `@shadowpay/core` - Cryptographic utilities
  - `@shadowpay/server` - Server SDK
  - `@shadowpay/client` - Client SDK
- GitHub: https://github.com/Radrdotfun/shadowpay-sdk

## Environment Variables

```bash
# Required for server-side operations
SHADOWPAY_API_KEY=your_api_key_here

# Optional: Custom API URL (for testing)
SHADOWPAY_API_URL=https://shadow.radr.fun

# Optional: Webhook secret for signature verification
SHADOWPAY_WEBHOOK_SECRET=your_webhook_secret
```

## Security Considerations

1. **Never expose API keys** in client-side code
2. **Always verify webhook signatures** before processing events
3. **Use HTTPS** for all API communications
4. **Validate payment amounts** before granting access
5. **Store commitments securely** for future withdrawals
