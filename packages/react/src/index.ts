/**
 * @privacykit/react
 *
 * React hooks and components for PrivacyKit - the unified privacy layer for Solana.
 *
 * @example
 * ```tsx
 * import { PrivacyKitProvider, usePrivacyKit, usePrivateTransfer } from '@privacykit/react';
 *
 * function App() {
 *   return (
 *     <ConnectionProvider endpoint={endpoint}>
 *       <WalletProvider wallets={wallets}>
 *         <PrivacyKitProvider network="devnet">
 *           <TransferForm />
 *         </PrivacyKitProvider>
 *       </WalletProvider>
 *     </ConnectionProvider>
 *   );
 * }
 *
 * function TransferForm() {
 *   const { isReady } = usePrivacyKit();
 *   const { transfer, isLoading, error, result } = usePrivateTransfer();
 *
 *   const handleTransfer = async () => {
 *     await transfer({
 *       recipient: 'abc...',
 *       amount: 1,
 *       token: 'SOL',
 *       privacy: 'amount-hidden',
 *     });
 *   };
 *
 *   if (!isReady) return <div>Loading...</div>;
 *
 *   return (
 *     <button onClick={handleTransfer} disabled={isLoading}>
 *       {isLoading ? 'Sending...' : 'Send Privately'}
 *     </button>
 *   );
 * }
 * ```
 *
 * @packageDocumentation
 */

// Context and Provider
export {
  PrivacyKitProvider,
  PrivacyKitContext,
  usePrivacyKitContext,
  type PrivacyKitProviderProps,
  type PrivacyKitContextValue,
  type PrivacyKitState,
} from './context';

// Core hooks
export { usePrivacyKit, type UsePrivacyKitReturn } from './hooks/usePrivacyKit';

export {
  usePrivateTransfer,
  usePrivateTransferWithConfirmation,
  type UsePrivateTransferReturn,
  type UsePrivateTransferWithConfirmationReturn,
  type UsePrivateTransferWithConfirmationOptions,
  type TransferParams,
  type TransferStatus,
} from './hooks/usePrivateTransfer';

export {
  usePrivateBalance,
  usePrivateBalances,
  useWatchBalance,
  type UsePrivateBalanceReturn,
  type UsePrivateBalanceOptions,
  type UsePrivateBalancesReturn,
  type UseWatchBalanceOptions,
} from './hooks/usePrivateBalance';

export {
  useEstimate,
  useLiveEstimate,
  useCompareEstimates,
  type UseEstimateReturn,
  type UseLiveEstimateReturn,
  type UseLiveEstimateOptions,
  type UseCompareEstimatesReturn,
  type EstimateParams,
} from './hooks/useEstimate';

// Re-export commonly used types from SDK for convenience
export type {
  PrivacyLevel,
  PrivacyProvider,
  TransferRequest,
  TransferResult,
  DepositRequest,
  DepositResult,
  WithdrawRequest,
  WithdrawResult,
  BalanceResult,
  EstimateRequest,
  EstimateResult,
  NetworkCluster,
  WalletAdapter,
  PrivacyKitConfig,
  TransferOptions,
} from '@privacykit/sdk';
