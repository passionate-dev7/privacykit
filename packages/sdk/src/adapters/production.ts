/**
 * Production Adapters Export
 *
 * This module exports production-ready adapters that use official SDKs
 * for real network operations with zero mocks.
 *
 * @module adapters/production
 */

// Export production adapters
export {
  PrivacyCashProductionAdapter,
  createPrivacyCashProductionAdapter,
} from './privacycash-production';
export {
  ShadowWireProductionAdapter,
  createShadowWireProductionAdapter,
} from './shadowwire-production';
export {
  ArciumProductionAdapter,
  createArciumProductionAdapter,
} from './arcium-production';

// Re-export types
export type { PrivacyProvider, PrivacyLevel, WalletAdapter } from '../types';

// Import for internal use
import { createPrivacyCashProductionAdapter } from './privacycash-production';
import { createShadowWireProductionAdapter } from './shadowwire-production';
import { createArciumProductionAdapter } from './arcium-production';

/**
 * Production adapter configuration
 */
export interface ProductionConfig {
  /** Use mainnet (true) or devnet (false) */
  mainnet?: boolean;
  /** Custom RPC URL */
  rpcUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** API key for ShadowWire */
  shadowWireApiKey?: string;
}

/**
 * Create all production adapters
 */
export function createAllProductionAdapters(config: ProductionConfig = {}) {
  return {
    privacyCash: createPrivacyCashProductionAdapter(),
    shadowWire: createShadowWireProductionAdapter(config.shadowWireApiKey, config.debug),
    arcium: createArciumProductionAdapter(),
  };
}

/**
 * Initialize production adapters with configuration
 */
export async function initializeProductionAdapters(
  config: ProductionConfig = {}
) {
  const adapters = createAllProductionAdapters(config);

  // Configuration can be applied here when needed

  return adapters;
}
