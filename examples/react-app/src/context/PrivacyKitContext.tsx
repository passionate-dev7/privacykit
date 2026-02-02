'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  PrivacyLevel,
  PrivacyProvider,
  TransferRequest,
  TransferResult,
  DepositRequest,
  DepositResult,
  WithdrawRequest,
  WithdrawResult,
  EstimateResult,
  BalanceResult,
  NetworkCluster,
  WalletAdapter,
} from '@privacykit/sdk';
import {
  ShadowWireAdapter,
  ArciumAdapter,
  PrivacyCashAdapter,
  createAdapter,
} from '@privacykit/sdk/adapters';
import { PrivacyRouter } from '@privacykit/sdk/core/router';

interface PrivacyKitContextValue {
  // State
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
  network: NetworkCluster;
  availableProviders: PrivacyProvider[];

  // Balances
  balances: Partial<Record<string, BalanceResult>>;
  refreshBalances: () => Promise<void>;

  // Transfer operations
  transfer: (request: TransferRequest) => Promise<TransferResult>;
  deposit: (request: DepositRequest) => Promise<DepositResult>;
  withdraw: (request: WithdrawRequest) => Promise<WithdrawResult>;
  estimate: (
    operation: 'transfer' | 'deposit' | 'withdraw',
    params: { amount: number; token: string; privacy?: PrivacyLevel }
  ) => Promise<EstimateResult>;

  // Router
  getRecommendedProvider: (
    request: TransferRequest
  ) => Promise<{ provider: PrivacyProvider; explanation: string }>;

  // Utils
  getSupportedTokens: (provider?: PrivacyProvider) => string[];
  getSupportedPrivacyLevels: (provider?: PrivacyProvider) => PrivacyLevel[];
}

const PrivacyKitContext = createContext<PrivacyKitContextValue | null>(null);

interface PrivacyKitProviderProps {
  children: ReactNode;
  network?: NetworkCluster;
  providers?: PrivacyProvider[];
}

