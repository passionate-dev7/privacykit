'use client';

import { usePrivacyKitContext } from '../context';
import type {
  PrivacyProvider,
  PrivacyProviderAdapter,
  NetworkCluster,
} from '@privacykit/sdk';
import { PrivacyRouter } from '@privacykit/sdk';

/**
 * Return type for usePrivacyKit hook
 */
export interface UsePrivacyKitReturn {
  /** Whether PrivacyKit is initialized and ready to use */
  isReady: boolean;
  /** Whether initialization is in progress */
  isInitializing: boolean;
  /** List of available providers */
  providers: PrivacyProvider[];
  /** Current network cluster */
  network: NetworkCluster;
  /** Any initialization error */
  error: Error | null;
  /** The privacy router instance for advanced usage */
  router: PrivacyRouter | null;
  /** Get a specific provider adapter for direct access */
  getAdapter: (provider: PrivacyProvider) => PrivacyProviderAdapter | undefined;
  /** Refresh/reinitialize PrivacyKit */
  refresh: () => Promise<void>;
}

/**
 * Hook for accessing the PrivacyKit instance and state
 *
 * Provides access to the core PrivacyKit functionality including:
 * - Initialization state
 * - Available providers
 * - Direct adapter access
 * - Router for provider selection
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isReady, providers, error } = usePrivacyKit();
 *
 *   if (!isReady) {
 *     return <div>Loading PrivacyKit...</div>;
 *   }
 *
 *   if (error) {
 *     return <div>Error: {error.message}</div>;
 *   }
 *
 *   return (
 *     <div>
 *       Available providers: {providers.join(', ')}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Direct adapter access for advanced usage
 * function AdvancedComponent() {
 *   const { getAdapter, isReady } = usePrivacyKit();
 *
 *   const handleDirectTransfer = async () => {
 *     const shadowwire = getAdapter('shadowwire');
 *     if (shadowwire) {
 *       const result = await shadowwire.transfer({
 *         recipient: 'abc...',
 *         amount: 1,
 *         token: 'SOL',
 *         privacy: 'amount-hidden',
 *       });
 *       console.log('Direct transfer:', result);
 *     }
 *   };
 *
 *   return <button onClick={handleDirectTransfer}>Direct Transfer</button>;
 * }
 * ```
 *
 * @returns {UsePrivacyKitReturn} PrivacyKit state and utilities
 * @throws Error if used outside of PrivacyKitProvider
 */
export function usePrivacyKit(): UsePrivacyKitReturn {
  const context = usePrivacyKitContext();

  return {
    isReady: context.isReady,
    isInitializing: context.isInitializing,
    providers: context.providers,
    network: context.network,
    error: context.error,
    router: context.router,
    getAdapter: context.getAdapter,
    refresh: context.refresh,
  };
}
