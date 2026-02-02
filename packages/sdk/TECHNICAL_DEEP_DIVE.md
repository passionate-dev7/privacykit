# PrivacyKit SDK - Technical Deep Dive

## Introduction

This document provides an in-depth technical explanation of the PrivacyKit SDK, covering the design decisions, implementation details, and integration patterns for each privacy provider.

---

## 1. Why PrivacyKit?

### The Problem

Privacy on Solana is fragmented across multiple protocols, each with:
- Different APIs and SDK patterns
- Different cryptographic primitives
- Different wallet integration requirements
- Different token support
- Different fee structures

**Without PrivacyKit:**
```typescript
// ShadowWire
import { ShadowPayClient } from '@radr/shadowwire';
const sw = new ShadowPayClient({ apiKey: '...' });
await sw.transfer({ amount: 100000000, recipient: '...' });

// Privacy Cash
import { PrivacyCash } from 'privacycash';
const pc = new PrivacyCash({ RPC_url: '...', owner: keypair });
await pc.withdraw({ lamports: 100000000, recipientAddress: '...' });

// Arcium
import { ArciumClient } from '@arcium-hq/client';
const arc = ArciumClient.fromKeypair(keypair);
await arc.confidentialTransfer({ amount: 100000000 });

// Noir
import { Noir } from '@noir-lang/noir_js';
const circuit = await Noir.compile('./transfer.nr');
const proof = await circuit.prove({ ... });
```

**With PrivacyKit:**
```typescript
import { PrivacyKit, PrivacyLevel } from '@privacykit/sdk';

const kit = new PrivacyKit({ network: 'mainnet-beta', wallet: keypair, production: true });
await kit.initialize();

// Same API regardless of which provider is used
await kit.transfer({
  recipient: '...',
  amount: 0.1,
  token: 'SOL',
  privacy: PrivacyLevel.SENDER_HIDDEN  // Router picks optimal provider
});
```

---

## 2. Core Design Principles

### 2.1 Adapter Pattern

Every privacy provider is wrapped in an adapter that implements `PrivacyProviderAdapter`:

```typescript
interface PrivacyProviderAdapter {
  readonly provider: PrivacyProvider;
  readonly name: string;
  readonly supportedLevels: PrivacyLevel[];
  readonly supportedTokens: string[];

  initialize(connection: Connection, wallet?: WalletAdapter | Keypair): Promise<void>;
  isReady(): boolean;
  getBalance(token: string, address?: string): Promise<number>;
  transfer(request: TransferRequest): Promise<TransferResult>;
  deposit(request: DepositRequest): Promise<DepositResult>;
  withdraw(request: WithdrawRequest): Promise<WithdrawResult>;
  estimate(request: EstimateRequest): Promise<EstimateResult>;
  supports(operation: string, token: string, privacy: PrivacyLevel): boolean;
}
```

This pattern provides:
- **Consistency:** Same interface across all providers
- **Extensibility:** Easy to add new providers
- **Testability:** Can mock adapters for testing
- **Graceful Degradation:** Failed adapters don't crash the SDK

### 2.2 Production vs Development Adapters

Each provider has two adapter implementations:

| Type | Purpose | SDK Used |
|------|---------|----------|
| **Development** | Testing, local development | Mock implementations |
| **Production** | Real transactions | Official SDKs |

The `production: true` flag in config determines which adapters are instantiated:

```typescript
// In adapters/index.ts
export function createAdapter(provider: PrivacyProvider, options?: CreateAdapterOptions) {
  const useProduction = options?.production ?? false;

  switch (provider) {
    case PrivacyProvider.PRIVACY_CASH:
      return useProduction
        ? new PrivacyCashProductionAdapter()
        : new PrivacyCashAdapter();
    // ...
  }
}
```

### 2.3 Keypair Preservation

A critical design decision was preserving the original `Keypair` for adapters that need it:

```typescript
// In PrivacyKit constructor
if (config.wallet) {
  this.originalWallet = config.wallet;  // Store original (might be Keypair)

  if ('secretKey' in config.wallet) {
    // It's a Keypair - also create WalletAdapter for internal use
    const kp = config.wallet as Keypair;
    this.wallet = {
      publicKey: kp.publicKey,
      signTransaction: async (tx) => { tx.sign([kp]); return tx; },
      // ...
    };
  } else {
    this.wallet = config.wallet as WalletAdapter;
  }
}

// In initialize()
for (const provider of enabledProviders) {
  const adapter = createAdapter(provider, { production: true });
  // Pass originalWallet so Keypair-requiring adapters work
  await adapter.initialize(this.connection, this.originalWallet);
}
```

