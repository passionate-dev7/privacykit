// Base and mock adapters
export { BaseAdapter } from './base';
export { ShadowWireAdapter } from './shadowwire';
export { ArciumAdapter } from './arcium';
export { NoirAdapter } from './noir';
export { PrivacyCashAdapter } from './privacycash';

// Production adapters
export { PrivacyCashProductionAdapter } from './privacycash-production';
export { ShadowWireProductionAdapter } from './shadowwire-production';
export { ArciumProductionAdapter, createArciumProductionAdapter } from './arcium-production';

import type { PrivacyProviderAdapter } from '../types';
import { PrivacyProvider } from '../types';
import { ShadowWireAdapter } from './shadowwire';
import { ArciumAdapter } from './arcium';
import { NoirAdapter } from './noir';
import { PrivacyCashAdapter } from './privacycash';
import { PrivacyCashProductionAdapter } from './privacycash-production';
import { ShadowWireProductionAdapter } from './shadowwire-production';
import { ArciumProductionAdapter } from './arcium-production';

/**
 * Options for creating an adapter
 */
export interface CreateAdapterOptions {
  /**
   * Use production adapters instead of mock/development adapters
   * @default false
   */
  production?: boolean;
  /**
   * API key for ShadowWire production adapter
   */
  shadowWireApiKey?: string;
}

/**
 * Create an adapter instance for a provider
 *
 * @param provider - The privacy provider to create an adapter for
 * @param options - Optional configuration for the adapter
 * @returns A configured adapter instance
 *
 * @example
 * ```typescript
 * // Create a development adapter
 * const devAdapter = createAdapter(PrivacyProvider.SHADOWWIRE);
 *
 * // Create a production adapter
 * const prodAdapter = createAdapter(PrivacyProvider.SHADOWWIRE, { production: true });
 *
 * // Create a production adapter with API key
 * const prodAdapterWithKey = createAdapter(PrivacyProvider.SHADOWWIRE, {
 *   production: true,
 *   shadowWireApiKey: 'your-api-key'
 * });
 * ```
 */
export function createAdapter(
  provider: PrivacyProvider,
  options?: CreateAdapterOptions
): PrivacyProviderAdapter {
  const useProduction = options?.production ?? false;

  switch (provider) {
    case PrivacyProvider.SHADOWWIRE:
      return useProduction
        ? new ShadowWireProductionAdapter(options?.shadowWireApiKey)
        : new ShadowWireAdapter(options?.shadowWireApiKey);
    case PrivacyProvider.ARCIUM:
      return useProduction
        ? new ArciumProductionAdapter()
        : new ArciumAdapter();
    case PrivacyProvider.NOIR:
      // Noir doesn't have a separate production adapter yet
      return new NoirAdapter();
    case PrivacyProvider.PRIVACY_CASH:
      return useProduction
        ? new PrivacyCashProductionAdapter()
        : new PrivacyCashAdapter();
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Create a production adapter instance for a provider
 *
 * This is a convenience function that always returns production adapters.
 * Equivalent to calling `createAdapter(provider, { production: true })`.
 *
 * @param provider - The privacy provider to create an adapter for
 * @param options - Optional configuration for the adapter
 * @returns A configured production adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createProductionAdapter(PrivacyProvider.SHADOWWIRE, {
 *   shadowWireApiKey: 'your-api-key'
 * });
 * ```
 */
export function createProductionAdapter(
  provider: PrivacyProvider,
  options?: Omit<CreateAdapterOptions, 'production'>
): PrivacyProviderAdapter {
  return createAdapter(provider, { ...options, production: true });
}

/**
 * Options for getting all adapters
 */
export interface GetAllAdaptersOptions {
  /**
   * Use production adapters instead of mock/development adapters
   * @default false
   */
  production?: boolean;
  /**
   * API key for ShadowWire production adapter
   */
  shadowWireApiKey?: string;
}

/**
 * Get all available adapters
 *
 * @param options - Optional configuration for the adapters
 * @returns An array of all available adapter instances
 *
 * @example
 * ```typescript
 * // Get all development adapters
 * const devAdapters = getAllAdapters();
 *
 * // Get all production adapters
 * const prodAdapters = getAllAdapters({ production: true });
 * ```
 */
export function getAllAdapters(options?: GetAllAdaptersOptions): PrivacyProviderAdapter[] {
  const useProduction = options?.production ?? false;

  if (useProduction) {
    return [
      new ShadowWireProductionAdapter(options?.shadowWireApiKey),
      new ArciumProductionAdapter(),
      new NoirAdapter(), // Noir doesn't have a separate production adapter yet
      new PrivacyCashProductionAdapter(),
    ];
  }

  return [
    new ShadowWireAdapter(options?.shadowWireApiKey),
    new ArciumAdapter(),
    new NoirAdapter(),
    new PrivacyCashAdapter(),
  ];
}

/**
 * Get all production adapters
 *
 * This is a convenience function that always returns production adapters.
 * Equivalent to calling `getAllAdapters({ production: true })`.
 *
 * @param options - Optional configuration for the adapters
 * @returns An array of all available production adapter instances
 *
 * @example
 * ```typescript
 * const adapters = getAllProductionAdapters({
 *   shadowWireApiKey: 'your-api-key'
 * });
 * ```
 */
export function getAllProductionAdapters(
  options?: Omit<GetAllAdaptersOptions, 'production'>
): PrivacyProviderAdapter[] {
  return getAllAdapters({ ...options, production: true });
}
