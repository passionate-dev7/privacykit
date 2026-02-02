'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { Connection } from '@solana/web3.js';
import type {
  PrivacyKitConfig,
  NetworkCluster,
  PrivacyProvider,
  PrivacyProviderAdapter,
  WalletAdapter,
  TransferRequest,
  TransferResult,
  DepositRequest,
  DepositResult,
  WithdrawRequest,
  WithdrawResult,
  EstimateRequest,
  EstimateResult,
  BalanceResult,
  PrivacyLevel,
} from '@privacykit/sdk';
import { PrivacyRouter } from '@privacykit/sdk';

/**
 * State of the PrivacyKit context
 */
export interface PrivacyKitState {
  /** Whether PrivacyKit is initialized and ready */
  isReady: boolean;
  /** Whether initialization is in progress */
  isInitializing: boolean;
  /** Available privacy providers */
  providers: PrivacyProvider[];
  /** Current network cluster */
  network: NetworkCluster;
  /** Any initialization error */
  error: Error | null;
}

/**
 * PrivacyKit context value
 */
export interface PrivacyKitContextValue extends PrivacyKitState {
  /** The privacy router for provider selection */
  router: PrivacyRouter | null;
  /** Execute a private transfer */
  transfer: (request: TransferRequest) => Promise<TransferResult>;
  /** Deposit into a privacy pool */
  deposit: (request: DepositRequest) => Promise<DepositResult>;
  /** Withdraw from a privacy pool */
  withdraw: (request: WithdrawRequest) => Promise<WithdrawResult>;
  /** Get balance for a token across all providers */
  getBalance: (token: string) => Promise<BalanceResult>;
  /** Estimate cost for an operation */
  estimate: (request: EstimateRequest) => Promise<EstimateResult>;
  /** Get a specific provider adapter */
  getAdapter: (provider: PrivacyProvider) => PrivacyProviderAdapter | undefined;
  /** Refresh state (e.g., after wallet change) */
  refresh: () => Promise<void>;
}

/**
 * Props for PrivacyKitProvider
 */
export interface PrivacyKitProviderProps {
  children: ReactNode;
  /** Network cluster to use */
  network?: NetworkCluster;
  /** Custom RPC URL (optional) */
  rpcUrl?: string;
  /** Which providers to enable (all enabled by default) */
  providers?: PrivacyProvider[];
  /** Enable debug logging */
  debug?: boolean;
  /** Custom RPC headers */
  rpcHeaders?: Record<string, string>;
  /** Auto-initialize on mount (default: true) */
  autoInit?: boolean;
  /** Called when initialization completes */
  onReady?: (providers: PrivacyProvider[]) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
}

// Create context with undefined default
const PrivacyKitContext = createContext<PrivacyKitContextValue | undefined>(undefined);

/**
 * Convert wallet adapter from @solana/wallet-adapter-react to PrivacyKit format
 */
function adaptWallet(
  walletPublicKey: ReturnType<typeof useWallet>['publicKey'],
  signTransaction: ReturnType<typeof useWallet>['signTransaction'],
  signAllTransactions: ReturnType<typeof useWallet>['signAllTransactions'],
  signMessage: ReturnType<typeof useWallet>['signMessage']
): WalletAdapter | undefined {
  if (!walletPublicKey || !signTransaction || !signAllTransactions || !signMessage) {
    return undefined;
  }

  return {
    publicKey: walletPublicKey,
    signTransaction: signTransaction as WalletAdapter['signTransaction'],
    signAllTransactions: signAllTransactions as WalletAdapter['signAllTransactions'],
    signMessage,
  };
}

/**
 * PrivacyKitProvider
 *
 * Provides PrivacyKit context to child components.
 * Must be wrapped by ConnectionProvider and WalletProvider from @solana/wallet-adapter-react.
 *
 * @example
 * ```tsx
 * <ConnectionProvider endpoint={endpoint}>
 *   <WalletProvider wallets={wallets}>
 *     <PrivacyKitProvider network="devnet">
 *       <App />
 *     </PrivacyKitProvider>
 *   </WalletProvider>
 * </ConnectionProvider>
 * ```
 */
