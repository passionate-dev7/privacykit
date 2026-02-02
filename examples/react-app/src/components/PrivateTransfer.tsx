'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PrivacyLevel, PrivacyProvider } from '@privacykit/sdk';
import { usePrivateTransfer } from '@/hooks/usePrivateTransfer';
import { usePrivacyKit } from '@/context/PrivacyKitContext';

/**
 * Privacy level descriptions and icons
 */
const PRIVACY_LEVEL_INFO: Record<
  PrivacyLevel,
  { name: string; description: string; color: string }
> = {
  [PrivacyLevel.AMOUNT_HIDDEN]: {
    name: 'Amount Hidden',
    description: 'Transfer amount is hidden using ZK proofs',
    color: 'green',
  },
  [PrivacyLevel.SENDER_HIDDEN]: {
    name: 'Sender Hidden',
    description: 'Your identity as sender is anonymized',
    color: 'blue',
  },
  [PrivacyLevel.FULL_ENCRYPTED]: {
    name: 'Full Encryption',
    description: 'All transaction data is encrypted via MPC',
    color: 'purple',
  },
  [PrivacyLevel.ZK_PROVEN]: {
    name: 'ZK Proven',
    description: 'Verified using zero-knowledge proofs',
    color: 'gray',
  },
  [PrivacyLevel.COMPLIANT_POOL]: {
    name: 'Compliant Pool',
    description: 'Privacy with proof of innocence',
    color: 'orange',
  },
  [PrivacyLevel.NONE]: {
    name: 'No Privacy',
    description: 'Standard public transaction',
    color: 'slate',
  },
};

/**
 * Provider information
 */
const PROVIDER_INFO: Record<PrivacyProvider, { name: string; supportedLevels: PrivacyLevel[] }> = {
  [PrivacyProvider.SHADOWWIRE]: {
    name: 'ShadowWire',
    supportedLevels: [PrivacyLevel.AMOUNT_HIDDEN, PrivacyLevel.SENDER_HIDDEN],
  },
  [PrivacyProvider.ARCIUM]: {
    name: 'Arcium',
    supportedLevels: [PrivacyLevel.FULL_ENCRYPTED, PrivacyLevel.AMOUNT_HIDDEN, PrivacyLevel.SENDER_HIDDEN],
  },
  [PrivacyProvider.NOIR]: {
    name: 'Noir',
    supportedLevels: [PrivacyLevel.ZK_PROVEN],
  },
  [PrivacyProvider.PRIVACY_CASH]: {
    name: 'Privacy Cash',
    supportedLevels: [PrivacyLevel.COMPLIANT_POOL, PrivacyLevel.SENDER_HIDDEN],
  },
  [PrivacyProvider.INCO]: {
    name: 'Inco',
    supportedLevels: [PrivacyLevel.FULL_ENCRYPTED],
  },
};

/**
 * Token selector component
 */
function TokenSelector({
  value,
  onChange,
  tokens,
}: {
  value: string;
  onChange: (token: string) => void;
  tokens: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-privacy-500 text-slate-900 dark:text-white"
    >
      {tokens.map((token) => (
        <option key={token} value={token}>
          {token}
        </option>
      ))}
    </select>
  );
}

/**
 * Privacy level selector component
 */
