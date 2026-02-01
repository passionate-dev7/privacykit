# PrivacyKit SDK Architecture

## Overview

PrivacyKit SDK is a **unified privacy abstraction layer** for Solana that provides a single, consistent interface to multiple privacy-preserving protocols. It enables developers to build privacy-first applications without needing to understand the complexities of each underlying protocol.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Application Layer                             │
│                    (Your dApp, Wallet, or Service)                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          PrivacyKit SDK                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │ PrivacyKit  │  │    Router    │  │  Pipeline   │  │    Events     │  │
│  │   (Core)    │  │ (Selection)  │  │  (Chaining) │  │   (Emitter)   │  │
│  └─────────────┘  └──────────────┘  └─────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           Adapter Layer                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  ShadowWire  │  │    Arcium    │  │ Privacy Cash │  │     Noir     │   │
│  │   Adapter    │  │   Adapter    │  │   Adapter    │  │   Adapter    │   │
│  │ (Production) │  │ (Production) │  │ (Production) │  │  (Unified)   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                        Protocol/SDK Layer                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ @radr/       │  │ @arcium-hq/  │  │ privacycash  │  │ @noir-lang/  │   │
│  │ shadowwire   │  │ client       │  │ SDK          │  │ noir_js      │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Solana Blockchain                               │
│              (Program Interactions, Transactions, State)                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
packages/sdk/
├── src/
│   ├── core/                    # Core SDK classes
│   │   ├── privacykit.ts        # Main PrivacyKit class
│   │   ├── router.ts            # Intelligent provider selection
│   │   └── pipeline.ts          # Operation chaining
│   │
│   ├── adapters/                # Provider adapters
│   │   ├── base.ts              # BaseAdapter abstract class
│   │   ├── shadowwire.ts        # ShadowWire dev adapter
│   │   ├── shadowwire-production.ts  # ShadowWire production
│   │   ├── arcium.ts            # Arcium dev adapter
│   │   ├── arcium-production.ts # Arcium production
│   │   ├── privacycash.ts       # Privacy Cash dev adapter
│   │   ├── privacycash-production.ts # Privacy Cash production
│   │   └── noir.ts              # Noir ZK adapter
│   │
│   ├── shadowwire/              # ShadowWire protocol module
│   │   ├── api.ts               # ShadowPay API client
│   │   └── types.ts             # ShadowWire types
│   │
│   ├── arcium/                  # Arcium MPC module
│   │   ├── client.ts            # Arcium client wrapper
│   │   ├── cspl.ts              # Confidential SPL tokens
│   │   ├── encryption.ts        # X25519, Rescue, AES
│   │   └── types.ts             # Arcium types
│   │
│   ├── privacycash/             # Privacy Cash ZK pool module
│   │   ├── poseidon.ts          # Poseidon hash implementation
│   │   ├── merkle.ts            # Incremental Merkle trees
│   │   ├── commitment.ts        # Note commitments
│   │   └── prover.ts            # ZK proof generation
│   │
│   ├── noir/                    # Noir ZK proof module
│   │   ├── compiler.ts          # Circuit compilation
│   │   ├── prover.ts            # Proof generation
│   │   └── verifier.ts          # On-chain verification
│   │
│   ├── types/                   # TypeScript definitions
│   │   ├── index.ts             # Main type exports
│   │   └── tokens.ts            # Token registry
│   │
│   └── utils/                   # Utility functions
│       ├── errors.ts            # Error classes
│       ├── logger.ts            # Logging system
│       └── constants.ts         # Configuration constants
│
├── scripts/                     # Test and utility scripts
│   ├── comprehensive-integration-test.ts
│   ├── test-private-transfer.ts
│   └── test-privacykit-transactions.ts
│
└── __tests__/                   # Unit and integration tests
```

---

## Core Components

### 1. PrivacyKit (Core Entry Point)

**File:** `src/core/privacykit.ts`

The main SDK class that orchestrates all privacy operations.

```typescript
class PrivacyKit extends EventEmitter<PrivacyKitEvents> {
  // Lifecycle
  async initialize(): Promise<void>
  async destroy(): Promise<void>