This allows Privacy Cash (which requires `Keypair` for the official SDK) to work alongside adapters that only need `WalletAdapter`.

---

## 3. Provider Deep Dives

### 3.1 Privacy Cash Integration

**Protocol:** Tornado Cash-style privacy pools on Solana
**SDK:** `privacycash` (official)
**API:** `https://api3.privacycash.org`

#### How It Works

1. **Deposit:** User deposits tokens into a pool, receives a "note" (commitment)
2. **Wait:** Anonymity set grows as more users deposit
3. **Withdraw:** User proves they own a valid note without revealing which one

#### Cryptographic Primitives

**Poseidon Hash:**
```typescript
// src/privacycash/poseidon.ts
function poseidonHash(inputs: bigint[]): bigint {
  // ZK-friendly hash function
  // Uses field arithmetic over BN254 scalar field
  // Much cheaper in ZK circuits than SHA256
}
```

**Merkle Tree:**
```typescript
// src/privacycash/merkle.ts
class IncrementalMerkleTree {
  depth: number = 20;  // 2^20 = 1M leaves
  zeros: bigint[];     // Precomputed zero hashes

  insert(leaf: bigint): void {
    // Insert at next available index
    // Update path to root
  }

  generateProof(index: number): MerkleProof {
    // Return siblings and path indices
  }
}
```

**Note Commitment:**
```typescript
// src/privacycash/commitment.ts
function generateCommitment(amount: bigint, blinding: bigint, pubkey: bigint): bigint {
  return poseidonHash([amount, blinding, pubkey]);
}
```

#### Production Adapter Flow

```typescript
// src/adapters/privacycash-production.ts
async transfer(request: TransferRequest): Promise<TransferResult> {
  // 1. Check existing shielded balance
  const shieldedBalance = await this.getBalance(token);

  // 2. If not enough, deposit first
  if (shieldedBalance < request.amount) {
    await this.deposit({ amount: request.amount - shieldedBalance, token });
  }

  // 3. Withdraw to recipient
  const result = await this.withdraw({
    amount: request.amount,
    token,
    recipient: request.recipient,
  });

  return result;
}
```

#### UTXO Model

Privacy Cash uses a UTXO (Unspent Transaction Output) model:

```typescript
interface UTXO {
  amount: bigint;
  blinding: bigint;
  index: number;
  mintAddress: string;
  keypair: { pubkey: bigint };
  commitment: bigint;
  nullifier: bigint;
}
```

When withdrawing:
1. Select UTXOs that sum to withdrawal amount
2. Create new UTXOs for change
3. Generate ZK proof that inputs are valid
4. Submit nullifiers to prevent double-spend

### 3.2 ShadowWire/ShadowPay Integration

**Protocol:** Privacy payments via ElGamal encryption
**SDK:** `@radr/shadowwire` (via API)
**API:** `https://shadow.radr.fun/shadowpay/api`

#### How It Works

1. **Amount Hiding:** Transfer amounts are ElGamal-encrypted
2. **Sender Hiding:** Optional relayer submission hides sender
3. **Bulletproofs:** Range proofs ensure valid amounts without revealing values

#### API Integration

```typescript
// src/shadowwire/api.ts
class ShadowPayApi {
  private baseUrl = 'https://shadow.radr.fun/shadowpay/api';

  async getBalance(address: string, token: string): Promise<BalanceResponse> {
    return this.request(`/pool/balance/${address}`);
  }

  async submitTransfer(params: TransferParams): Promise<TransferResponse> {
    return this.request('/transfer', { method: 'POST', body: params });
  }
}
```

#### Production Adapter

```typescript
// src/adapters/shadowwire-production.ts
class ShadowWireProductionAdapter extends BaseAdapter {
  readonly supportedLevels = [PrivacyLevel.AMOUNT_HIDDEN, PrivacyLevel.SENDER_HIDDEN];
  readonly supportedTokens = ['SOL', 'USDC', 'RADR', 'BONK', 'ORE'];

  async transfer(request: TransferRequest): Promise<TransferResult> {
    // Convert SOL to lamports
    const amountInSmallestUnits = Math.floor(request.amount * Math.pow(10, decimals));

    // Submit via API
    const result = await this.api.submitTransfer({
      amount: amountInSmallestUnits,
      recipient: request.recipient,
      token: request.token,
    });

    return {
      signature: result.signature,
      provider: this.provider,
      privacyLevel: request.privacy,
      fee: result.fee / Math.pow(10, decimals),
    };
  }
}
```

### 3.3 Arcium Integration

