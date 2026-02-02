'use client';

import { useState, useCallback } from 'react';
import {
  PrivacyLevel,
  PrivacyProvider,
  TransferRequest,
  TransferResult,
  EstimateResult,
} from '@privacykit/sdk';
import { usePrivacyKit } from '@/context/PrivacyKitContext';

interface TransferState {
  isLoading: boolean;
  isEstimating: boolean;
  error: Error | null;
  result: TransferResult | null;
  estimate: EstimateResult | null;
}

interface UsePrivateTransferReturn extends TransferState {
  executeTransfer: (params: {
    recipient: string;
    amount: number;
    token: string;
    privacy: PrivacyLevel;
    provider?: PrivacyProvider;
    memo?: string;
  }) => Promise<TransferResult>;
  estimateFee: (params: {
    amount: number;
    token: string;
    privacy: PrivacyLevel;
  }) => Promise<EstimateResult>;
  reset: () => void;
}

/**
 * Hook for executing private transfers with PrivacyKit
 *
 * @example
 * ```tsx
 * const { executeTransfer, isLoading, error, result } = usePrivateTransfer();
 *
 * const handleTransfer = async () => {
 *   try {
 *     const result = await executeTransfer({
 *       recipient: 'ABC...XYZ',
 *       amount: 1.5,
 *       token: 'SOL',
 *       privacy: PrivacyLevel.AMOUNT_HIDDEN,
 *     });
 *     console.log('Transfer complete:', result.signature);
 *   } catch (err) {
 *     console.error('Transfer failed:', err);
 *   }
 * };
 * ```
 */
export function usePrivateTransfer(): UsePrivateTransferReturn {
  const { transfer, estimate, isInitialized } = usePrivacyKit();

  const [state, setState] = useState<TransferState>({
    isLoading: false,
    isEstimating: false,
    error: null,
    result: null,
    estimate: null,
  });

  const executeTransfer = useCallback(
    async (params: {
      recipient: string;
      amount: number;
      token: string;
      privacy: PrivacyLevel;
      provider?: PrivacyProvider;
      memo?: string;
    }): Promise<TransferResult> => {
      if (!isInitialized) {
        throw new Error('PrivacyKit not initialized. Please connect your wallet.');
      }

      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      try {
        const request: TransferRequest = {
          recipient: params.recipient,
          amount: params.amount,
          token: params.token,
          privacy: params.privacy,
          provider: params.provider,
          options: params.memo ? { memo: params.memo } : undefined,
        };

        const result = await transfer(request);

        setState((prev) => ({
          ...prev,
          isLoading: false,
          result,
        }));

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Transfer failed');
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error,
        }));
        throw error;
      }
    },
    [transfer, isInitialized]
  );

  const estimateFee = useCallback(
    async (params: {
      amount: number;
      token: string;
      privacy: PrivacyLevel;
    }): Promise<EstimateResult> => {
      setState((prev) => ({
        ...prev,
        isEstimating: true,
      }));

      try {
        const estimateResult = await estimate('transfer', {
          amount: params.amount,
          token: params.token,
          privacy: params.privacy,
        });

        setState((prev) => ({
          ...prev,
          isEstimating: false,
          estimate: estimateResult,
        }));

        return estimateResult;
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isEstimating: false,
        }));
        throw err;
      }
    },
    [estimate]
  );

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      isEstimating: false,
      error: null,
      result: null,
      estimate: null,
    });
  }, []);

  return {
    ...state,
    executeTransfer,
    estimateFee,
    reset,
  };
}
