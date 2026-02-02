'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { usePrivacyKitContext } from '../context';
import type {
  EstimateRequest,
  EstimateResult,
  PrivacyLevel,
  PrivacyProvider,
} from '@privacykit/sdk';

/**
 * Parameters for estimating operation costs
 */
export interface EstimateParams {
  /** Operation type */
  operation: 'transfer' | 'deposit' | 'withdraw' | 'prove';
  /** Amount (optional) */
  amount?: number;
  /** Token symbol */
  token?: string;
  /** Desired privacy level */
  privacy?: PrivacyLevel;
  /** Specific provider to estimate for */
  provider?: PrivacyProvider;
}

/**
 * Return type for useEstimate hook
 */
export interface UseEstimateReturn {
  /** Estimate result */
  estimate: EstimateResult | null;
  /** Whether estimation is in progress */
  isLoading: boolean;
  /** Any error that occurred */
  error: Error | null;
  /** Fetch a new estimate */
  getEstimate: (params: EstimateParams) => Promise<EstimateResult>;
  /** Clear current estimate */
  clear: () => void;
}

/**
 * Hook for estimating operation costs
 *
 * Provides cost estimates for transfers, deposits, withdrawals, and proof generation.
 * Returns fee information, expected latency, and any warnings.
 *
 * @example
 * ```tsx
 * function TransferEstimate() {
 *   const { estimate, isLoading, error, getEstimate } = useEstimate();
 *
 *   const handleEstimate = () => {
 *     getEstimate({
 *       operation: 'transfer',
 *       amount: 100,
 *       token: 'USDC',
 *       privacy: 'amount-hidden',
 *     });
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleEstimate} disabled={isLoading}>
 *         Get Estimate
 *       </button>
 *       {estimate && (
 *         <div>
 *           <p>Fee: {estimate.fee} SOL</p>
 *           <p>Latency: ~{estimate.latencyMs / 1000}s</p>
 *           <p>Provider: {estimate.provider}</p>
 *           {estimate.warnings.length > 0 && (
 *             <ul>
 *               {estimate.warnings.map((w, i) => (
 *                 <li key={i}>{w}</li>
 *               ))}
 *             </ul>
 *           )}
 *         </div>
 *       )}
 *       {error && <p>Error: {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 *
 * @returns Estimate state and utilities
 * @throws Error if used outside of PrivacyKitProvider
 */
export function useEstimate(): UseEstimateReturn {
  const context = usePrivacyKitContext();
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const estimateIdRef = useRef(0);

  const getEstimate = useCallback(
    async (params: EstimateParams): Promise<EstimateResult> => {
      if (!context.isReady) {
        throw new Error('PrivacyKit is not ready');
      }

      const currentEstimateId = ++estimateIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const request: EstimateRequest = {
          operation: params.operation,
          amount: params.amount,
          token: params.token,
          privacy: params.privacy,
          provider: params.provider,
        };

        const result = await context.estimate(request);

        // Only update if this is the current estimate
        if (currentEstimateId === estimateIdRef.current) {
          setEstimate(result);
          setIsLoading(false);
        }

        return result;
      } catch (err) {
        const estimateError = err instanceof Error ? err : new Error(String(err));
        if (currentEstimateId === estimateIdRef.current) {
          setError(estimateError);
          setIsLoading(false);
        }
        throw estimateError;
      }
    },
    [context]
  );

  const clear = useCallback(() => {
    setEstimate(null);
    setError(null);
  }, []);

  return {
    estimate,
    isLoading,
    error,
    getEstimate,
    clear,
  };
}

/**
 * Options for useLiveEstimate
 */
export interface UseLiveEstimateOptions {
  /** Debounce time in milliseconds (default: 500) */
  debounceMs?: number;
  /** Whether to estimate automatically when params change (default: true) */
  enabled?: boolean;
}

/**
 * Return type for useLiveEstimate
 */
export interface UseLiveEstimateReturn {
  /** Current estimate */
  estimate: EstimateResult | null;
  /** Whether estimation is in progress */
  isLoading: boolean;
  /** Any error */
  error: Error | null;
  /** Force a refresh */
  refresh: () => void;
}

/**
 * Hook for live/reactive cost estimation
 *
 * Automatically re-estimates when parameters change with debouncing.
 * Useful for real-time fee displays in transfer forms.
 *
 * @example
 * ```tsx
 * function LiveEstimateForm() {
 *   const [amount, setAmount] = useState(0);
 *   const [token, setToken] = useState('SOL');
 *   const [privacy, setPrivacy] = useState<PrivacyLevel>('amount-hidden');
 *
 *   const { estimate, isLoading, error } = useLiveEstimate(
 *     { operation: 'transfer', amount, token, privacy },
 *     { debounceMs: 300 }
 *   );
 *
 *   return (
 *     <div>
 *       <input
 *         type="number"
 *         value={amount}
 *         onChange={(e) => setAmount(Number(e.target.value))}
 *       />
 *       <div>
 *         {isLoading ? (
 *           'Calculating fee...'
 *         ) : estimate ? (
 *           `Fee: ${estimate.fee} SOL`
 *         ) : error ? (
 *           `Error: ${error.message}`
 *         ) : null}
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 *
 * @param params - Estimate parameters (re-estimates when these change)
 * @param options - Configuration options
 * @returns Live estimate state
 */
