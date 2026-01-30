/**
 * Arcium MPC Types
 *
 * Type definitions for Arcium's Multi-Party Computation network
 * Based on @arcium-hq/client SDK and Arcium protocol specifications
 */
import type { PublicKey, TransactionSignature } from '@solana/web3.js';

/**
 * Arcium network cluster configuration
 */
export type ArciumCluster = 'devnet' | 'mainnet-beta' | 'testnet' | 'localnet';

/**
 * Arcium program addresses
 * The ARCIUM_ADDR constant from @arcium-hq/client represents the main program ID
 */
export interface ArciumProgramAddresses {
  /** Main Arcium program ID (from IDL) */
  arcium: PublicKey;
  /** MXE (Multi-party eXecution Environment) registry */
  mxeRegistry: PublicKey;
  /** Computation mempool */
  mempool: PublicKey;
  /** Fee pool for node rewards */
  feePool: PublicKey;
}

/**
 * Cluster configuration with recommended offsets for devnet
 * Based on Arcium deployment documentation
 */
export interface ClusterConfig {
  /** Cluster offset for PDA derivation */
  offset: number;
  /** RPC endpoint URL */
  rpcUrl: string;
  /** WebSocket endpoint for subscriptions */
  wsUrl?: string;
  /** Commitment level */
  commitment: 'processed' | 'confirmed' | 'finalized';
}

/**
 * Default cluster offsets for Arcium devnet
 * From: https://docs.arcium.com/developers/deployment
 */
export const CLUSTER_OFFSETS = {
  /** Legacy cluster (v0.5.4) */
  DEVNET_V054: 123,
  /** Recommended cluster (v0.6.3+) */
  DEVNET_V063: 456,
  /** Production mainnet - to be announced */
  MAINNET: 0,
} as const;

/**
 * MXE (Multi-party eXecution Environment) account data
 */
export interface MXEAccount {
  /** MXE public key for encryption */
  publicKey: Uint8Array;
  /** Associated cluster offset */
  clusterOffset: number;
  /** Recovery status */
  status: MXEStatus;
  /** Number of ARX nodes in cluster */
  nodeCount: number;
  /** X25519 public key for key exchange */
  x25519PublicKey: Uint8Array;
}

/**
 * MXE operational status
 */
export enum MXEStatus {
  Active = 'active',
  Recovery = 'recovery',
  Inactive = 'inactive',
}

/**
 * Computation definition account
 * Stores the compiled MPC bytecode for confidential instructions
 */
export interface ComputationDefinition {
  /** Circuit hash (SHA-256) */
  circuitHash: Uint8Array;
  /** Computation definition offset */
  offset: number;
  /** Owner program */
  owner: PublicKey;
  /** Finalized status */
  finalized: boolean;
}

/**
 * Computation account for pending MPC computations
 */
export interface ComputationAccount {
  /** Unique computation ID */
  id: Uint8Array;
  /** Computation definition offset */
  compDefOffset: number;
  /** Priority fee in lamports */
  priorityFee: bigint;
  /** Encrypted inputs */
  encryptedInputs: Uint8Array;
  /** Callback account address */
  callbackAccount?: PublicKey;
  /** Computation status */
  status: ComputationStatus;
}

/**
 * Computation lifecycle status
 */
export enum ComputationStatus {
  /** Queued in mempool */
  Pending = 'pending',
  /** Being executed by ARX nodes */
  Executing = 'executing',
  /** Completed successfully */
  Finalized = 'finalized',
  /** Failed execution */
  Failed = 'failed',
}

/**
 * Computation result from callback
 */
export interface ComputationResult<T = Uint8Array> {
  /** Computation ID */
  id: Uint8Array;
  /** Decrypted output data */
  output: T;
  /** Transaction signature */
  signature: TransactionSignature;
  /** Block timestamp */
  blockTime?: number;
}

/**
 * Encrypted value wrapper
 * Matches Arcium's Enc<Owner, Data> type pattern
 */
