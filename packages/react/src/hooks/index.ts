/**
 * PrivacyKit React Hooks
 *
 * This module exports all hooks for interacting with PrivacyKit.
 */

export { usePrivacyKit, type UsePrivacyKitReturn } from './usePrivacyKit';

export {
  usePrivateTransfer,
  usePrivateTransferWithConfirmation,
  type UsePrivateTransferReturn,
  type UsePrivateTransferWithConfirmationReturn,
  type UsePrivateTransferWithConfirmationOptions,
  type TransferParams,
  type TransferStatus,
} from './usePrivateTransfer';

export {
  usePrivateBalance,
  usePrivateBalances,
  useWatchBalance,
  type UsePrivateBalanceReturn,
  type UsePrivateBalanceOptions,
  type UsePrivateBalancesReturn,
  type UseWatchBalanceOptions,
} from './usePrivateBalance';

export {
  useEstimate,
  useLiveEstimate,
  useCompareEstimates,
  type UseEstimateReturn,
  type UseLiveEstimateReturn,
  type UseLiveEstimateOptions,
  type UseCompareEstimatesReturn,
  type EstimateParams,
} from './useEstimate';
