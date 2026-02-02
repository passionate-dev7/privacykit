'use client';

import { useState, useEffect, useCallback } from 'react';
import { PrivacyProvider, BalanceResult } from '@privacykit/sdk';
import { usePrivacyKit } from '@/context/PrivacyKitContext';

interface UsePrivateBalanceReturn {
  balance: BalanceResult | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching private balance for a specific token
 *
 * @param token - The token symbol (e.g., 'SOL', 'USDC')
 * @returns Balance information including public, shielded, and total amounts
 *
 * @example
 * ```tsx
 * const { balance, isLoading, refresh } = usePrivateBalance('SOL');
 *
 * if (isLoading) return <div>Loading...</div>;
 *
 * return (
 *   <div>
 *     <p>Public: {balance?.public} SOL</p>
 *     <p>Shielded: {balance?.total} SOL</p>
 *   </div>
 * );
 * ```
 */
export function usePrivateBalance(token: string): UsePrivateBalanceReturn {
  const { balances, refreshBalances, isLoading: contextLoading, isInitialized } = usePrivacyKit();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Get balance for the specific token
  const balance = balances[token] || null;

  // Initial fetch when initialized
  useEffect(() => {
    if (isInitialized && !balance) {
      refreshBalances().catch((err) => {
        setError(err instanceof Error ? err : new Error('Failed to fetch balance'));
      });
    }
  }, [isInitialized, balance, refreshBalances]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await refreshBalances();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to refresh balance'));
    } finally {
      setIsLoading(false);
    }
  }, [refreshBalances]);

  return {
    balance,
    isLoading: isLoading || contextLoading,
    error,
    refresh,
  };
}

/**
 * Hook for fetching all private balances
 *
 * @returns All balance information across all tokens
 *
 * @example
 * ```tsx
 * const { balances, isLoading, refresh } = useAllPrivateBalances();
 *
 * return (
 *   <div>
 *     {Object.entries(balances).map(([token, balance]) => (
 *       <div key={token}>
 *         {token}: {balance?.total}
 *       </div>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useAllPrivateBalances(): {
  balances: Partial<Record<string, BalanceResult>>;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
} {
  const { balances, refreshBalances, isLoading: contextLoading, isInitialized } = usePrivacyKit();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initial fetch when initialized
  useEffect(() => {
    if (isInitialized && Object.keys(balances).length === 0) {
      refreshBalances().catch((err) => {
        setError(err instanceof Error ? err : new Error('Failed to fetch balances'));
      });
    }
  }, [isInitialized, balances, refreshBalances]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await refreshBalances();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to refresh balances'));
    } finally {
      setIsLoading(false);
    }
  }, [refreshBalances]);

  return {
    balances,
    isLoading: isLoading || contextLoading,
    error,
    refresh,
  };
}

/**
 * Hook for getting balance breakdown by provider
 *
 * @param token - The token symbol
 * @returns Balance breakdown per provider
 */
export function useBalanceByProvider(token: string): {
  balanceByProvider: Partial<Record<PrivacyProvider, number>>;
  totalShielded: number;
  isLoading: boolean;
} {
  const { balance, isLoading } = usePrivateBalance(token);

  const balanceByProvider = balance?.shielded || {};
  const totalShielded = Object.values(balanceByProvider).reduce(
    (sum, val) => sum + (val || 0),
    0
  );

  return {
    balanceByProvider,
    totalShielded,
    isLoading,
  };
}