export function PrivacyKitProvider({
  children,
  network = 'devnet',
  rpcUrl,
  providers: enabledProviders,
  debug = false,
  rpcHeaders,
  autoInit = true,
  onReady,
  onError,
}: PrivacyKitProviderProps) {
  const { connection } = useConnection();
  const {
    publicKey,
    signTransaction,
    signAllTransactions,
    signMessage,
    connected,
  } = useWallet();

  // State
  const [state, setState] = useState<PrivacyKitState>({
    isReady: false,
    isInitializing: false,
    providers: [],
    network,
    error: null,
  });

  const [router, setRouter] = useState<PrivacyRouter | null>(null);

  // Convert wallet adapter
  const walletAdapter = useMemo(
    () => adaptWallet(publicKey, signTransaction, signAllTransactions, signMessage),
    [publicKey, signTransaction, signAllTransactions, signMessage]
  );

  // Initialize PrivacyKit
  const initialize = useCallback(async () => {
    if (state.isInitializing) return;

    setState((prev) => ({
      ...prev,
      isInitializing: true,
      error: null,
    }));

    try {
      // Create router
      const newRouter = new PrivacyRouter();

      // Import and initialize adapters dynamically based on enabled providers
      const adaptersToInit: PrivacyProviderAdapter[] = [];

      // Dynamically import adapters
      const { ShadowWireAdapter } = await import('@privacykit/sdk');
      const { ArciumAdapter } = await import('@privacykit/sdk');
      const { NoirAdapter } = await import('@privacykit/sdk');
      const { PrivacyCashAdapter } = await import('@privacykit/sdk');

      const allAdapters: Record<PrivacyProvider, new () => PrivacyProviderAdapter> = {
        shadowwire: ShadowWireAdapter,
        arcium: ArciumAdapter,
        noir: NoirAdapter,
        privacycash: PrivacyCashAdapter,
        inco: ShadowWireAdapter, // Placeholder
      };

      const providersToEnable = enabledProviders || [
        'shadowwire' as PrivacyProvider,
        'arcium' as PrivacyProvider,
        'noir' as PrivacyProvider,
        'privacycash' as PrivacyProvider,
      ];

      for (const provider of providersToEnable) {
        const AdapterClass = allAdapters[provider];
        if (AdapterClass) {
          const adapter = new AdapterClass();
          adaptersToInit.push(adapter);
        }
      }

      // Initialize all adapters
      const initializedProviders: PrivacyProvider[] = [];
      for (const adapter of adaptersToInit) {
        try {
          await adapter.initialize(connection, walletAdapter);
          newRouter.registerAdapter(adapter);
          initializedProviders.push(adapter.provider);
          if (debug) {
            console.log(`[PrivacyKit] Initialized ${adapter.name}`);
          }
        } catch (err) {
          if (debug) {
            console.warn(`[PrivacyKit] Failed to initialize ${adapter.name}:`, err);
          }
        }
      }

      setRouter(newRouter);
      setState({
        isReady: true,
        isInitializing: false,
        providers: initializedProviders,
        network,
        error: null,
      });

      onReady?.(initializedProviders);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState((prev) => ({
        ...prev,
        isInitializing: false,
        error,
      }));
      onError?.(error);
    }
  }, [
    connection,
    walletAdapter,
    enabledProviders,
    network,
    debug,
    onReady,
    onError,
    state.isInitializing,
  ]);

  // Auto-initialize
  useEffect(() => {
    if (autoInit && !state.isReady && !state.isInitializing) {
      initialize();
    }
  }, [autoInit, initialize, state.isReady, state.isInitializing]);

  // Update wallet in adapters when it changes
  useEffect(() => {
    if (router && walletAdapter) {
      for (const adapter of router.getAdapters()) {
        if ('setWallet' in adapter && typeof adapter.setWallet === 'function') {
          (adapter as { setWallet: (wallet: WalletAdapter) => void }).setWallet(walletAdapter);
        }
      }
    }
  }, [router, walletAdapter]);

  // Transfer function
  const transfer = useCallback(
    async (request: TransferRequest): Promise<TransferResult> => {
      if (!router) {
        throw new Error('PrivacyKit not initialized');
      }
      if (!walletAdapter) {
        throw new Error('Wallet not connected');
      }

      const selection = await router.selectProvider({
        privacyLevel: request.privacy,
        token: request.token,
        amount: request.amount,
        maxFee: request.options?.maxFee,
        preferredProvider: request.provider,
      });

      return selection.adapter.transfer(request);
    },
    [router, walletAdapter]
  );

  // Deposit function
  const deposit = useCallback(
    async (request: DepositRequest): Promise<DepositResult> => {
      if (!router) {
        throw new Error('PrivacyKit not initialized');
      }
      if (!walletAdapter) {
        throw new Error('Wallet not connected');
      }

      const adapter = request.provider
        ? router.getAdapter(request.provider)
        : router.getAdapters()[0];

      if (!adapter) {
        throw new Error('No suitable provider available');
      }

      return adapter.deposit(request);
    },
    [router, walletAdapter]
  );

  // Withdraw function
  const withdraw = useCallback(
    async (request: WithdrawRequest): Promise<WithdrawResult> => {
      if (!router) {
        throw new Error('PrivacyKit not initialized');
      }
      if (!walletAdapter) {
        throw new Error('Wallet not connected');
      }

      const adapter = request.provider
        ? router.getAdapter(request.provider)
        : router.getAdapters()[0];

      if (!adapter) {
        throw new Error('No suitable provider available');
      }

      return adapter.withdraw(request);
    },
    [router, walletAdapter]
  );

  // Get balance across providers
  const getBalance = useCallback(
    async (token: string): Promise<BalanceResult> => {
      if (!router) {
        throw new Error('PrivacyKit not initialized');
      }

      const shielded: Partial<Record<PrivacyProvider, number>> = {};
      let publicBalance = 0;

      for (const adapter of router.getAdapters()) {
        try {
          const balance = await adapter.getBalance(token);
          shielded[adapter.provider] = balance;
        } catch {
          // Provider doesn't support this token or failed
          shielded[adapter.provider] = 0;
        }
      }

      // Sum up shielded balances
      const totalShielded = Object.values(shielded).reduce((sum, val) => sum + (val || 0), 0);

      return {
        public: publicBalance,
        shielded,
        total: publicBalance + totalShielded,
        token,
      };
    },
    [router]
  );

  // Estimate cost
  const estimate = useCallback(
    async (request: EstimateRequest): Promise<EstimateResult> => {
      if (!router) {
        throw new Error('PrivacyKit not initialized');
      }

      if (request.provider) {
        const adapter = router.getAdapter(request.provider);
        if (!adapter) {
          throw new Error(`Provider ${request.provider} not available`);
        }
        return adapter.estimate(request);
      }

      // Use router to find best provider
      const selection = await router.selectProvider({
        privacyLevel: request.privacy || ('amount-hidden' as PrivacyLevel),
        token: request.token || 'SOL',
        amount: request.amount,
      });

      return selection.estimate;
    },
    [router]
  );

  // Get specific adapter
  const getAdapter = useCallback(
    (provider: PrivacyProvider): PrivacyProviderAdapter | undefined => {
      return router?.getAdapter(provider);
    },
    [router]
  );

  // Refresh state
  const refresh = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      isReady: false,
      isInitializing: false,
    }));
    await initialize();
  }, [initialize]);

  // Context value
  const value = useMemo<PrivacyKitContextValue>(
    () => ({
      ...state,
      router,
      transfer,
      deposit,
      withdraw,
      getBalance,
      estimate,
      getAdapter,
      refresh,
    }),
    [state, router, transfer, deposit, withdraw, getBalance, estimate, getAdapter, refresh]
  );

  return (
    <PrivacyKitContext.Provider value={value}>
      {children}
    </PrivacyKitContext.Provider>
  );
}

/**
 * Hook to access PrivacyKit context
 * Must be used within a PrivacyKitProvider
 *
 * @throws Error if used outside of PrivacyKitProvider
 */
export function usePrivacyKitContext(): PrivacyKitContextValue {
  const context = useContext(PrivacyKitContext);
  if (context === undefined) {
    throw new Error('usePrivacyKitContext must be used within a PrivacyKitProvider');
  }
  return context;
}

export { PrivacyKitContext };
