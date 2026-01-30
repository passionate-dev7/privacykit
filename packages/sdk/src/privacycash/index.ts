/**
 * Privacy Cash Module
 *
 * Production-ready ZK privacy pool implementation for Solana.
 * Provides Tornado Cash-style deposits and withdrawals with
 * Poseidon hashing and Groth16 proofs.
 *
 * @module privacycash
 */

// Core cryptographic primitives
export {
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
} from './poseidon';

// Merkle tree operations
export {
  IncrementalMerkleTree,
  createMerkleTree,
  verifyMerkleProof,
  computeRootFromProof,
  batchInsert,
  initZeroValues,
  getZeroValue,
  DEFAULT_TREE_DEPTH,
} from './merkle';

// Commitment generation
export {
  generateDepositNote,
  regenerateCommitment,
  verifyNote,
  encodeNote,
  decodeNote,
  createNoteFromParams,
  generateDeterministicNote,
  splitIntoNotes,
  computeStealthCommitment,
  type DepositNote,
  type EncodedNote,
} from './commitment';

// ZK proof generation
export {
  initProver,
  isRealProvingAvailable,
  generateWithdrawalProof,
  verifyWithdrawalProof,
  serializeProof,
  deserializeProof,
  estimateProofTime,
  getProverStatus,
} from './prover';

// Types
export type {
  Poseidon,
  MerkleProof,
  Groth16Proof,
  WithdrawalPublicSignals,
  WithdrawalProof,
  WithdrawalCircuitInputs,
  VerificationKey,
  PoolConfig,
  PoolState,
  CircuitArtifacts,
  ProverConfig,
  RelayerInfo,
  DepositEvent,
  WithdrawalEvent,
} from './types';