function PrivacyLevelSelector({
  value,
  onChange,
  availableLevels,
}: {
  value: PrivacyLevel;
  onChange: (level: PrivacyLevel) => void;
  availableLevels: PrivacyLevel[];
}) {
  return (
    <div className="space-y-3">
      {availableLevels.map((level) => {
        const info = PRIVACY_LEVEL_INFO[level];
        const isSelected = value === level;

        return (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
              isSelected
                ? `border-${info.color}-500 bg-${info.color}-50 dark:bg-${info.color}-900/20`
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      isSelected ? `bg-${info.color}-500` : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                  <span
                    className={`font-medium ${
                      isSelected
                        ? `text-${info.color}-700 dark:text-${info.color}-300`
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {info.name}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 ml-5">
                  {info.description}
                </p>
              </div>
              {isSelected && (
                <svg
                  className={`w-5 h-5 text-${info.color}-500`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Fee estimate display component
 */
function FeeEstimate({
  fee,
  token,
  latencyMs,
  anonymitySet,
  isLoading,
}: {
  fee: number;
  token: string;
  latencyMs: number;
  anonymitySet?: number;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-2">
        <div className="h-4 w-24 shimmer rounded" />
        <div className="h-4 w-32 shimmer rounded" />
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
      <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
        Estimated Costs
      </h4>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-500 dark:text-slate-400">Fee</p>
          <p className="font-medium text-slate-900 dark:text-white">
            {fee.toFixed(6)} {token}
          </p>
        </div>
        <div>
          <p className="text-slate-500 dark:text-slate-400">Est. Time</p>
          <p className="font-medium text-slate-900 dark:text-white">
            ~{(latencyMs / 1000).toFixed(0)}s
          </p>
        </div>
        {anonymitySet && (
          <div className="col-span-2">
            <p className="text-slate-500 dark:text-slate-400">Anonymity Set</p>
            <p className="font-medium text-green-600 dark:text-green-400">
              ~{anonymitySet.toLocaleString()} users
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Transaction result display
 */
function TransactionResult({
  signature,
  provider,
  privacyLevel,
  fee,
  onClose,
}: {
  signature: string;
  provider: PrivacyProvider;
  privacyLevel: PrivacyLevel;
  fee: number;
  onClose: () => void;
}) {
  const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

  return (
    <div className="p-6 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
            <svg
              className="w-6 h-6 text-green-600 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-green-700 dark:text-green-300">
              Transfer Complete!
            </h3>
            <p className="text-sm text-green-600 dark:text-green-400">
              Your private transfer was successful
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-green-100 dark:hover:bg-green-900 rounded-lg transition-colors"
        >
          <svg
            className="w-5 h-5 text-green-600 dark:text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-green-600 dark:text-green-400">Provider</span>
          <span className="font-medium text-green-700 dark:text-green-300">
            {PROVIDER_INFO[provider]?.name || provider}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-green-600 dark:text-green-400">Privacy Level</span>
          <span className="font-medium text-green-700 dark:text-green-300">
            {PRIVACY_LEVEL_INFO[privacyLevel]?.name || privacyLevel}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-green-600 dark:text-green-400">Fee Paid</span>
          <span className="font-medium text-green-700 dark:text-green-300">
            {fee.toFixed(6)}
          </span>
        </div>

        <div className="pt-3 border-t border-green-200 dark:border-green-800">
          <p className="text-xs text-green-600 dark:text-green-400 mb-2">
            Transaction Signature
          </p>
          <div className="flex items-center space-x-2">
            <code className="flex-1 text-xs bg-green-100 dark:bg-green-900 px-3 py-2 rounded-lg text-green-800 dark:text-green-200 truncate">
              {signature}
            </code>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-green-100 dark:bg-green-900 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
            >
              <svg
                className="w-4 h-4 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Main Private Transfer Form Component
 */
export function PrivateTransfer() {
  const { connected, publicKey } = useWallet();
  const { isInitialized, getSupportedTokens, getSupportedPrivacyLevels, getRecommendedProvider } =
    usePrivacyKit();
  const {
    executeTransfer,
    estimateFee,
    isLoading,
    isEstimating,
    error,
    result,
    estimate,
    reset,
  } = usePrivateTransfer();

  // Form state
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState('SOL');
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>(PrivacyLevel.AMOUNT_HIDDEN);
  const [selectedProvider, setSelectedProvider] = useState<PrivacyProvider | undefined>();
  const [memo, setMemo] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Get available tokens and privacy levels
  const supportedTokens = getSupportedTokens();
  const supportedLevels = getSupportedPrivacyLevels();

  // Fetch estimate when amount or privacy level changes
  useEffect(() => {
    const amountNum = parseFloat(amount);
    if (amountNum > 0 && isInitialized) {
      const timer = setTimeout(() => {
        estimateFee({
          amount: amountNum,
          token,
          privacy: privacyLevel,
        }).catch(console.error);
      }, 500); // Debounce

      return () => clearTimeout(timer);
    }
  }, [amount, token, privacyLevel, isInitialized, estimateFee]);

  // Handle form submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const amountNum = parseFloat(amount);
    if (!recipient || amountNum <= 0) {
      return;
    }

    try {
      await executeTransfer({
        recipient,
        amount: amountNum,
        token,
        privacy: privacyLevel,
        provider: selectedProvider,
        memo: memo || undefined,
      });
    } catch (err) {
      console.error('Transfer failed:', err);
    }
  };

  // Handle resetting form after successful transfer
  const handleReset = () => {
    reset();
    setRecipient('');
    setAmount('');
    setMemo('');
  };

  // Show result if transfer was successful
  if (result) {
    return (
      <TransactionResult
        signature={result.signature}
        provider={result.provider}
        privacyLevel={result.privacyLevel}
        fee={result.fee}
        onClose={handleReset}
      />
    );
  }

  // Show connect wallet message if not connected
  if (!connected) {
    return (
      <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-8 text-center">
        <svg
          className="w-12 h-12 mx-auto text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-semibold text-slate-700 dark:text-slate-200">
          Connect Your Wallet
        </h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Connect your Solana wallet to send private transfers
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
      <div className="p-6 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Private Transfer
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Send tokens privately using zero-knowledge proofs
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Recipient */}
        <div>
          <label
            htmlFor="recipient"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
          >
            Recipient Address
          </label>
          <input
            id="recipient"
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Enter Solana address..."
            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-privacy-500 text-slate-900 dark:text-white placeholder-slate-400"
            required
          />
        </div>

        {/* Amount and Token */}
        <div>
          <label
            htmlFor="amount"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
          >
            Amount
          </label>
          <div className="flex space-x-3">
            <input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="any"
              min="0"
              className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-privacy-500 text-slate-900 dark:text-white placeholder-slate-400"
              required
            />
            <TokenSelector
              value={token}
              onChange={setToken}
              tokens={supportedTokens.length > 0 ? supportedTokens : ['SOL', 'USDC', 'USDT']}
            />
          </div>
        </div>

        {/* Privacy Level */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Privacy Level
          </label>
          <PrivacyLevelSelector
            value={privacyLevel}
            onChange={setPrivacyLevel}
            availableLevels={
              supportedLevels.length > 0
                ? supportedLevels.filter((l) => l !== PrivacyLevel.NONE)
                : [
                    PrivacyLevel.AMOUNT_HIDDEN,
                    PrivacyLevel.SENDER_HIDDEN,
                    PrivacyLevel.FULL_ENCRYPTED,
                  ]
            }
          />
        </div>

        {/* Fee Estimate */}
        {(estimate || isEstimating) && (
          <FeeEstimate
            fee={estimate?.fee || 0}
            token={token}
            latencyMs={estimate?.latencyMs || 0}
            anonymitySet={estimate?.anonymitySet}
            isLoading={isEstimating}
          />
        )}

        {/* Advanced Options */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <span>Advanced Options</span>
            <svg
              className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
              <div>
                <label
                  htmlFor="memo"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  Memo (Optional)
                </label>
                <input
                  id="memo"
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Add a note to this transfer..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-privacy-500 text-slate-900 dark:text-white placeholder-slate-400 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Preferred Provider (Optional)
                </label>
                <select
                  value={selectedProvider || ''}
                  onChange={(e) =>
                    setSelectedProvider(
                      e.target.value ? (e.target.value as PrivacyProvider) : undefined
                    )
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-privacy-500 text-slate-900 dark:text-white text-sm"
                >
                  <option value="">Auto-select best provider</option>
                  {Object.entries(PROVIDER_INFO).map(([provider, info]) => (
                    <option key={provider} value={provider}>
                      {info.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
            <div className="flex items-start space-x-3">
              <svg
                className="w-5 h-5 text-red-500 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="font-medium text-red-700 dark:text-red-300">
                  Transfer Failed
                </p>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  {error.message}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !recipient || !amount || parseFloat(amount) <= 0}
          className="w-full py-4 bg-privacy-600 hover:bg-privacy-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center space-x-2"
        >
          {isLoading ? (
            <>
              <svg
                className="w-5 h-5 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Processing Transfer...</span>
            </>
          ) : (
            <>
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <span>Send Private Transfer</span>
            </>
          )}
        </button>

        {/* Security Notice */}
        <p className="text-xs text-center text-slate-500 dark:text-slate-400">
          Your transaction will be processed through our privacy network.
          <br />
          Transaction details will be protected according to your selected privacy level.
        </p>
      </form>
    </div>
  );
}

export default PrivateTransfer;
