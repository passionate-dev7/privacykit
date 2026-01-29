import { type NetworkCluster } from '../types';

/**
 * Default RPC endpoints for each network
 */
export const DEFAULT_RPC_ENDPOINTS: Record<NetworkCluster, string> = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
  localnet: 'http://localhost:8899',
};

/**
 * Helius RPC endpoints (preferred for production)
 * Users should set HELIUS_API_KEY environment variable
 */
export const HELIUS_RPC_ENDPOINTS: Record<NetworkCluster, string> = {
  'mainnet-beta': 'https://mainnet.helius-rpc.com/?api-key=',
  devnet: 'https://devnet.helius-rpc.com/?api-key=',
  testnet: 'https://api.testnet.solana.com', // Helius doesn't support testnet
  localnet: 'http://localhost:8899',
};

/**
 * Provider-specific API endpoints
 */
export const PROVIDER_ENDPOINTS = {
  shadowwire: {
    api: 'https://api.radr.fun',
    docs: 'https://registry.scalar.com/@radr/apis/shadowpay-api',
  },
  arcium: {
    api: 'https://api.arcium.com',
    docs: 'https://docs.arcium.com',
  },
  privacycash: {
    api: 'https://api.privacycash.org',
    docs: 'https://privacycash.mintlify.app',
  },
  inco: {
    api: 'https://api.inco.org',
    docs: 'https://docs.inco.org/svm',
  },
};

/**
 * Native SOL mint address (wrapped SOL)
 */
export const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Compute unit limits for different operations
 */
export const COMPUTE_UNITS = {
  SIMPLE_TRANSFER: 200_000,
  PRIVATE_TRANSFER: 400_000,
  ZK_VERIFY: 1_000_000,
  DEPOSIT: 300_000,
  WITHDRAW: 500_000,
};

/**
 * Default transaction confirmation options
 */
export const DEFAULT_CONFIRMATION = {
  commitment: 'confirmed' as const,
  maxRetries: 3,
  skipPreflight: false,
};

/**
 * Timeout values in milliseconds
 */
export const TIMEOUTS = {
  RPC_CALL: 30_000,
  TRANSACTION_CONFIRM: 60_000,
  PROOF_GENERATION: 120_000,
};

/**
 * Version info
 */
export const VERSION = {
  sdk: '0.1.0',
  protocol: '1',
};