  // Core Operations
  async transfer(request: TransferRequest): Promise<TransferResult>
  async deposit(request: DepositRequest): Promise<DepositResult>
  async withdraw(request: WithdrawRequest): Promise<WithdrawResult>
  async prove(request: ProveRequest): Promise<ProveResult>

  // Query Operations
  async getBalance(token: string): Promise<BalanceResult>
  async estimate(request: EstimateRequest): Promise<EstimateResult>

  // Advanced
  pipeline(): PipelineBuilder
  getRouter(): PrivacyRouter
  getAdapter(provider: PrivacyProvider): PrivacyProviderAdapter
}
```

**Key Features:**
- Automatic adapter initialization with `production: true` flag
- Accepts both `Keypair` and `WalletAdapter` for maximum compatibility
- Event emission for all operations (`transfer:start`, `transfer:complete`, etc.)
- Graceful degradation when adapters fail to initialize

### 2. Privacy Router (Intelligent Selection)

**File:** `src/core/router.ts`

Automatically selects the optimal privacy provider based on criteria.

```typescript
interface SelectionCriteria {
  privacyLevel: PrivacyLevel;
  token: string;
  amount?: number;
  maxFee?: number;
  maxLatency?: number;
  preferCompliance?: boolean;
  requireOnChainVerification?: boolean;
  preferredProvider?: PrivacyProvider;
}

interface SelectionResult {
  provider: PrivacyProvider;
  adapter: PrivacyProviderAdapter;
  estimate: EstimateResult;
  score: number;
  reasons: string[];
}
```

**Scoring Algorithm:**
- Base score: 100 points
- Provider preference bonus: +50 points
- Fee efficiency: 0-20 points (lower fees = higher score)
- Latency efficiency: 0-20 points (lower latency = higher score)
- Privacy level match: 0-25 points
- Anonymity set size: 0-15 points (logarithmic scale)
- Warning penalty: -5 points per warning

### 3. Pipeline Builder (Operation Chaining)

**File:** `src/core/pipeline.ts`

Chains multiple privacy operations into atomic sequences.

```typescript
const result = await kit.pipeline()
  .deposit({ amount: 1, token: 'SOL', provider: 'privacycash' })
  .wait(5000)
  .transfer({ recipient: 'addr...', amount: 0.5, token: 'SOL', privacy: 'sender-hidden' })
  .withdraw({ recipient: 'final...', amount: 0.5, token: 'SOL' })
  .execute();
```

---

## Adapter Layer

### BaseAdapter (Abstract Class)

**File:** `src/adapters/base.ts`

All adapters extend this base class:

```typescript
abstract class BaseAdapter implements PrivacyProviderAdapter {
  abstract readonly provider: PrivacyProvider;
  abstract readonly name: string;
  abstract readonly supportedLevels: PrivacyLevel[];
  abstract readonly supportedTokens: string[];

  protected connection: Connection | null = null;
  protected wallet: WalletAdapter | null = null;
  protected logger: Logger;

  async initialize(connection: Connection, wallet?: WalletAdapter | Keypair): Promise<void>
  isReady(): boolean
  supports(operation: string, token: string, privacy: PrivacyLevel): boolean

