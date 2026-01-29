/**
 * PrivacyKit SDK
 *
 * A unified privacy SDK for Solana that provides access to multiple
 * privacy-preserving technologies through a single, easy-to-use interface.
 *
 * @packageDocumentation
 */

// Main SDK class
export {
  PrivacyKit,
  PipelineBuilder,
  type PrivacyKitEvents,
} from './core/privacykit';

// Re-export default
export { default } from './core/privacykit';

// Router
export { PrivacyRouter, type SelectionCriteria, type SelectionResult } from './core/router';

// Types
export {
  // Enums
  PrivacyLevel,
  PrivacyProvider,

  // Config types
  type PrivacyKitConfig,
  type NetworkCluster,
  type WalletAdapter,

  // Request/Response types
  type TransferRequest,
  type TransferResult,
  type TransferOptions,
  type DepositRequest,
  type DepositResult,
  type WithdrawRequest,
  type WithdrawResult,
  type ProveRequest,
  type ProveResult,
  type BalanceResult,
  type EstimateRequest,
  type EstimateResult,

  // Pipeline types
  type PipelineStep,
  type PipelineResult,

  // Token types
  type SupportedToken,

  // Adapter interface
  type PrivacyProviderAdapter,
} from './types';

// Token utilities
export {
  SUPPORTED_TOKENS,
  PROVIDER_FEES,
  MINIMUM_AMOUNTS,
  getTokenInfo,
  getProviderFee,
  getMinimumAmount,
  isTokenSupported,
  getProvidersForToken,
  toSmallestUnit,
  fromSmallestUnit,
} from './types/tokens';

// Adapters
export {
  BaseAdapter,
  ShadowWireAdapter,
  ArciumAdapter,
  NoirAdapter,
  PrivacyCashAdapter,
  createAdapter,
  getAllAdapters,
} from './adapters';

// Utils
export {
  // Logger
  Logger,
  LogLevel,
  defaultLogger,
  createDebugLogger,

  // Errors
  PrivacyKitError,
  ProviderNotAvailableError,
  UnsupportedTokenError,
  UnsupportedPrivacyLevelError,
  InsufficientBalanceError,
  RecipientNotFoundError,
  TransactionError,
  WalletNotConnectedError,
  ProofGenerationError,
  ProofVerificationError,
  AmountBelowMinimumError,
  NetworkError,
  isPrivacyKitError,
  wrapError,

  // Constants
  DEFAULT_RPC_ENDPOINTS,
  HELIUS_RPC_ENDPOINTS,
  PROVIDER_ENDPOINTS,
  NATIVE_SOL_MINT,
  COMPUTE_UNITS,
  DEFAULT_CONFIRMATION,
  TIMEOUTS,
  VERSION,

  // Helper functions
  isValidPublicKey,
  toPublicKey,
  sleep,
  retry,
  randomBytes,
  bytesToBase58,
  base58ToBytes,
  bytesToHex,
  hexToBytes,
  formatSol,
  formatTokenAmount,
  truncateAddress,
  isBrowser,
  isWasmSupported,
} from './utils';

// Noir ZK Proving System
export {
  // Compiler
  NoirCompiler,
  CIRCUIT_DEFINITIONS,
  defaultCompiler,
  createCompiler,
  formatInputs,

  // Prover
  NoirProver,
  getDefaultProver,
  createProver,
  generatePrivateTransferProof,
  generateBalanceThresholdProof,
  generateOwnershipProof,

  // Verifier
  NoirVerifier,
  SUNSPOT_VERIFIER_PROGRAM_ID,
  getDefaultVerifier,
  createVerifier,
  verifyProofQuick,
} from './noir';

export type {
  CircuitMetadata,
  CompiledCircuitArtifact,
  CompileOptions,
  ProofResult,
  ProverConfig,
  VerificationResult,
  OnChainVerifierConfig,
} from './noir';

