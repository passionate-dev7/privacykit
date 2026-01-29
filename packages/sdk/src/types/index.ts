import type { PublicKey, TransactionSignature, Connection } from '@solana/web3.js';

/**
 * Privacy levels supported by PrivacyKit
 * Each level maps to different underlying privacy technologies
 */
export enum PrivacyLevel {
  /** Amount is hidden using Bulletproofs (ShadowWire) */
  AMOUNT_HIDDEN = 'amount-hidden',
  /** Sender identity is hidden */
  SENDER_HIDDEN = 'sender-hidden',
  /** Full encryption of all transaction data (Arcium MPC) */
  FULL_ENCRYPTED = 'full-encrypted',
  /** Zero-knowledge proof based privacy (Noir) */
  ZK_PROVEN = 'zk-proven',
  /** Compliant privacy with proof of innocence (Privacy Cash) */
  COMPLIANT_POOL = 'compliant-pool',
  /** No privacy - regular Solana transaction */
  NONE = 'none',
}

/**
 * Supported privacy providers
 */
export enum PrivacyProvider {
  SHADOWWIRE = 'shadowwire',
  ARCIUM = 'arcium',
  NOIR = 'noir',
  PRIVACY_CASH = 'privacycash',
  INCO = 'inco',
}

/**
 * Supported tokens across providers
 */
export interface SupportedToken {
  symbol: string;
  mint: string;
  decimals: number;
  providers: PrivacyProvider[];
}

/**
 * Network configuration
 */
export type NetworkCluster = 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet';

/**
 * Wallet interface for signing transactions
 */
export interface WalletAdapter {
  publicKey: PublicKey;
  signTransaction: <T extends { serialize(): Uint8Array }>(tx: T) => Promise<T>;
  signAllTransactions: <T extends { serialize(): Uint8Array }>(txs: T[]) => Promise<T[]>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Configuration for PrivacyKit instance
 */
export interface PrivacyKitConfig {
  /** Solana network cluster */
  network: NetworkCluster;
  /** RPC endpoint URL (optional, uses default for network) */
  rpcUrl?: string;
  /** Enabled privacy providers */
  providers?: PrivacyProvider[];
  /** Wallet adapter for signing */
  wallet?: WalletAdapter;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom RPC headers (for authenticated endpoints) */
  rpcHeaders?: Record<string, string>;
}

/**
 * Transfer request parameters
 */
export interface TransferRequest {
  /** Recipient address (public key or stealth address) */
  recipient: string | PublicKey;
  /** Amount to transfer (in token units, not lamports) */
  amount: number;
  /** Token symbol (e.g., 'SOL', 'USDC') */
  token: string;
  /** Desired privacy level */
  privacy: PrivacyLevel;
  /** Force specific provider (optional, auto-selected if not specified) */
  provider?: PrivacyProvider;
  /** Additional options */
  options?: TransferOptions;
}

/**
 * Additional transfer options
 */
export interface TransferOptions {
  /** Maximum fee willing to pay (in SOL) */
  maxFee?: number;
  /** Memo/note for the transfer */
  memo?: string;
  /** Priority fee for faster confirmation */
  priorityFee?: number;
  /** Custom proof data (for ZK transfers) */
  customProof?: Uint8Array;
}

/**
 * Transfer result
 */
export interface TransferResult {
  /** Transaction signature */
  signature: TransactionSignature;
  /** Provider used for the transfer */
  provider: PrivacyProvider;
  /** Privacy level achieved */
  privacyLevel: PrivacyLevel;
  /** Fee paid (in SOL) */
  fee: number;
  /** Block time of confirmation */
  blockTime?: number;
  /** Anonymity set size (if applicable) */
  anonymitySet?: number;
}

/**
 * Deposit request (into privacy pool)
 */
export interface DepositRequest {
  /** Amount to deposit */
  amount: number;
  /** Token symbol */
  token: string;
  /** Target provider */
  provider?: PrivacyProvider;
}

/**
 * Deposit result
 */
export interface DepositResult {
  signature: TransactionSignature;
  provider: PrivacyProvider;
  /** Commitment/note for future withdrawal */
  commitment?: string;
  fee: number;
}

/**
 * Withdrawal request (from privacy pool)
 */
export interface WithdrawRequest {
  /** Amount to withdraw */
  amount: number;
  /** Token symbol */
  token: string;
  /** Recipient address */
  recipient: string | PublicKey;
  /** Provider to withdraw from */
  provider?: PrivacyProvider;
  /** Commitment/note from deposit */
  commitment?: string;
}

/**
 * Withdrawal result
 */
export interface WithdrawResult {
  signature: TransactionSignature;
  provider: PrivacyProvider;
  fee: number;
}

/**
 * ZK Proof request
 */
export interface ProveRequest {
  /** Circuit name or identifier */
  circuit: string;
  /** Public inputs for the circuit */
  publicInputs: Record<string, unknown>;
  /** Private inputs (witnesses) */
  privateInputs: Record<string, unknown>;
  /** Provider to use for proving */
  provider?: PrivacyProvider;
}

/**
 * ZK Proof result
 */
export interface ProveResult {
  /** Serialized proof */
  proof: Uint8Array;
  /** Public inputs used */
  publicInputs: Record<string, unknown>;
  /** Verification key (if needed for on-chain verification) */
  verificationKey?: Uint8Array;
  /** Provider used */
  provider: PrivacyProvider;
}

/**
 * Balance query result
 */
export interface BalanceResult {
  /** Public (visible) balance */
  public: number;
  /** Shielded (private) balance per provider */
  shielded: Partial<Record<PrivacyProvider, number>>;
  /** Total balance */
  total: number;
  /** Token symbol */
  token: string;
}

/**
 * Cost estimation request
 */
export interface EstimateRequest {
  /** Type of operation */
  operation: 'transfer' | 'deposit' | 'withdraw' | 'prove';
  /** Amount (if applicable) */
  amount?: number;
  /** Token */
  token?: string;
  /** Privacy level */
  privacy?: PrivacyLevel;
  /** Specific provider */
  provider?: PrivacyProvider;
}

/**
 * Cost estimation result
 */
export interface EstimateResult {
  /** Estimated fee in SOL */
  fee: number;
  /** Estimated fee in token (if applicable) */
  tokenFee?: number;
  /** Provider that would be used */
  provider: PrivacyProvider;
  /** Estimated latency in milliseconds */
  latencyMs: number;
  /** Estimated anonymity set size */
  anonymitySet?: number;
  /** Warnings or considerations */
  warnings: string[];
}

/**
 * Provider adapter interface
 * All privacy providers must implement this interface
 */
export interface PrivacyProviderAdapter {
  /** Provider identifier */
  readonly provider: PrivacyProvider;
  /** Human-readable name */
  readonly name: string;
  /** Supported privacy levels */
  readonly supportedLevels: PrivacyLevel[];
  /** Supported tokens */
  readonly supportedTokens: string[];