**Protocol:** Multi-Party Computation (MPC) for confidential computing
**SDK:** `@arcium-hq/client`, `@arcium-hq/reader`

#### How It Works

1. **Shield:** Encrypt tokens into C-SPL (Confidential SPL) format
2. **Compute:** MPC nodes perform operations on encrypted data
3. **Unshield:** Decrypt back to regular SPL tokens

#### C-SPL Tokens

Confidential SPL tokens store encrypted balances:

```typescript
// src/arcium/cspl.ts
interface ConfidentialTokenAccount {
  mint: PublicKey;
  owner: PublicKey;
  encryptedBalance: Uint8Array;  // Encrypted with MPC key
  decryptableBalance: Uint8Array;  // For owner only
}
```

#### Production Adapter

```typescript
// src/adapters/arcium-production.ts
class ArciumProductionAdapter extends BaseAdapter {
  readonly supportedLevels = [PrivacyLevel.FULL_ENCRYPTED, PrivacyLevel.AMOUNT_HIDDEN];

  async initialize(connection: Connection, wallet?: WalletAdapter | Keypair): Promise<void> {
    // Dynamic import of official SDKs
    const { ArciumClient } = await import('@arcium-hq/client');
    const { Reader } = await import('@arcium-hq/reader');

    this.arciumClient = ArciumClient.fromKeypair(keypair, {
      clusterOffset: 0,  // Mainnet cluster
    });

    this.reader = new Reader(connection);
  }

  async transfer(request: TransferRequest): Promise<TransferResult> {
    // 1. Shield tokens if not already confidential
    // 2. Execute confidential transfer
    // 3. Return result
  }
}
```

### 3.4 Noir Integration

**Protocol:** General-purpose ZK proofs
**SDK:** `@noir-lang/noir_js`, `@noir-lang/backend_barretenberg`

#### Circuit Compilation

```typescript
// src/noir/compiler.ts
class NoirCompiler {
  async compile(circuitSource: string): Promise<CompiledCircuit> {
    const { compile } = await import('@noir-lang/noir_js');
    return compile(circuitSource);
  }
}
```

#### Proof Generation

```typescript
// src/noir/prover.ts
class NoirProver {
  async generateProof(circuit: CompiledCircuit, inputs: Record<string, any>): Promise<Uint8Array> {
    const { BarretenbergBackend } = await import('@noir-lang/backend_barretenberg');
    const backend = new BarretenbergBackend(circuit);
    const { proof } = await backend.generateProof(inputs);
    return proof;
  }
}
```

#### Pre-defined Circuits

```typescript
// Balance threshold proof
// Proves: "I have more than X tokens" without revealing exact balance
circuit balance_threshold {
  priv balance: Field,
  pub threshold: Field,

  assert(balance >= threshold);
}
```

---

## 4. Router Algorithm

The router scores each provider based on multiple factors:

```typescript
// src/core/router.ts
async scoreCandidate(candidate: ProviderCandidate, criteria: SelectionCriteria): Promise<number> {
  let score = 100;  // Base score

  // Provider preference bonus
  if (criteria.preferredProvider === candidate.provider) {
    score += 50;
  }

  // Fee efficiency (0-20 points)
  const feeScore = Math.max(0, 20 - (estimate.fee / criteria.amount) * 100);
  score += feeScore;

  // Latency efficiency (0-20 points)
  const latencyScore = Math.max(0, 20 - (estimate.latencyMs / 10000) * 10);
  score += latencyScore;

  // Privacy level match (0-25 points)
  if (candidate.supportedLevels.includes(criteria.privacyLevel)) {
    score += 25;
  }

  // Anonymity set bonus (0-15 points, logarithmic)
  if (estimate.anonymitySet) {
    score += Math.min(15, Math.log10(estimate.anonymitySet) * 5);
  }

  // Compliance bonus
  if (criteria.preferCompliance && hasComplianceFeatures(candidate)) {
    score += 10;
  }

  // Warning penalty
  score -= estimate.warnings.length * 5;

  return score;
}
```

**Selection Example:**

```
Request: { privacy: SENDER_HIDDEN, token: SOL, amount: 0.1 }

Provider Scores:
- Privacy Cash: 138 (supports SENDER_HIDDEN, compliance features)
- ShadowWire: 147 (supports SENDER_HIDDEN, lower fees, faster)
- Arcium: 95 (doesn't support SENDER_HIDDEN directly)
- Noir: 80 (requires custom circuit setup)

Winner: ShadowWire (score: 147)
```

---

## 5. Event System

PrivacyKit uses an EventEmitter pattern:

