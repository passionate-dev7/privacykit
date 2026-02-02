'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PrivacyProvider } from '@privacykit/sdk';
import {
  usePrivateBalance,
  useAllPrivateBalances,
  useBalanceByProvider,
} from '@/hooks/usePrivateBalance';
import { usePrivacyKit } from '@/context/PrivacyKitContext';

/**
 * Token icon component
 */
function TokenIcon({ token }: { token: string }) {
  const icons: Record<string, string> = {
    SOL: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    USDC: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    USDT: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
  };

  return (
    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
      {icons[token] ? (
        <img src={icons[token]} alt={token} className="w-full h-full object-cover" />
      ) : (
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
          {token.slice(0, 2)}
        </span>
      )}
    </div>
  );
}

/**
 * Provider badge component
 */
function ProviderBadge({ provider }: { provider: PrivacyProvider }) {
  const colors: Record<PrivacyProvider, string> = {
    [PrivacyProvider.SHADOWWIRE]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    [PrivacyProvider.ARCIUM]: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    [PrivacyProvider.NOIR]: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    [PrivacyProvider.PRIVACY_CASH]: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    [PrivacyProvider.INCO]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };

  const names: Record<PrivacyProvider, string> = {
    [PrivacyProvider.SHADOWWIRE]: 'ShadowWire',
    [PrivacyProvider.ARCIUM]: 'Arcium',
    [PrivacyProvider.NOIR]: 'Noir',
    [PrivacyProvider.PRIVACY_CASH]: 'Privacy Cash',
    [PrivacyProvider.INCO]: 'Inco',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[provider]}`}>
      {names[provider]}
    </span>
  );
}

/**
 * Single token balance card
 */
interface BalanceCardProps {
  token: string;
  showProviderBreakdown?: boolean;
}

export function BalanceCard({ token, showProviderBreakdown = false }: BalanceCardProps) {
  const { balance, isLoading, error, refresh } = usePrivateBalance(token);
  const { balanceByProvider, totalShielded } = useBalanceByProvider(token);
  const [isExpanded, setIsExpanded] = useState(false);

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <p className="text-red-600 dark:text-red-400 text-sm">
          Failed to load {token} balance
        </p>
        <button
          onClick={refresh}
          className="mt-2 text-xs text-red-700 dark:text-red-300 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Main balance display */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <TokenIcon token={token} />
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">{token}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Private Balance</p>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`}
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
          </button>
        </div>

        {/* Balance amount */}
        <div className="mt-4">
          {isLoading ? (
            <div className="h-8 w-32 shimmer rounded" />
          ) : (
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                {totalShielded.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 6,
                })}
              </span>
              <span className="text-slate-500 dark:text-slate-400">{token}</span>
            </div>
          )}
        </div>

        {/* Privacy shield indicator */}
        <div className="mt-3 flex items-center space-x-2">
          <svg
            className="w-4 h-4 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <span className="text-xs text-green-600 dark:text-green-400">
            Shielded Balance
          </span>
        </div>
      </div>

      {/* Provider breakdown (collapsible) */}
      {showProviderBreakdown && Object.keys(balanceByProvider).length > 0 && (
        <>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <span>Provider Breakdown</span>
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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

          {isExpanded && (
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 space-y-2">
              {Object.entries(balanceByProvider).map(([provider, amount]) => (
                <div
                  key={provider}
                  className="flex items-center justify-between text-sm"
                >
                  <ProviderBadge provider={provider as PrivacyProvider} />
                  <span className="font-medium text-slate-900 dark:text-white">
                    {(amount || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}{' '}
                    {token}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * All balances overview component
 */
export function BalanceOverview() {
  const { connected } = useWallet();
  const { balances, isLoading, refresh } = useAllPrivateBalances();
  const { isInitialized, availableProviders } = usePrivacyKit();

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
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-semibold text-slate-700 dark:text-slate-200">
          Connect Your Wallet
        </h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Connect your wallet to view your private balances
        </p>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="space-y-4">
        <div className="h-32 shimmer rounded-xl" />
        <div className="h-32 shimmer rounded-xl" />
        <div className="h-32 shimmer rounded-xl" />
      </div>
    );
  }

  const tokens = ['SOL', 'USDC', 'USDT'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Private Balances
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your shielded assets across {availableProviders.length} providers
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center space-x-2 px-4 py-2 bg-privacy-600 hover:bg-privacy-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <svg
            className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
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
          <span>Refresh</span>
        </button>
      </div>

      {/* Active providers */}
      <div className="flex flex-wrap gap-2">
        {availableProviders.map((provider) => (
          <ProviderBadge key={provider} provider={provider} />
        ))}
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tokens.map((token) => (
          <BalanceCard key={token} token={token} showProviderBreakdown />
        ))}
      </div>

      {/* Total value (simplified) */}
      <div className="bg-gradient-to-r from-privacy-600 to-privacy-800 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-privacy-100 text-sm">Total Shielded Value</p>
            <p className="text-3xl font-bold mt-1">
              {Object.entries(balances).reduce((total, [token, balance]) => {
                // Simplified - would need price oracle for real USD value
                return total + (balance?.total || 0);
              }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
              <span className="text-lg font-normal text-privacy-200">tokens</span>
            </p>
          </div>
          <div className="p-4 bg-white/10 rounded-full">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BalanceOverview;