export function useLiveEstimate(
  params: EstimateParams,
  options: UseLiveEstimateOptions = {}
): UseLiveEstimateReturn {
  const { debounceMs = 500, enabled = true } = options;
  const context = usePrivacyKitContext();

  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const estimateIdRef = useRef(0);

  // Memoize params to avoid unnecessary re-renders
  const paramsKey = useMemo(
    () =>
      JSON.stringify({
        operation: params.operation,
        amount: params.amount,
        token: params.token,
        privacy: params.privacy,
        provider: params.provider,
      }),
    [params.operation, params.amount, params.token, params.privacy, params.provider]
  );

  useEffect(() => {
    if (!enabled || !context.isReady) {
      return;
    }

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce the estimate
    timeoutRef.current = setTimeout(async () => {
      const currentEstimateId = ++estimateIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const request: EstimateRequest = {
          operation: params.operation,
          amount: params.amount,
          token: params.token,
          privacy: params.privacy,
          provider: params.provider,
        };

        const result = await context.estimate(request);

        if (currentEstimateId === estimateIdRef.current) {
          setEstimate(result);
        }
      } catch (err) {
        if (currentEstimateId === estimateIdRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (currentEstimateId === estimateIdRef.current) {
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [context, paramsKey, debounceMs, enabled, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return {
    estimate,
    isLoading,
    error,
    refresh,
  };
}

/**
 * Return type for useCompareEstimates
 */
export interface UseCompareEstimatesReturn {
  /** Estimates per provider */
  estimates: Partial<Record<PrivacyProvider, EstimateResult>>;
  /** Whether loading */
  isLoading: boolean;
  /** Errors per provider */
  errors: Partial<Record<PrivacyProvider, Error>>;
  /** Recommended provider (lowest fee) */
  recommended: PrivacyProvider | null;
  /** Compare across providers */
  compare: (params: Omit<EstimateParams, 'provider'>) => Promise<void>;
}

/**
 * Hook for comparing estimates across providers
 *
 * Fetches estimates from all available providers to compare costs.
 *
 * @example
 * ```tsx
 * function ProviderComparison() {
 *   const { estimates, recommended, isLoading, compare } = useCompareEstimates();
 *
 *   useEffect(() => {
 *     compare({
 *       operation: 'transfer',
 *       amount: 100,
 *       token: 'USDC',
 *       privacy: 'amount-hidden',
 *     });
 *   }, []);
 *
 *   if (isLoading) return <div>Comparing providers...</div>;
 *
 *   return (
 *     <div>
 *       <h3>Provider Comparison</h3>
 *       {Object.entries(estimates).map(([provider, estimate]) => (
 *         <div key={provider}>
 *           <strong>{provider}</strong>: {estimate.fee} SOL
 *           {provider === recommended && ' (Recommended)'}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 *
 * @returns Comparison state and utilities
 */
export function useCompareEstimates(): UseCompareEstimatesReturn {
  const context = usePrivacyKitContext();

  const [estimates, setEstimates] = useState<Partial<Record<PrivacyProvider, EstimateResult>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<PrivacyProvider, Error>>>({});
  const [recommended, setRecommended] = useState<PrivacyProvider | null>(null);

  const compare = useCallback(
    async (params: Omit<EstimateParams, 'provider'>) => {
      if (!context.isReady) {
        throw new Error('PrivacyKit is not ready');
      }

      setIsLoading(true);
      setEstimates({});
      setErrors({});
      setRecommended(null);

      const results: Partial<Record<PrivacyProvider, EstimateResult>> = {};
      const compareErrors: Partial<Record<PrivacyProvider, Error>> = {};

      await Promise.all(
        context.providers.map(async (provider) => {
          try {
            const adapter = context.getAdapter(provider);
            if (!adapter) return;

            const result = await adapter.estimate({
              operation: params.operation,
              amount: params.amount,
              token: params.token,
              privacy: params.privacy,
            });

            results[provider] = result;
          } catch (err) {
            compareErrors[provider] = err instanceof Error ? err : new Error(String(err));
          }
        })
      );

      setEstimates(results);
      setErrors(compareErrors);

      // Find recommended (lowest fee)
      let lowestFee = Infinity;
      let recommendedProvider: PrivacyProvider | null = null;

      for (const [provider, estimate] of Object.entries(results)) {
        if (estimate.fee < lowestFee) {
          lowestFee = estimate.fee;
          recommendedProvider = provider as PrivacyProvider;
        }
      }

      setRecommended(recommendedProvider);
      setIsLoading(false);
    },
    [context]
  );

  return {
    estimates,
    isLoading,
    errors,
    recommended,
    compare,
  };
}