export interface EncryptedValue<T = unknown> {
  /** Ciphertext bytes */
  ciphertext: Uint8Array;
  /** Encryption nonce */
  nonce: Uint8Array;
  /** Original type hint for decryption */
  typeHint?: string;
}

/**
 * Encryption owner type
 * Determines who can decrypt the data
 */
export enum EncryptionOwner {
  /** Shared between client and MXE */
  Shared = 'shared',
  /** Only MXE can decrypt */
  Mxe = 'mxe',
  /** Client-side only */
  Client = 'client',
}

/**
 * X25519 key pair for ECDH
 */
export interface X25519KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * Rescue cipher parameters
 * Based on Arcium's RescueCipher implementation
 */
export interface RescueCipherParams {
  /** Block size (m=5 for Arcium) */
  blockSize: number;
  /** Number of rounds */
  rounds: number;
  /** Field type - base or scalar */
  field: 'base' | 'scalar';
}

/**
 * Default Rescue cipher configuration for Arcium
 */
export const RESCUE_CIPHER_CONFIG: RescueCipherParams = {
  blockSize: 5,
  rounds: 10,
  field: 'base',
};

/**
 * C-SPL (Confidential SPL) token configuration
 */
export interface CSPLTokenConfig {
  /** Original SPL token mint */
  mint: PublicKey;
  /** Token decimals */
  decimals: number;
  /** Confidential transfer adapter enabled */
  confidentialTransferEnabled: boolean;
  /** Associated auditor (optional) */
  auditorPublicKey?: PublicKey;
}

/**
 * Confidential token account data
 */
export interface ConfidentialTokenAccount {
  /** Account owner */
  owner: PublicKey;
  /** Token mint */
  mint: PublicKey;
  /** Encrypted balance */
  encryptedBalance: EncryptedValue<bigint>;
  /** Encrypted pending balance */
  encryptedPendingBalance?: EncryptedValue<bigint>;
  /** Account state */
  state: ConfidentialAccountState;
}

/**
 * Confidential account state
 */
export enum ConfidentialAccountState {
  Uninitialized = 'uninitialized',
  Initialized = 'initialized',
  Frozen = 'frozen',
}

/**
 * Shield (wrap) request for converting tokens to C-SPL
 */
export interface ShieldRequest {
  /** Source token account */
  sourceAccount: PublicKey;
  /** Amount to shield (in token units) */
  amount: number;
  /** Token mint */
  mint: PublicKey;
}

/**
 * Unshield (unwrap) request for converting C-SPL back to SPL
 */
export interface UnshieldRequest {
  /** Destination token account */
  destinationAccount: PublicKey;
  /** Amount to unshield (in token units) */
  amount: number;
  /** Token mint */
  mint: PublicKey;
}

/**
 * Confidential transfer request
 */
export interface ConfidentialTransferRequest {
  /** Sender confidential account */
  sender: PublicKey;
  /** Recipient confidential account */
  recipient: PublicKey;
  /** Encrypted amount (hidden from network) */
  encryptedAmount: EncryptedValue<bigint>;
  /** Token mint */
  mint: PublicKey;
}

/**
 * Mempool account for pending computations
 * TTL: 180 slots (~1.5 minutes)
 */
export interface MempoolAccount {
  /** Pending computation references */
  computations: ComputationReference[];
  /** Current mempool size */
  size: number;
  /** Maximum capacity */
  capacity: number;
}

/**
 * Reference to a computation in mempool
 */
export interface ComputationReference {
  /** Computation account offset */
  offset: number;
  /** Priority fee for ordering */
  priorityFee: bigint;
  /** Timestamp of queue entry */
  queuedAt: number;
}

/**
 * Executing pool account for active computations
 */
export interface ExecutingPoolAccount {
  /** Currently executing computations */
  executing: ComputationReference[];
  /** Locked accounts */
  lockedAccounts: PublicKey[];
}

