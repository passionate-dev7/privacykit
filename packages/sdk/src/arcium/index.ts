/**
 * Arcium MPC Module
 *
 * Production-ready integration with Arcium's Multi-Party Computation network
 * for confidential computing on Solana.
 *
 * @module arcium
 */

// Types
export * from './types';

// Encryption
export {
  X25519,
  RescueCipher,
  CSPLRescueCipher,
  AesCipher,
  ArciumEncryption,
  serializeLE,
  deserializeLE,
  sha256,
  positiveModulo,
} from './encryption';

// Client
export {
  ArciumClient,
  createDevnetClient,
  createMainnetClient,
  compDefOffset,
} from './client';

// C-SPL Tokens
export {
  CSPLTokenClient,
  CSPL_PROGRAM_IDS,
  CSPL_TOKEN_CONFIGS,
  createCSPLClient,
} from './cspl';