export function PrivacyKitProvider({
  children,
  network = 'devnet',
  providers = [
    PrivacyProvider.SHADOWWIRE,
    PrivacyProvider.ARCIUM,
    PrivacyProvider.PRIVACY_CASH,
  ],
}: PrivacyKitProviderProps) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [balances, setBalances] = useState<Partial<Record<string, BalanceResult>>>({});
  const [adapters, setAdapters] = useState<Map<PrivacyProvider, ReturnType<typeof createAdapter>>>(new Map());
  const [router, setRouter] = useState<PrivacyRouter | null>(null);

  // Initialize adapters when wallet connects
  useEffect(() => {
    if (!wallet.connected || !wallet.publicKey) {
      setIsInitialized(false);
      return;
    }

    const initAdapters = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const newAdapters = new Map<PrivacyProvider, ReturnType<typeof createAdapter>>();
        const newRouter = new PrivacyRouter();

        // Create wallet adapter compatible with PrivacyKit
        const privacyKitWallet: WalletAdapter = {
          publicKey: wallet.publicKey!,
          signTransaction: wallet.signTransaction!,
          signAllTransactions: wallet.signAllTransactions!,
          signMessage: wallet.signMessage!,
        };

        // Initialize each provider
        for (const provider of providers) {
          try {
            const adapter = createAdapter(provider);
            await adapter.initialize(connection, privacyKitWallet);
            newAdapters.set(provider, adapter);
            newRouter.registerAdapter(adapter);
          } catch (err) {
            console.warn(`Failed to initialize ${provider}:`, err);
          }
        }

        setAdapters(newAdapters);
        setRouter(newRouter);
        setIsInitialized(true);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to initialize PrivacyKit'));
      } finally {
        setIsLoading(false);
      }
    };

    initAdapters();
  }, [wallet.connected, wallet.publicKey, connection, providers]);

  // Refresh balances for all tokens
  const refreshBalances = useCallback(async () => {
    if (!isInitialized || !wallet.publicKey) return;

    setIsLoading(true);
    try {
      const newBalances: Partial<Record<string, BalanceResult>> = {};
      const tokens = ['SOL', 'USDC', 'USDT'];

      for (const token of tokens) {
        const shielded: Partial<Record<PrivacyProvider, number>> = {};

        for (const [provider, adapter] of adapters) {
          try {
            if (adapter.supportedTokens.includes(token)) {
              const balance = await adapter.getBalance(token);
              shielded[provider] = balance;
            }
          } catch (err) {
            console.warn(`Failed to get ${token} balance from ${provider}:`, err);
          }
        }

        const totalShielded = Object.values(shielded).reduce((a, b) => a + (b || 0), 0);

        newBalances[token] = {
          public: 0, // Would need to fetch from chain
          shielded,
          total: totalShielded,
          token,
        };
      }

      setBalances(newBalances);
    } catch (err) {
      console.error('Failed to refresh balances:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, wallet.publicKey, adapters]);

  // Transfer function
  const transfer = useCallback(
    async (request: TransferRequest): Promise<TransferResult> => {
      if (!isInitialized || !router) {
        throw new Error('PrivacyKit not initialized');
      }

      setIsLoading(true);
      setError(null);

      try {
        // If specific provider requested, use it
        if (request.provider) {
          const adapter = adapters.get(request.provider);
          if (!adapter) {
            throw new Error(`Provider ${request.provider} not available`);
          }
          return await adapter.transfer(request);
        }

        // Otherwise, use router to select best provider
        const recommendation = await router.getRecommendation(request);
        return await recommendation.recommended.adapter.transfer(request);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Transfer failed');
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [isInitialized, router, adapters]
  );

  // Deposit function
  const deposit = useCallback(
    async (request: DepositRequest): Promise<DepositResult> => {
      if (!isInitialized) {
        throw new Error('PrivacyKit not initialized');
      }

      setIsLoading(true);
      setError(null);

      try {
        const provider = request.provider || PrivacyProvider.SHADOWWIRE;
        const adapter = adapters.get(provider);
        if (!adapter) {
          throw new Error(`Provider ${provider} not available`);
        }
        return await adapter.deposit(request);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Deposit failed');
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [isInitialized, adapters]
  );

  // Withdraw function
  const withdraw = useCallback(
    async (request: WithdrawRequest): Promise<WithdrawResult> => {
      if (!isInitialized) {
        throw new Error('PrivacyKit not initialized');
      }

      setIsLoading(true);
      setError(null);

      try {
        const provider = request.provider || PrivacyProvider.SHADOWWIRE;
        const adapter = adapters.get(provider);
        if (!adapter) {
          throw new Error(`Provider ${provider} not available`);
        }
        return await adapter.withdraw(request);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Withdraw failed');
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [isInitialized, adapters]
  );

  // Estimate function
  const estimate = useCallback(
    async (
      operation: 'transfer' | 'deposit' | 'withdraw',
      params: { amount: number; token: string; privacy?: PrivacyLevel }
    ): Promise<EstimateResult> => {
      // Use ShadowWire as default for estimates
      const adapter = adapters.get(PrivacyProvider.SHADOWWIRE) || adapters.values().next().value;
      if (!adapter) {
        return {
          fee: 0,
          provider: PrivacyProvider.SHADOWWIRE,
          latencyMs: 0,
          warnings: ['No provider available'],
        };
      }

      return adapter.estimate({
        operation,
        amount: params.amount,
        token: params.token,
        privacy: params.privacy,
      });
    },
    [adapters]
  );

  // Get recommended provider
  const getRecommendedProvider = useCallback(
    async (
      request: TransferRequest
    ): Promise<{ provider: PrivacyProvider; explanation: string }> => {
      if (!router) {
        return {
          provider: PrivacyProvider.SHADOWWIRE,
          explanation: 'Router not initialized, defaulting to ShadowWire',
        };
      }

      const recommendation = await router.getRecommendation(request);
      return {
        provider: recommendation.recommended.provider,
        explanation: recommendation.explanation,
      };
    },
    [router]
  );

  // Get supported tokens
  const getSupportedTokens = useCallback(
    (provider?: PrivacyProvider): string[] => {
      if (provider) {
        const adapter = adapters.get(provider);
        return adapter?.supportedTokens || [];
      }

      // Return union of all supported tokens
      const tokens = new Set<string>();
      for (const adapter of adapters.values()) {
        for (const token of adapter.supportedTokens) {
          tokens.add(token);
        }
      }
      return Array.from(tokens);
    },
    [adapters]
  );

  // Get supported privacy levels
  const getSupportedPrivacyLevels = useCallback(
    (provider?: PrivacyProvider): PrivacyLevel[] => {
      if (provider) {
        const adapter = adapters.get(provider);
        return adapter?.supportedLevels || [];
      }

      // Return union of all supported levels
      const levels = new Set<PrivacyLevel>();
      for (const adapter of adapters.values()) {
        for (const level of adapter.supportedLevels) {
          levels.add(level);
        }
      }
      return Array.from(levels);
    },
    [adapters]
  );

  const value: PrivacyKitContextValue = {
    isInitialized,
    isLoading,
    error,
    network,
    availableProviders: Array.from(adapters.keys()),
    balances,
    refreshBalances,
    transfer,
    deposit,
    withdraw,
    estimate,
    getRecommendedProvider,
    getSupportedTokens,
    getSupportedPrivacyLevels,
  };

  return (
    <PrivacyKitContext.Provider value={value}>
      {children}
    </PrivacyKitContext.Provider>
  );
}

export function usePrivacyKit(): PrivacyKitContextValue {
  const context = useContext(PrivacyKitContext);
  if (!context) {
    throw new Error('usePrivacyKit must be used within a PrivacyKitProvider');
  }
  return context;
}
