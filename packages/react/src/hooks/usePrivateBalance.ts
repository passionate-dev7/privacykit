'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { usePrivacyKitContext } from '../context';
import type { BalanceResult, PrivacyProvider } from '@privacykit/sdk';

/**
 * Options for usePrivateBalance hook
 */
export interface UsePrivateBalanceOptions {
  /** Token symbol to query (default: 'SOL') */
  token?: string;
  /** Auto-refresh interval in milliseconds (0 to disable, default: 0) */
  refreshInterval?: number;
  /** Whether to fetch on mount (default: true) */
  fetchOnMount?: boolean;
  /** Specific provider to query (queries all if not specified) */
  provider?: PrivacyProvider;
}

/**
 * Return type for usePrivateBalance hook
 */
export interface UsePrivateBalanceReturn {
  /** Balance data */
  balance: BalanceResult | null;
  /** Whether balance is loading */
  isLoading: boolean;
  /** Any error that occurred */
  error: Error | null;
  /** Refresh the balance */
  refetch: () => Promise<void>;
  /** Last successful fetch timestamp */
  lastUpdated: Date | null;
  /** Token being queried */
  token: string;
}

/**
 * Hook for fetching private/shielded balances
 *
 * Fetches balance information across all privacy providers or a specific one.
 * Supports auto-refresh and manual refresh.
 *
 * @example
 * ```tsx
 * function BalanceDisplay() {
 *   const { balance, isLoading, error, refetch } = usePrivateBalance({
 *     token: 'SOL',
 *     refreshInterval: 30000, // Refresh every 30 seconds
 *   });
 *
 *   if (isLoading && !balance) {
 *     return <div>Loading balance...</div>;
 *   }
 *
 *   if (error) {
 *     return <div>Error: {error.message}</div>;
 *   }
 *
 *   if (!balance) {
 *     return null;
 *   }
 *
 *   return (
 *     <div>
 *       <div>Public: {balance.public} SOL</div>
 *       <div>Shielded: {Object.values(balance.shielded).reduce((a, b) => a + (b || 0), 0)} SOL</div>
 *       <div>Total: {balance.total} SOL</div>
 *       <button onClick={refetch}>Refresh</button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Query specific provider
 * function ShadowWireBalance() {
 *   const { balance } = usePrivateBalance({
 *     token: 'USDC',
 *     provider: 'shadowwire',
 *   });
 *
 *   return (
 *     <div>
 *       ShadowWire USDC: {balance?.shielded.shadowwire ?? 0}
 *     </div>
 *   );
 * }
 * ```
 *
 * @param options - Configuration options
 * @returns Balance state and utilities
 * @throws Error if used outside of PrivacyKitProvider
 */