// ShadowPay/ShadowWire API Client
export {
  // API Client
  ShadowPayApiClient,
  ShadowPayApiErrorClass,
  createShadowPayClient,
  DEFAULT_CIRCUIT_URLS,
  SHADOWPAY_PROGRAM_ID,
  SHADOWPAY_TOKENS,

  // Authentication
  SHADOWPAY_API_URL,
  API_VERSION,
  createAuthHeaders,
  createSignedMessage,
  createTransferPayload,
  verifyAccessToken,
  createPaymentRequirementHeader,
  parsePaymentRequirementHeader,
  verifyWebhookSignature,
  errorCodeToStatus,
  isRateLimited,
  getRetryAfter,

  // Types
  ShadowPayErrorCode,
  type ShadowPayToken,
  type TokenConfig,
  type PaymentRequirement,
  type PaymentVerification,
  type PaymentRequest,
  type PaymentResult,
  type WebhookEvent,
  type WebhookEventType,
  type PrivateTransferRequest,
  type PrivateTransferResponse,
  type DepositRequest as ShadowPayDepositRequest,
  type DepositResponse,
  type WithdrawalRequest,
  type WithdrawalResponse,
  type BalanceResponse,
  type ShadowPayClientConfig,
  type ShadowPayInitOptions,
  type CircuitUrls,
  type ElGamalKeypair,
  type EncryptedAmount,
  type ZKProof,
  type PaymentCommitment,
  type AuthHeaders,
} from './shadowwire';

// Arcium MPC Confidential Computing
export {
  // Client
  ArciumClient,
  createDevnetClient,
  createMainnetClient,
  compDefOffset,

  // C-SPL Tokens
  CSPLTokenClient,
  CSPL_PROGRAM_IDS,
  CSPL_TOKEN_CONFIGS,
  createCSPLClient,

  // Encryption
  X25519,
  RescueCipher,
  CSPLRescueCipher,
  AesCipher,
  ArciumEncryption,
  serializeLE,
  deserializeLE,
  sha256,
  positiveModulo,

  // Types
  type ArciumCluster,
  type ArciumProgramAddresses,
  type ClusterConfig,
  type MXEAccount,
  type ComputationDefinition,
  type ComputationAccount,
  type ComputationResult,
  type EncryptedValue,
  type CSPLTokenConfig,
  type ConfidentialTokenAccount,
  type ConfidentialTransferRequest,
  type ShieldRequest,
  type UnshieldRequest,
  type MempoolAccount,
  type ExecutingPoolAccount,
  type MempoolPriorityFeeStats,
  type ARXNodeInfo,
  type ClusterAccount,
  type CallbackConfig,
  type QueueComputationParams,
  type ArciumClientConfig,
  type X25519KeyPair,
  type RescueCipherParams,
  type FieldInfo,
  type Packer,

  // Enums
  MXEStatus,
  ComputationStatus,
  ConfidentialAccountState,
  EncryptionOwner,
  ArciumErrorType,

  // Constants
  CLUSTER_OFFSETS,
  RESCUE_CIPHER_CONFIG,
  CURVE25519_CONSTANTS,

  // Errors
  ArciumError,
} from './arcium';

// Privacy Cash ZK Privacy Pool
export {
  // Poseidon Hash
  initPoseidon,
  poseidonHash,
  poseidonHashSingle,
  poseidonHashMany,
  bytesToField,
  fieldToBytes,
  fieldToHex,
  hexToField,
  randomFieldElement,
  isValidFieldElement,
  SNARK_FIELD_SIZE,
  type PoseidonFn,

  // Merkle Tree
  IncrementalMerkleTree,
  createMerkleTree,
  verifyMerkleProof,
  computeRootFromProof,
  batchInsert,
  initZeroValues,
  getZeroValue,
  DEFAULT_TREE_DEPTH,

  // Commitment
  generateDepositNote,
  regenerateCommitment,
  verifyNote,
  encodeNote,
  decodeNote,
  createNoteFromParams,
  generateDeterministicNote,
  splitIntoNotes,
  computeStealthCommitment,

  // ZK Prover
  initProver,
  isRealProvingAvailable,
  generateWithdrawalProof,
  verifyWithdrawalProof,
  serializeProof,
  deserializeProof,
  estimateProofTime,
  getProverStatus,

  // Types
  type DepositNote as PrivacyCashDepositNote,
  type EncodedNote,
  type MerkleProof,
  type Groth16Proof,
  type WithdrawalPublicSignals,
  type WithdrawalProof,
  type WithdrawalCircuitInputs,
  type VerificationKey as PrivacyCashVerificationKey,
  type PoolConfig as PrivacyCashPoolConfig,
  type PoolState,
  type CircuitArtifacts,
  type ProverConfig as PrivacyCashProverConfig,
  type RelayerInfo,
  type DepositEvent,
  type WithdrawalEvent,
} from './privacycash';
