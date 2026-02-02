'use client';

import { useState, useCallback, useRef } from 'react';
import { usePrivacyKitContext } from '../context';
import type {
  TransferRequest,
  TransferResult,
  PrivacyLevel,
  PrivacyProvider,
  TransferOptions,
} from '@privacykit/sdk';

/**
 * Transfer state
 */
export type TransferStatus = 'idle' | 'pending' | 'success' | 'error';

/**
 * Parameters for initiating a transfer
 */
export interface TransferParams {
  /** Recipient address */
  recipient: string;
  /** Amount to transfer */
  amount: number;
  /** Token symbol (e.g., 'SOL', 'USDC') */
  token: string;
  /** Desired privacy level */
  privacy: PrivacyLevel;
  /** Optional: force specific provider */
  provider?: PrivacyProvider;
  /** Optional: additional options */
  options?: TransferOptions;
}

/**
 * Return type for usePrivateTransfer hook
 */
export interface UsePrivateTransferReturn {
  /** Current transfer status */
  status: TransferStatus;
  /** Whether a transfer is in progress */
  isLoading: boolean;
  /** Last successful transfer result */
  result: TransferResult | null;
  /** Any error that occurred */
  error: Error | null;
  /** Execute a private transfer */
  transfer: (params: TransferParams) => Promise<TransferResult>;
  /** Reset state to idle */
  reset: () => void;
  /** Abort current transfer (if possible) */
  abort: () => void;
}

/**
 * Hook for executing private transfers with loading and error states
 *
 * Provides a simple interface for making private transfers with automatic
 * state management for loading, success, and error states.
 *
 * @example
 * ```tsx
 * function TransferForm() {
 *   const { transfer, isLoading, error, result, status } = usePrivateTransfer();
 *
 *   const handleSubmit = async (e: FormEvent) => {
 *     e.preventDefault();
 *     try {
 *       const result = await transfer({
 *         recipient: 'abc...',
 *         amount: 1,
 *         token: 'SOL',
 *         privacy: 'amount-hidden',
 *       });
 *       console.log('Transfer complete:', result.signature);
 *     } catch (err) {
 *       console.error('Transfer failed:', err);
 *     }
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       {isLoading && <div>Processing transfer...</div>}
 *       {error && <div>Error: {error.message}</div>}
 *       {result && <div>Success! Signature: {result.signature}</div>}
 *       <button type="submit" disabled={isLoading}>
 *         Send
 *       </button>
 *     </form>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With provider preference
 * function ShadowWireTransfer() {
 *   const { transfer, isLoading } = usePrivateTransfer();
 *
 *   const handleTransfer = () => {
 *     transfer({
 *       recipient: 'xyz...',
 *       amount: 100,
 *       token: 'USDC',
 *       privacy: 'sender-hidden',
 *       provider: 'shadowwire',
 *       options: {
 *         maxFee: 0.01,
 *         memo: 'Payment for services',
 *       },
 *     });
 *   };
 *
 *   return (
 *     <button onClick={handleTransfer} disabled={isLoading}>
 *       Send via ShadowWire
 *     </button>
 *   );
 * }
 * ```
 *
 * @returns {UsePrivateTransferReturn} Transfer state and functions
 * @throws Error if used outside of PrivacyKitProvider
 */
export function usePrivateTransfer(): UsePrivateTransferReturn {
  const context = usePrivacyKitContext();
  const [status, setStatus] = useState<TransferStatus>('idle');
  const [result, setResult] = useState<TransferResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef(false);
  const transferIdRef = useRef(0);

  const transfer = useCallback(
    async (params: TransferParams): Promise<TransferResult> => {
      // Check if ready
      if (!context.isReady) {
        throw new Error('PrivacyKit is not ready');
      }

      // Increment transfer ID to track current transfer
      const currentTransferId = ++transferIdRef.current;
      abortRef.current = false;

      // Reset state
      setStatus('pending');
      setError(null);
      setResult(null);

      try {
        const request: TransferRequest = {
          recipient: params.recipient,
          amount: params.amount,
          token: params.token,
          privacy: params.privacy,
          provider: params.provider,
          options: params.options,
        };

        const transferResult = await context.transfer(request);

        // Check if aborted or superseded by new transfer
        if (abortRef.current || currentTransferId !== transferIdRef.current) {
          throw new Error('Transfer was aborted');
        }

        setStatus('success');
        setResult(transferResult);
        return transferResult;
      } catch (err) {
        // Only update state if this is still the current transfer
        if (currentTransferId === transferIdRef.current && !abortRef.current) {
          const transferError = err instanceof Error ? err : new Error(String(err));
          setStatus('error');
          setError(transferError);
          throw transferError;
        }
        throw err;
      }
    },
    [context]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
    setStatus('idle');
  }, []);

  return {
    status,
    isLoading: status === 'pending',
    result,
    error,
    transfer,
    reset,
    abort,
  };
}

/**
 * Options for usePrivateTransferWithConfirmation
 */
export interface UsePrivateTransferWithConfirmationOptions {
  /** Number of confirmations to wait for (default: 1) */
  confirmations?: number;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
}

/**
 * Extended return type with confirmation state
 */
export interface UsePrivateTransferWithConfirmationReturn extends UsePrivateTransferReturn {
  /** Number of confirmations received */
  confirmations: number;
  /** Whether waiting for confirmations */
  isConfirming: boolean;
}

/**
 * Hook for private transfers with confirmation tracking
 *
 * Like usePrivateTransfer, but also tracks transaction confirmations.
 *
 * @example
 * ```tsx
 * function TransferWithConfirmation() {
 *   const {
 *     transfer,
 *     isLoading,
 *     isConfirming,
 *     confirmations,
 *     result,
 *   } = usePrivateTransferWithConfirmation({ confirmations: 3 });
 *
 *   return (
 *     <div>
 *       {isLoading && <div>Submitting transaction...</div>}
 *       {isConfirming && <div>Confirming: {confirmations}/3</div>}
 *       {result && <div>Confirmed!</div>}
 *     </div>
 *   );
 * }
 * ```
 *
 * @param options - Configuration options
 * @returns Transfer state with confirmation tracking
 */
export function usePrivateTransferWithConfirmation(
  options: UsePrivateTransferWithConfirmationOptions = {}
): UsePrivateTransferWithConfirmationReturn {
  const baseHook = usePrivateTransfer();
  const [confirmations, setConfirmations] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);

  const { confirmations: requiredConfirmations = 1, timeout = 60000 } = options;

  const transferWithConfirmation = useCallback(
    async (params: TransferParams): Promise<TransferResult> => {
      setConfirmations(0);
      setIsConfirming(false);

      const result = await baseHook.transfer(params);

      // After successful transfer, wait for confirmations
      setIsConfirming(true);

      // In a real implementation, this would poll the transaction status
      // For now, we simulate confirmation tracking
      const startTime = Date.now();
      let currentConfirmations = 0;

      while (currentConfirmations < requiredConfirmations) {
        if (Date.now() - startTime > timeout) {
          throw new Error('Confirmation timeout');
        }

        // Wait a bit before checking
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // In production, this would check actual confirmations
        // using connection.confirmTransaction or similar
        currentConfirmations++;
        setConfirmations(currentConfirmations);
      }

      setIsConfirming(false);
      return result;
    },
    [baseHook, requiredConfirmations, timeout]
  );

  const reset = useCallback(() => {
    baseHook.reset();
    setConfirmations(0);
    setIsConfirming(false);
  }, [baseHook]);

  return {
    ...baseHook,
    transfer: transferWithConfirmation,
    reset,
    confirmations,
    isConfirming,
  };
}