  abstract getBalance(token: string): Promise<number>
  abstract transfer(request: TransferRequest): Promise<TransferResult>
  abstract deposit(request: DepositRequest): Promise<DepositResult>
  abstract withdraw(request: WithdrawRequest): Promise<WithdrawResult>
  abstract estimate(request: EstimateRequest): Promise<EstimateResult>
}
```

### Production Adapters

| Adapter | Official SDK | Privacy Levels | Key Features |
|---------|-------------|----------------|--------------|
| **ShadowWireProductionAdapter** | `@radr/shadowwire` | AMOUNT_HIDDEN, SENDER_HIDDEN | ElGamal encryption, Groth16 proofs |
| **ArciumProductionAdapter** | `@arcium-hq/client` | FULL_ENCRYPTED, AMOUNT_HIDDEN | MPC coordination, C-SPL tokens |
| **PrivacyCashProductionAdapter** | `privacycash` | COMPLIANT_POOL, SENDER_HIDDEN | Poseidon hash, Merkle trees |
| **NoirAdapter** | `@noir-lang/noir_js` | ZK_PROVEN | Circuit compilation, Barretenberg |

---

## Privacy Levels

```typescript
enum PrivacyLevel {
  AMOUNT_HIDDEN = 'amount-hidden',      // Amount encrypted, parties visible
  SENDER_HIDDEN = 'sender-hidden',      // Sender anonymous via relayers
  FULL_ENCRYPTED = 'full-encrypted',    // All data encrypted (MPC)
  ZK_PROVEN = 'zk-proven',              // Custom ZK proofs
  COMPLIANT_POOL = 'compliant-pool',    // Tornado-style with compliance
  NONE = 'none'                         // Standard Solana transaction
}
```

**Privacy Level → Provider Mapping:**

```
AMOUNT_HIDDEN   → ShadowWire (Bulletproofs/ElGamal)
SENDER_HIDDEN   → ShadowWire (Relayers) or Privacy Cash (ZK pools)
FULL_ENCRYPTED  → Arcium (MPC)
ZK_PROVEN       → Noir (Custom circuits)
COMPLIANT_POOL  → Privacy Cash (Proof-of-innocence)
```

---

## Protocol Modules

### ShadowWire Module (`src/shadowwire/`)

Integrates with RADR Labs' ShadowPay protocol.

**API Endpoint:** `https://shadow.radr.fun/shadowpay/api`

**Cryptography:**
- Groth16 ZK-SNARKs for transaction validity
- ElGamal encryption on BN254 curve for amounts
- Poseidon hashing for commitments
- Bitmap nullifiers for double-spend prevention

**Supported Tokens:** SOL, USDC, USDT, BONK, RADR, ORE, JIM, ANON

### Arcium Module (`src/arcium/`)

Integrates with Arcium's MPC network.

**Features:**
- X25519 key exchange
- Rescue cipher for ZK-friendly encryption
- Confidential SPL (C-SPL) token support
- Multi-party computation coordination

**Supported Tokens:** SOL, USDC, USDT, BONK

### Privacy Cash Module (`src/privacycash/`)

Tornado Cash-style privacy pools for Solana.

**Cryptography:**
- Poseidon hash (ZK-friendly)
- Incremental Merkle trees (depth: 20)
- Groth16 proofs for withdrawals
- Note commitments with blinding factors

**Relayer API:** `https://api3.privacycash.org`

### Noir Module (`src/noir/`)

General-purpose ZK proof system.

**Components:**
- **Compiler:** Circuit → WASM + zkey artifacts
- **Prover:** Witness → Groth16 proof (Barretenberg)
- **Verifier:** On-chain verification via Sunspot program

**Pre-defined Circuits:**
- `private-transfer` - Private value transfers
- `balance-threshold` - Prove balance > X without revealing exact amount
- `ownership` - Prove ownership without revealing key

---

## Data Flow: Private Transfer