/**
 * Priority fee statistics for mempool
 */
export interface MempoolPriorityFeeStats {
  /** Minimum fee in mempool */
  min: bigint;
  /** Maximum fee in mempool */
  max: bigint;
  /** Average fee */
  average: bigint;
  /** Median fee (recommended) */
  median: bigint;
  /** Current mempool size */
  mempoolSize: number;
}

/**
 * ARX node information
 */
export interface ARXNodeInfo {
  /** Node offset */
  offset: number;
  /** Node authority public key */
  authority: PublicKey;
  /** Identity public key (Ed25519) */
  identity: Uint8Array;
  /** BLS public key for threshold signatures */
  blsPublicKey: Uint8Array;
  /** X25519 public key for communication */
  x25519PublicKey: Uint8Array;
  /** Node status */
  active: boolean;
  /** Epoch range */
  epochRange: [number, number];
}

/**
 * Cluster account information
 */
export interface ClusterAccount {
  /** Cluster offset */
  offset: number;
  /** Associated MXE */
  mxe: PublicKey;
  /** Node count */
  nodeCount: number;
  /** Recovery set size */
  recoverySetSize: number;
  /** Active status */
  active: boolean;
}

/**
 * Callback configuration for computation results
 */
export interface CallbackConfig {
  /** Callback program ID */
  programId: PublicKey;
  /** Callback instruction discriminator */
  discriminator: Uint8Array;
  /** Additional accounts for callback */
  remainingAccounts: PublicKey[];
}

/**
 * Computation queue parameters
 */
export interface QueueComputationParams {
  /** Computation definition offset */
  compDefOffset: number;
  /** Encrypted inputs */
  encryptedInputs: Uint8Array;
  /** Priority fee in lamports */
  priorityFee: bigint;
  /** Callback configuration */
  callback?: CallbackConfig;
}

/**
 * Error types from Arcium computations
 */
export enum ArciumErrorType {
  InvalidInput = 'invalid_input',
  EncryptionFailed = 'encryption_failed',
  DecryptionFailed = 'decryption_failed',
  ComputationFailed = 'computation_failed',
  NetworkError = 'network_error',
  TimeoutError = 'timeout_error',
  InsufficientFunds = 'insufficient_funds',
  ClusterNotSet = 'cluster_not_set',
  MXENotFound = 'mxe_not_found',
}

/**
 * Arcium SDK error
 */
export class ArciumError extends Error {
  constructor(
    public readonly type: ArciumErrorType,
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ArciumError';
  }
}

/**
 * Curve25519 field constants
 * From @arcium-hq/client
 */
export const CURVE25519_CONSTANTS = {
  /** Scalar field modulus: 2^252 + 27742317777372353535851937790883648493 */
  SCALAR_FIELD_MODULUS: BigInt(
    '7237005577332262213973186563042994240857116359379907606001950938285454250989'
  ),
  /** Base field modulus: 2^255 - 19 */
  BASE_FIELD_MODULUS: BigInt(
    '57896044618658097711785492504343953926634992332820282019728792003956564819949'
  ),
} as const;

/**
 * Arcium client configuration
 */
export interface ArciumClientConfig {
  /** Solana cluster */
  cluster: ArciumCluster;
  /** Cluster offset for PDA derivation */
  clusterOffset: number;
  /** RPC endpoint URL */
  rpcUrl: string;
  /** WebSocket endpoint */
  wsUrl?: string;
  /** Commitment level */
  commitment?: 'processed' | 'confirmed' | 'finalized';
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Type alias for field elements
 */
export type FieldElement = bigint;

/**
 * Packer interface for type-safe serialization
 */
export interface Packer<T> {
  pack(value: T): Uint8Array;
  unpack(data: Uint8Array): T;
}

/**
 * Field information for packer generation
 */
export interface FieldInfo {
  name: string;
  type: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'bool' | 'bytes' | 'pubkey';
  size?: number;
  encrypted?: boolean;
}
