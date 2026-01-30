/**
 * Privacy Cash Type Definitions
 *
 * Core types for the Privacy Cash ZK privacy pool implementation.
 */

/**
 * Poseidon hash function type
 */
export type PoseidonFn = (inputs: bigint[]) => bigint;

/**
 * Poseidon module interface (from circomlibjs)
 */
export interface Poseidon {
  (inputs: any[]): any;
  F: {
    e: (v: bigint | string | number) => any;
    toString: (v: any) => string;
    toObject: (v: any) => bigint;
  };
}

/**
 * Deposit note containing all information needed for withdrawal
 */
export interface DepositNote {
  /** Commitment hash (Poseidon(secret, nullifier)) */
  commitment: bigint;
  /** Nullifier hash for preventing double-spending */
  nullifierHash: bigint;
  /** Secret value (kept private) */
  secret: bigint;
  /** Nullifier value (kept private) */
  nullifier: bigint;
  /** Deposit amount in token units */
  amount: number;
  /** Token symbol */
  token: string;
  /** Deposit timestamp */
  timestamp: number;
  /** Merkle tree leaf index (once included) */
  leafIndex?: number;
}

/**
 * Encoded deposit note for storage/transmission
 */
export interface EncodedNote {
  /** Version for forward compatibility */
  version: number;
  /** Commitment hex */
  commitment: string;
  /** Nullifier hash hex */
  nullifierHash: string;
  /** Secret hex (encrypted in production) */
  secret: string;
  /** Nullifier hex */
  nullifier: string;
  /** Amount */
  amount: number;
  /** Token symbol */
  token: string;
  /** Timestamp */
  timestamp: number;
  /** Leaf index */
  leafIndex?: number;
}

/**
 * Merkle tree proof for withdrawal verification
 */
export interface MerkleProof {
  /** Current Merkle root */
  root: bigint;
  /** Sibling hashes along the path */
  pathElements: bigint[];
  /** Path indices (0 = left, 1 = right) */
  pathIndices: number[];
  /** Leaf index in the tree */
  leafIndex: number;
}

/**
 * ZK-SNARK proof structure (Groth16)
 */
export interface Groth16Proof {
  /** Point A (G1) */
  pi_a: [string, string, string];
  /** Point B (G2) */
  pi_b: [[string, string], [string, string], [string, string]];
  /** Point C (G1) */
  pi_c: [string, string, string];
  /** Protocol type */
  protocol: 'groth16';
  /** Curve type */
  curve: 'bn128';
}

/**
 * Public signals for withdrawal proof
 */
export interface WithdrawalPublicSignals {
  /** Merkle root */
  root: string;
  /** Nullifier hash (to prevent double-spending) */
  nullifierHash: string;
  /** Recipient address (as field element) */
  recipient: string;
  /** Relayer address (optional) */
  relayer: string;
  /** Fee amount */
  fee: string;
  /** Refund amount */
  refund: string;
}

/**
 * Complete withdrawal proof package
 */
export interface WithdrawalProof {
  /** The ZK proof */
  proof: Groth16Proof;
  /** Public signals */
  publicSignals: WithdrawalPublicSignals;
}

/**
 * Circuit inputs for proof generation
 */
export interface WithdrawalCircuitInputs {
  /** Private inputs */
  private: {
    /** Secret value */
    secret: bigint;
    /** Nullifier value */
    nullifier: bigint;
    /** Merkle path elements */
    pathElements: bigint[];
    /** Merkle path indices */
    pathIndices: number[];
  };
  /** Public inputs */
  public: {
    /** Merkle root */
    root: bigint;
    /** Nullifier hash */
    nullifierHash: bigint;
    /** Recipient address */
    recipient: bigint;
    /** Relayer address */
    relayer: bigint;
    /** Fee */
    fee: bigint;
    /** Refund */
    refund: bigint;
  };
}

/**
 * Verification key structure
 */
export interface VerificationKey {
  protocol: string;
  curve: string;
  nPublic: number;
  vk_alpha_1: string[];
  vk_beta_2: string[][];
  vk_gamma_2: string[][];
  vk_delta_2: string[][];
  vk_alphabeta_12: string[][][];
  IC: string[][];
}

/**
 * Pool configuration for a token
 */
export interface PoolConfig {
  /** Token mint address */
  mint: string;
  /** Token decimals */
  decimals: number;
  /** Minimum deposit amount */
  minDeposit: number;
  /** Maximum deposit amount */
  maxDeposit: number;
  /** Current anonymity set size */
  anonymitySet: number;
  /** Pool PDA address */
  poolAddress?: string;
  /** Merkle tree depth */
  treeDepth: number;
}

/**
 * Pool state from on-chain
 */
export interface PoolState {
  /** Current Merkle root */
  currentRoot: bigint;
  /** Historical roots for verification */
  roots: bigint[];
  /** Next available leaf index */
  nextLeafIndex: number;
  /** Total deposits count */
  totalDeposits: number;
  /** Total withdrawals count */
  totalWithdrawals: number;
}

/**
 * Circuit artifact paths
 */
export interface CircuitArtifacts {
  /** Path to wasm file */
  wasmPath: string;
  /** Path to zkey file */
  zkeyPath: string;
  /** Path to verification key JSON */
  vkeyPath: string;
}

/**
 * Prover configuration
 */
export interface ProverConfig {
  /** Circuit artifacts */
  artifacts: CircuitArtifacts;
  /** Use WebWorker for proving (browser) */
  useWorker?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Relayer information
 */
export interface RelayerInfo {
  /** Relayer address */
  address: string;
  /** Fee percentage (basis points) */
  feePercent: number;
  /** Supported tokens */
  supportedTokens: string[];
  /** API endpoint */
  endpoint: string;
}

/**
 * Event emitted on deposit
 */
export interface DepositEvent {
  /** Commitment hash */
  commitment: bigint;
  /** Leaf index */
  leafIndex: number;
  /** Block time */
  timestamp: number;
  /** Transaction signature */
  signature: string;
}

/**
 * Event emitted on withdrawal
 */
export interface WithdrawalEvent {
  /** Nullifier hash */
  nullifierHash: bigint;
  /** Recipient address */
  recipient: string;
  /** Relayer address */
  relayer: string;
  /** Fee paid */
  fee: number;
  /** Block time */
  timestamp: number;
  /** Transaction signature */
  signature: string;
}