```
User Request                              PrivacyKit SDK
     │                                         │
     ▼                                         ▼
┌─────────────┐                    ┌─────────────────────┐
│ transfer({  │                    │ 1. Validate request │
│   recipient,│─────────────────▶  │ 2. Router selects   │
│   amount,   │                    │    provider         │
│   privacy   │                    │ 3. Check balance    │
│ })          │                    └─────────────────────┘
└─────────────┘                              │
                                             ▼
                               ┌─────────────────────────┐
                               │ Privacy Cash Adapter    │
                               │ ┌─────────────────────┐ │
                               │ │ Check shielded bal  │ │
                               │ │ If sufficient:      │ │
                               │ │   → Withdraw only   │ │
                               │ │ Else:               │ │
                               │ │   → Deposit + Withdr│ │
                               │ └─────────────────────┘ │
                               └─────────────────────────┘
                                             │
                                             ▼
                               ┌─────────────────────────┐
                               │ Official SDK            │
                               │ ┌─────────────────────┐ │
                               │ │ 1. Fetch UTXOs      │ │
                               │ │ 2. Generate ZK proof│ │
                               │ │ 3. Build transaction│ │
                               │ │ 4. Submit to relayer│ │
                               │ └─────────────────────┘ │
                               └─────────────────────────┘
                                             │
                                             ▼
                               ┌─────────────────────────┐
                               │ Solana Blockchain       │
                               │ ┌─────────────────────┐ │
                               │ │ Verify ZK proof     │ │
                               │ │ Update Merkle root  │ │
                               │ │ Transfer to recip.  │ │
                               │ └─────────────────────┘ │
                               └─────────────────────────┘
                                             │
                                             ▼
                               ┌─────────────────────────┐
                               │ TransferResult          │
                               │ {                       │
                               │   signature: "...",     │
                               │   provider: "privacy..",│
                               │   fee: 0.006,           │
                               │   privacyLevel: "..."   │
                               │ }                       │
                               └─────────────────────────┘
```

---

## Token Support Matrix

| Token | ShadowWire | Arcium | Privacy Cash | Noir |
|-------|------------|--------|--------------|------|
| SOL   | ✓ | ✓ | ✓ | ✓ |
| USDC  | ✓ | ✓ | ✓ | ✓ |
| USDT  | ✓ | ✓ | ✓ | - |
| BONK  | ✓ | ✓ | - | - |
| RADR  | ✓ | - | - | - |
| ORE   | ✓ | - | ✓ | - |
| ZEC   | - | - | ✓ | - |

---

## Error Handling

**Error Hierarchy:**
```
PrivacyKitError (base)
├── ProviderNotAvailableError
├── UnsupportedTokenError
├── UnsupportedPrivacyLevelError
├── InsufficientBalanceError
├── AmountBelowMinimumError
├── TransactionError
├── ProofGenerationError
├── ProofVerificationError
└── WalletNotConnectedError
```

**Usage:**
```typescript
try {
  await kit.transfer({ ... });
} catch (error) {
  if (error instanceof InsufficientBalanceError) {
    console.log(`Need ${error.required} but have ${error.available}`);
  }
}
```

---

## Configuration

```typescript
interface PrivacyKitConfig {
  network: 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet';
  rpcUrl?: string;
  providers?: PrivacyProvider[];
  wallet?: WalletAdapter | Keypair;
  debug?: boolean;
  production?: boolean;  // Use official SDKs
  shadowWireApiKey?: string;
  rpcHeaders?: Record<string, string>;
}
```

**Example:**
```typescript
const kit = new PrivacyKit({
  network: 'mainnet-beta',
  wallet: keypair,
  production: true,
  debug: true,
  providers: [
    PrivacyProvider.PRIVACY_CASH,
    PrivacyProvider.SHADOWWIRE,
    PrivacyProvider.ARCIUM,
    PrivacyProvider.NOIR,
  ],
});
```

---

## Security Considerations

1. **Key Management:** Never expose private keys; use WalletAdapter when possible
2. **Proof Generation:** ZK proofs are generated client-side; never sent to servers
3. **Relayer Trust:** Privacy Cash and ShadowWire use relayers for tx submission
4. **Minimum Amounts:** Each provider has minimums to maintain anonymity sets
5. **Compliance:** Privacy Cash includes proof-of-innocence features

---

## Performance

| Operation | Provider | Typical Latency | Fee |
|-----------|----------|-----------------|-----|
| Deposit | Privacy Cash | 2-5s | 0% |
| Withdraw | Privacy Cash | 10-15s | 0.35% |
| Transfer | ShadowWire | 2-6s | 0.3-1% |
| Shield | Arcium | 5-10s | 0.2% |
| ZK Proof | Noir | 2-10s | Gas only |

---

## Testing

```bash
# Unit tests
bun test

# Integration tests (requires funded wallet)
bun run scripts/comprehensive-integration-test.ts

# Individual provider tests
bun run scripts/test-private-transfer.ts
```

---

## Version

**Current:** 0.1.0
**License:** MIT