  /** Initialize the adapter */
  initialize(connection: Connection, wallet?: WalletAdapter): Promise<void>;

  /** Check if adapter is ready */
  isReady(): boolean;

  /** Get balance for a token */
  getBalance(token: string, address?: string): Promise<number>;

  /** Execute a private transfer */
  transfer(request: TransferRequest): Promise<TransferResult>;

  /** Deposit into privacy pool */
  deposit(request: DepositRequest): Promise<DepositResult>;

  /** Withdraw from privacy pool */
  withdraw(request: WithdrawRequest): Promise<WithdrawResult>;

  /** Estimate cost for an operation */
  estimate(request: EstimateRequest): Promise<EstimateResult>;

  /** Check if a specific operation is supported */
  supports(operation: string, token: string, privacy: PrivacyLevel): boolean;
}

/**
 * Pipeline step definition
 */
export interface PipelineStep {
  type: 'deposit' | 'transfer' | 'withdraw' | 'prove' | 'wait';
  provider?: PrivacyProvider;
  params: Record<string, unknown>;
}

/**
 * Pipeline execution result
 */
export interface PipelineResult {
  steps: Array<{
    type: string;
    result: TransferResult | DepositResult | WithdrawResult | ProveResult;
    provider: PrivacyProvider;
  }>;
  totalFee: number;
  success: boolean;
}

/**
 * Event types emitted by PrivacyKit
 */
export type PrivacyKitEvent =
  | { type: 'initialized'; providers: PrivacyProvider[] }
  | { type: 'transfer:start'; request: TransferRequest }
  | { type: 'transfer:complete'; result: TransferResult }
  | { type: 'transfer:error'; error: Error }
  | { type: 'deposit:start'; request: DepositRequest }
  | { type: 'deposit:complete'; result: DepositResult }
  | { type: 'withdraw:start'; request: WithdrawRequest }
  | { type: 'withdraw:complete'; result: WithdrawResult }
  | { type: 'prove:start'; request: ProveRequest }
  | { type: 'prove:complete'; result: ProveResult };