export function usePrivateBalance(
  options: UsePrivateBalanceOptions = {}
): UsePrivateBalanceReturn {
  const { token = 'SOL', refreshInterval = 0, fetchOnMount = true, provider } = options;
  const context = usePrivacyKitContext();

  const [balance, setBalance] = useState<BalanceResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  const fetchBalance = useCallback(async () => {
    if (!context.isReady) {
      return;
    }

    const currentFetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      let result: BalanceResult;

      if (provider) {
        // Query specific provider
        const adapter = context.getAdapter(provider);
        if (!adapter) {
          throw new Error(`Provider ${provider} not available`);
        }
        const providerBalance = await adapter.getBalance(token);
        result = {
          public: 0,
          shielded: { [provider]: providerBalance },
          total: providerBalance,
          token,
        };
      } else {
        // Query all providers via context
        result = await context.getBalance(token);
      }

      // Only update if this is still the current fetch and component is mounted
      if (currentFetchId === fetchIdRef.current && mountedRef.current) {
        setBalance(result);
        setLastUpdated(new Date());
      }
    } catch (err) {
      if (currentFetchId === fetchIdRef.current && mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (currentFetchId === fetchIdRef.current && mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [context, token, provider]);

  // Fetch on mount
  useEffect(() => {
    if (fetchOnMount && context.isReady) {
      fetchBalance();
    }
  }, [fetchOnMount, context.isReady, fetchBalance]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval > 0 && context.isReady) {
      const intervalId = setInterval(fetchBalance, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [refreshInterval, context.isReady, fetchBalance]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    await fetchBalance();
  }, [fetchBalance]);

  return {
    balance,
    isLoading,
    error,
    refetch,
    lastUpdated,
    token,
  };
}

/**
 * Return type for usePrivateBalances (multiple tokens)
 */
export interface UsePrivateBalancesReturn {
  /** Balance data per token */
  balances: Record<string, BalanceResult>;
  /** Whether any balance is loading */
  isLoading: boolean;
  /** Errors per token */
  errors: Record<string, Error>;
  /** Refresh all balances */
  refetchAll: () => Promise<void>;
  /** Refresh a specific token */
  refetch: (token: string) => Promise<void>;
  /** Last update timestamp per token */
  lastUpdated: Record<string, Date>;
}

/**
 * Hook for fetching multiple token balances at once
 *
 * Efficiently fetches balances for multiple tokens with a single hook.
 *
 * @example
 * ```tsx
 * function MultiTokenBalance() {
 *   const { balances, isLoading, refetchAll } = usePrivateBalances(['SOL', 'USDC', 'USDT']);
 *
 *   if (isLoading) {
 *     return <div>Loading balances...</div>;
 *   }
 *
 *   return (
 *     <div>
 *       {Object.entries(balances).map(([token, balance]) => (
 *         <div key={token}>
 *           {token}: {balance.total}
 *         </div>
 *       ))}
 *       <button onClick={refetchAll}>Refresh All</button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @param tokens - Array of token symbols to query
 * @param options - Additional options (refreshInterval, fetchOnMount)
 * @returns Balances state and utilities
 */
export function usePrivateBalances(
  tokens: string[],
  options: Pick<UsePrivateBalanceOptions, 'refreshInterval' | 'fetchOnMount'> = {}
): UsePrivateBalancesReturn {
  const { refreshInterval = 0, fetchOnMount = true } = options;
  const context = usePrivacyKitContext();

  const [balances, setBalances] = useState<Record<string, BalanceResult>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, Error>>({});
  const [lastUpdated, setLastUpdated] = useState<Record<string, Date>>({});

  const mountedRef = useRef(true);

  const fetchAllBalances = useCallback(async () => {
    if (!context.isReady) return;

    setIsLoading(true);

    const results: Record<string, BalanceResult> = {};
    const fetchErrors: Record<string, Error> = {};
    const timestamps: Record<string, Date> = {};

    await Promise.all(
      tokens.map(async (token) => {
        try {
          const result = await context.getBalance(token);
          results[token] = result;
          timestamps[token] = new Date();
        } catch (err) {
          fetchErrors[token] = err instanceof Error ? err : new Error(String(err));
        }
      })
    );

    if (mountedRef.current) {
      setBalances(results);
      setErrors(fetchErrors);
      setLastUpdated(timestamps);
      setIsLoading(false);
    }
  }, [context, tokens]);

  const fetchSingleBalance = useCallback(
    async (token: string) => {
      if (!context.isReady) return;

      try {
        const result = await context.getBalance(token);
        if (mountedRef.current) {
          setBalances((prev) => ({ ...prev, [token]: result }));
          setLastUpdated((prev) => ({ ...prev, [token]: new Date() }));
          setErrors((prev) => {
            const { [token]: _, ...rest } = prev;
            return rest;
          });
        }
      } catch (err) {
        if (mountedRef.current) {
          setErrors((prev) => ({
            ...prev,
            [token]: err instanceof Error ? err : new Error(String(err)),
          }));
        }
      }
    },
    [context]
  );

  // Fetch on mount
  useEffect(() => {
    if (fetchOnMount && context.isReady) {
      fetchAllBalances();
    }
  }, [fetchOnMount, context.isReady, fetchAllBalances]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval > 0 && context.isReady) {
      const intervalId = setInterval(fetchAllBalances, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [refreshInterval, context.isReady, fetchAllBalances]);

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    balances,
    isLoading,
    errors,
    refetchAll: fetchAllBalances,
    refetch: fetchSingleBalance,
    lastUpdated,
  };
}

/**
 * Hook for watching balance changes with callback
 *
 * @example
 * ```tsx
 * function BalanceWatcher() {
 *   useWatchBalance('SOL', {
 *     onChange: (newBalance, prevBalance) => {
 *       if (newBalance.total > prevBalance?.total) {
 *         toast.success('You received funds!');
 *       }
 *     },
 *     interval: 10000,
 *   });
 *
 *   return <div>Watching for balance changes...</div>;
 * }
 * ```
 */
export interface UseWatchBalanceOptions {
  /** Callback when balance changes */
  onChange: (newBalance: BalanceResult, prevBalance: BalanceResult | null) => void;
  /** Polling interval in ms (default: 10000) */
  interval?: number;
  /** Minimum change threshold to trigger callback */
  threshold?: number;
}

export function useWatchBalance(token: string, options: UseWatchBalanceOptions): void {
  const { onChange, interval = 10000, threshold = 0 } = options;
  const context = usePrivacyKitContext();
  const prevBalanceRef = useRef<BalanceResult | null>(null);

  useEffect(() => {
    if (!context.isReady) return;

    const checkBalance = async () => {
      try {
        const newBalance = await context.getBalance(token);
        const prevBalance = prevBalanceRef.current;

        if (prevBalance) {
          const diff = Math.abs(newBalance.total - prevBalance.total);
          if (diff > threshold) {
            onChange(newBalance, prevBalance);
          }
        }

        prevBalanceRef.current = newBalance;
      } catch {
        // Ignore errors in watch mode
      }
    };

    // Initial check
    checkBalance();

    // Set up polling
    const intervalId = setInterval(checkBalance, interval);
    return () => clearInterval(intervalId);
  }, [context, token, interval, threshold, onChange]);
}
