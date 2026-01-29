/**
 * Noir Module for PrivacyKit SDK
 *
 * This module provides real zero-knowledge proof generation and verification
 * using the Noir language and Barretenberg backend.
 *
 * @packageDocumentation
 */

// Compiler exports
export {
  NoirCompiler,
  CIRCUIT_DEFINITIONS,
  defaultCompiler,
  createCompiler,
  formatInputs,
} from './compiler';

export type {
  CircuitMetadata,
  CompiledCircuitArtifact,
  CompileOptions,
  CompiledCircuit,
  InputMap,
} from './compiler';

// Prover exports
export {
  NoirProver,
  getDefaultProver,
  createProver,
  generatePrivateTransferProof,
  generateBalanceThresholdProof,
  generateOwnershipProof,
} from './prover';

export type {
  ProofResult,
  ProverConfig,
} from './prover';

// Verifier exports
export {
  NoirVerifier,
  SUNSPOT_VERIFIER_PROGRAM_ID,
  getDefaultVerifier,
  createVerifier,
  verifyProofQuick,
} from './verifier';

export type {
  VerificationResult,
  OnChainVerifierConfig,
} from './verifier';