```typescript
interface PrivacyKitEvents {
  initialized: (providers: PrivacyProvider[]) => void;
  'wallet:connected': (publicKey: string) => void;
  'transfer:start': (request: TransferRequest) => void;
  'transfer:complete': (result: TransferResult) => void;
  'transfer:error': (error: Error, request: TransferRequest) => void;
  // ... more events
}
```

**Usage:**

```typescript
kit.on('transfer:start', (request) => {
  console.log(`Starting transfer of ${request.amount} ${request.token}`);
});

kit.on('transfer:complete', (result) => {
  console.log(`Transfer complete: ${result.signature}`);
});

kit.on('transfer:error', (error, request) => {
  console.error(`Transfer failed: ${error.message}`);
});
```

---

## 6. Error Handling Strategy

### Error Hierarchy

```typescript
class PrivacyKitError extends Error {
  code: string;
  details?: Record<string, any>;
}

class InsufficientBalanceError extends PrivacyKitError {
  required: number;
  available: number;
}

class AmountBelowMinimumError extends PrivacyKitError {
  amount: number;
  minimum: number;
  token: string;
  provider: string;
}
```

### Error Wrapping

All adapter errors are wrapped for consistency:

```typescript
function wrapError(error: unknown, message: string): PrivacyKitError {
  if (error instanceof PrivacyKitError) {
    return error;
  }
  return new PrivacyKitError(
    `${message}: ${error instanceof Error ? error.message : String(error)}`,
    'UNKNOWN_ERROR'
  );
}
```

---

## 7. Testing Strategy

### Unit Tests

```typescript
// src/__tests__/router.test.ts
describe('PrivacyRouter', () => {
  it('should select Privacy Cash for COMPLIANT_POOL', async () => {
    const result = await router.selectProvider({
      privacyLevel: PrivacyLevel.COMPLIANT_POOL,
      token: 'SOL',
    });
    expect(result.provider).toBe(PrivacyProvider.PRIVACY_CASH);
  });
});
```

### Integration Tests

```typescript
// scripts/comprehensive-integration-test.ts
// Tests against mainnet with real funds
await runTest('Execute private transfer', async () => {
  const result = await kit.transfer({
    recipient: 'ia3MLukFMa6zci4nyahxsKVT14yLkFzUkZs3EL5Vsa5',
    amount: 0.01,
    token: 'SOL',
    privacy: PrivacyLevel.SENDER_HIDDEN,
  });
  expect(result.signature).toBeDefined();
});
```

### Test Coverage

| Component | Unit Tests | Integration Tests |
|-----------|------------|-------------------|
| Router | ✓ | ✓ |
| Privacy Cash Adapter | ✓ | ✓ |
| ShadowWire Adapter | ✓ | - (needs 0.1+ SOL) |
| Arcium Adapter | ✓ | - (MPC setup) |
| Noir Adapter | ✓ | ✓ |
| Poseidon Hash | ✓ | - |
| Merkle Tree | ✓ | - |

---

## 8. Future Improvements

1. **Circuit CDN:** Deploy compiled Noir circuits to CDN for faster loading
2. **Parallel Proving:** Generate multiple ZK proofs concurrently
3. **Stealth Addresses:** Add stealth address generation for enhanced privacy
4. **Cross-Chain:** Bridge privacy operations to other chains
5. **React Hooks:** Add `usePrivacyKit()` hook for React applications

---

## 9. Performance Optimizations

### UTXO Caching

Privacy Cash adapter caches decrypted UTXOs:

```typescript
// Cache decrypted UTXOs to avoid repeated decryption
private utxoCache: Map<string, DecryptedUTXO[]> = new Map();

async getBalance(token: string): Promise<number> {
  const cacheKey = `${this.keypair?.publicKey.toBase58()}-${token}`;
  if (this.utxoCache.has(cacheKey)) {
    return this.sumUTXOs(this.utxoCache.get(cacheKey)!);
  }
  // ... fetch and decrypt UTXOs
}
```

### Lazy SDK Loading

Official SDKs are loaded dynamically only when needed:

```typescript
async initialize() {
  // Only load if production mode and provider is enabled
  if (this.config.production) {
    const { PrivacyCash } = await import('privacycash');
    // ...
  }
}
```

---

## Conclusion

PrivacyKit SDK provides a unified, production-ready interface for privacy operations on Solana. By abstracting the complexity of multiple protocols behind a consistent API, developers can easily build privacy-first applications without deep cryptographic expertise.

The modular adapter architecture ensures extensibility, while the intelligent router optimizes for user preferences in terms of privacy level, cost, and speed.
