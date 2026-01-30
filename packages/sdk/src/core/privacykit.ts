import { Connection } from '@solana/web3.js';
import EventEmitter from 'eventemitter3';
import type {
  PrivacyKitConfig,
  PrivacyProvider,
  PrivacyProviderAdapter,
  WalletAdapter,
  TransferRequest,
  TransferResult,
  DepositRequest,
  DepositResult,
  WithdrawRequest,
  WithdrawResult,
  ProveRequest,
  ProveResult,
  BalanceResult,
  EstimateRequest,
  EstimateResult,
  PipelineStep,
  PipelineResult,
  NetworkCluster,
  PrivacyLevel,
} from '../types';
import { PrivacyProvider as PP, PrivacyLevel as PL } from '../types';
import { PrivacyRouter, SelectionCriteria } from './router';
import { createAdapter, getAllAdapters } from '../adapters';
import { NoirAdapter } from '../adapters/noir';
import {
  Logger,
  LogLevel,
  defaultLogger,
  createDebugLogger,
} from '../utils/logger';
import {
  PrivacyKitError,
  ProviderNotAvailableError,
  WalletNotConnectedError,
  UnsupportedPrivacyLevelError,
  UnsupportedTokenError,
  wrapError,
} from '../utils/errors';
import {
  DEFAULT_RPC_ENDPOINTS,
  VERSION,
} from '../utils/constants';
import { toPublicKey, retry, isValidPublicKey } from '../utils';

/**
 * Event types emitted by PrivacyKit
 */
export interface PrivacyKitEvents {
  initialized: (providers: PrivacyProvider[]) => void;
  'wallet:connected': (publicKey: string) => void;
  'wallet:disconnected': () => void;
  'transfer:start': (request: TransferRequest) => void;
  'transfer:complete': (result: TransferResult) => void;
  'transfer:error': (error: Error, request: TransferRequest) => void;
  'deposit:start': (request: DepositRequest) => void;
  'deposit:complete': (result: DepositResult) => void;
  'deposit:error': (error: Error, request: DepositRequest) => void;
  'withdraw:start': (request: WithdrawRequest) => void;
  'withdraw:complete': (result: WithdrawResult) => void;
  'withdraw:error': (error: Error, request: WithdrawRequest) => void;
  'prove:start': (request: ProveRequest) => void;
  'prove:complete': (result: ProveResult) => void;
  'prove:error': (error: Error, request: ProveRequest) => void;
  'pipeline:start': (steps: PipelineStep[]) => void;
  'pipeline:step': (step: PipelineStep, index: number) => void;
  'pipeline:complete': (result: PipelineResult) => void;
  'pipeline:error': (error: Error, stepIndex: number) => void;
  error: (error: Error) => void;
}

/**
 * Pipeline builder for chaining privacy operations
 */
export class PipelineBuilder {
  private steps: PipelineStep[] = [];
  private privacyKit: PrivacyKit;

  constructor(privacyKit: PrivacyKit) {
    this.privacyKit = privacyKit;
  }

  /**
   * Add a deposit step to the pipeline
   */
  deposit(params: {
    amount: number;
    token: string;
    provider?: PrivacyProvider;
  }): this {
    this.steps.push({
      type: 'deposit',
      provider: params.provider,
      params: {
        amount: params.amount,
        token: params.token,
      },
    });
    return this;
  }

  /**
   * Add a transfer step to the pipeline
   */
  transfer(params: {
    recipient: string;
    amount: number;
    token: string;
    privacy: PrivacyLevel;
    provider?: PrivacyProvider;
  }): this {
    this.steps.push({
      type: 'transfer',
      provider: params.provider,
      params: {
        recipient: params.recipient,
        amount: params.amount,
        token: params.token,
        privacy: params.privacy,
      },
    });
    return this;
  }

  /**
   * Add a withdrawal step to the pipeline
   */
  withdraw(params: {
    recipient: string;
    amount: number;
    token: string;
    provider?: PrivacyProvider;
    commitment?: string;
  }): this {
    this.steps.push({
      type: 'withdraw',
      provider: params.provider,
      params: {
        recipient: params.recipient,
        amount: params.amount,
        token: params.token,
        commitment: params.commitment,
      },
    });
    return this;
  }

  /**
   * Add a ZK prove step to the pipeline
   */
  prove(params: {
    circuit: string;
    publicInputs: Record<string, unknown>;
    privateInputs: Record<string, unknown>;
    provider?: PrivacyProvider;
  }): this {
    this.steps.push({
      type: 'prove',
      provider: params.provider || PP.NOIR,
      params: {
        circuit: params.circuit,
        publicInputs: params.publicInputs,
        privateInputs: params.privateInputs,
      },
    });
    return this;
  }

  /**
   * Add a wait/delay step to the pipeline
   */
  wait(durationMs: number): this {
    this.steps.push({
      type: 'wait',
      params: { durationMs },
    });
    return this;
  }

  /**
   * Get the current steps in the pipeline
   */
  getSteps(): PipelineStep[] {
    return [...this.steps];
  }

  /**
   * Clear all steps from the pipeline
   */
  clear(): this {
    this.steps = [];
    return this;
  }

  /**
   * Execute the pipeline
   */
  async execute(): Promise<PipelineResult> {
    return this.privacyKit.executePipeline(this.steps);
  }

  /**
   * Estimate total costs for the pipeline
   */
  async estimate(): Promise<{
    totalFee: number;
    totalLatencyMs: number;
    steps: EstimateResult[];
  }> {
    const estimates: EstimateResult[] = [];
    let totalFee = 0;
    let totalLatencyMs = 0;

    for (const step of this.steps) {
      if (step.type === 'wait') {
        totalLatencyMs += (step.params.durationMs as number) || 0;
        continue;
      }

      const estimate = await this.privacyKit.estimate({
        operation: step.type as 'transfer' | 'deposit' | 'withdraw' | 'prove',
        amount: step.params.amount as number | undefined,
        token: step.params.token as string | undefined,
        privacy: step.params.privacy as PrivacyLevel | undefined,
        provider: step.provider,
      });

      estimates.push(estimate);
      totalFee += estimate.fee;
      totalLatencyMs += estimate.latencyMs;
    }

    return {
      totalFee,
      totalLatencyMs,
      steps: estimates,
    };
  }
}

/**
 * PrivacyKit - Main SDK Entry Point
 *
 * The unified interface for privacy-preserving transactions on Solana.
 * Supports multiple privacy providers (ShadowWire, Arcium, Noir, PrivacyCash)
 * with intelligent routing to select the optimal provider for each operation.
 *
 * @example
 * ```typescript
 * import { PrivacyKit, PrivacyLevel } from '@privacykit/sdk';
 *
 * const kit = new PrivacyKit({
 *   network: 'mainnet-beta',
 *   providers: ['shadowwire', 'arcium'],
 *   wallet: walletAdapter,
 * });
 *
 * await kit.initialize();
 *
 * // Simple private transfer
 * const result = await kit.transfer({
 *   recipient: 'recipient-address',
 *   amount: 1.5,
 *   token: 'SOL',
 *   privacy: PrivacyLevel.AMOUNT_HIDDEN,
 * });
 * ```
 */
export class PrivacyKit extends EventEmitter<PrivacyKitEvents> {
  private readonly config: Required<
    Pick<PrivacyKitConfig, 'network' | 'debug'>
  > &
    PrivacyKitConfig;
  private connection: Connection | null = null;
  private wallet: WalletAdapter | null = null;
  private router: PrivacyRouter;
  private adapters: Map<PrivacyProvider, PrivacyProviderAdapter> = new Map();
  private logger: Logger;
  private initialized = false;

  /**
   * Create a new PrivacyKit instance
   */
  constructor(config: PrivacyKitConfig) {
    super();

    // Apply defaults
    this.config = {
      ...config,
      network: config.network || 'mainnet-beta',
      debug: config.debug ?? false,
      providers: config.providers || [
        PP.SHADOWWIRE,
        PP.ARCIUM,
        PP.NOIR,
        PP.PRIVACY_CASH,
      ],
    };

    // Set up logging
    this.logger = this.config.debug
      ? createDebugLogger('[PrivacyKit]')
      : defaultLogger;

    // Initialize router
    this.router = new PrivacyRouter(this.logger.child('Router'));

    // Set wallet if provided
    if (config.wallet) {
      this.wallet = config.wallet;
    }

    this.logger.debug('PrivacyKit instance created', {
      network: this.config.network,
      providers: this.config.providers,
      debug: this.config.debug,
    });
  }

  /**
   * Initialize the SDK and all enabled adapters
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('PrivacyKit already initialized');
      return;
    }

    this.logger.info('Initializing PrivacyKit...');

    try {
      // Create Solana connection
      const rpcUrl = this.config.rpcUrl || DEFAULT_RPC_ENDPOINTS[this.config.network];
      this.connection = new Connection(rpcUrl, {
        commitment: 'confirmed',
        httpHeaders: this.config.rpcHeaders,
      });

      // Test connection
      await this.testConnection();

      // Initialize enabled adapters
      const enabledProviders = this.config.providers || [];
      const initPromises: Promise<void>[] = [];

      for (const provider of enabledProviders) {
        try {
          const adapter = createAdapter(provider);
          initPromises.push(
            adapter.initialize(this.connection, this.wallet || undefined).then(() => {
              this.adapters.set(provider, adapter);
              this.router.registerAdapter(adapter);
              this.logger.info(`Initialized adapter: ${adapter.name}`);
            })
          );
        } catch (error) {
          this.logger.warn(
            `Failed to create adapter for provider ${provider}:`,
            error
          );
        }
      }

      // Wait for all adapters to initialize (don't fail if some fail)
      const results = await Promise.allSettled(initPromises);
      const failedCount = results.filter((r) => r.status === 'rejected').length;

      if (failedCount > 0) {
        this.logger.warn(
          `${failedCount} adapter(s) failed to initialize, continuing with available adapters`
        );
      }

      if (this.adapters.size === 0) {
        throw new PrivacyKitError(
          'No adapters could be initialized',
          'NO_ADAPTERS_AVAILABLE'
        );
      }

      this.initialized = true;

      const initializedProviders = Array.from(this.adapters.keys());
      this.logger.info(
        `PrivacyKit initialized with ${this.adapters.size} adapter(s):`,
        initializedProviders
      );

      this.emit('initialized', initializedProviders);
    } catch (error) {
      const wrappedError = wrapError(error, 'Failed to initialize PrivacyKit');
      this.emit('error', wrappedError);
      throw wrappedError;
    }
  }

  /**
   * Test the Solana connection
   */
  private async testConnection(): Promise<void> {
    if (!this.connection) {
      throw new PrivacyKitError('Connection not established', 'NO_CONNECTION');
    }

    try {
      const version = await retry(
        () => this.connection!.getVersion(),
        { maxRetries: 3 }
      );
      this.logger.debug(`Connected to Solana ${version['solana-core']}`);
    } catch (error) {
      throw new PrivacyKitError(
        'Failed to connect to Solana RPC',
        'CONNECTION_FAILED',
        error as Error
      );
    }
  }

  /**
   * Ensure SDK is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new PrivacyKitError(
        'PrivacyKit not initialized. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }
  }

  /**
   * Ensure wallet is connected
   */
  private ensureWallet(): WalletAdapter {
    if (!this.wallet) {
      throw new WalletNotConnectedError();
    }
    return this.wallet;
  }

  /**
   * Connect a wallet adapter
   */
  connectWallet(wallet: WalletAdapter): void {
    this.wallet = wallet;

    // Update adapters with new wallet
    for (const adapter of this.adapters.values()) {
      if ('setWallet' in adapter && typeof adapter.setWallet === 'function') {
        (adapter as { setWallet: (w: WalletAdapter) => void }).setWallet(wallet);
      }
    }

    this.logger.info(`Wallet connected: ${wallet.publicKey.toBase58()}`);
    this.emit('wallet:connected', wallet.publicKey.toBase58());
  }

  /**
   * Disconnect the current wallet
   */
  disconnectWallet(): void {
    this.wallet = null;
    this.logger.info('Wallet disconnected');
    this.emit('wallet:disconnected');
  }

  /**
   * Get the current wallet
   */
  getWallet(): WalletAdapter | null {
    return this.wallet;
  }

  /**
   * Get the Solana connection
   */
  getConnection(): Connection {
    this.ensureInitialized();
    return this.connection!;
  }

  /**
   * Execute a private transfer
   *
   * @example
   * ```typescript
   * const result = await kit.transfer({
   *   recipient: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
   *   amount: 1.5,
   *   token: 'SOL',
   *   privacy: PrivacyLevel.AMOUNT_HIDDEN,
   * });
   * console.log('Transfer signature:', result.signature);
   * ```
   */
  async transfer(request: TransferRequest): Promise<TransferResult> {
    this.ensureInitialized();
    this.ensureWallet();

    this.logger.info('Initiating transfer', {
      amount: request.amount,
      token: request.token,
      privacy: request.privacy,
    });

    this.emit('transfer:start', request);

    try {
      // Select provider (use specified or auto-select)
      const adapter = await this.selectAdapter(request);

      // Execute transfer
      const result = await adapter.transfer(request);

      this.logger.info('Transfer complete', {
        signature: result.signature,
        provider: result.provider,
        fee: result.fee,
      });

      this.emit('transfer:complete', result);
      return result;
    } catch (error) {
      const wrappedError = wrapError(error, 'Transfer failed');
      this.emit('transfer:error', wrappedError, request);
      throw wrappedError;
    }
  }

  /**
   * Deposit tokens into a privacy pool
   *
   * @example
   * ```typescript
   * const result = await kit.deposit({
   *   amount: 10,
   *   token: 'USDC',
   *   provider: PrivacyProvider.SHADOWWIRE,
   * });
   * console.log('Deposit commitment:', result.commitment);
   * ```
   */
  async deposit(request: DepositRequest): Promise<DepositResult> {
    this.ensureInitialized();
    this.ensureWallet();

    this.logger.info('Initiating deposit', {
      amount: request.amount,
      token: request.token,
      provider: request.provider,
    });

    this.emit('deposit:start', request);

    try {
      // Select adapter
      const provider = request.provider || this.router.getDefaultProvider(PL.AMOUNT_HIDDEN);
      const adapter = this.getAdapter(provider);

      if (!adapter) {
        throw new ProviderNotAvailableError(provider);
      }

      const result = await adapter.deposit(request);

      this.logger.info('Deposit complete', {
        signature: result.signature,
        provider: result.provider,
        commitment: result.commitment,
      });

      this.emit('deposit:complete', result);
      return result;
    } catch (error) {
      const wrappedError = wrapError(error, 'Deposit failed');
      this.emit('deposit:error', wrappedError, request);
      throw wrappedError;
    }
  }

  /**
   * Withdraw tokens from a privacy pool
   *
   * @example
   * ```typescript
   * const result = await kit.withdraw({
   *   amount: 5,
   *   token: 'USDC',
   *   recipient: 'recipient-address',
   *   provider: PrivacyProvider.SHADOWWIRE,
   *   commitment: 'previous-deposit-commitment',
   * });
   * ```
   */
  async withdraw(request: WithdrawRequest): Promise<WithdrawResult> {
    this.ensureInitialized();
    this.ensureWallet();

    this.logger.info('Initiating withdrawal', {
      amount: request.amount,
      token: request.token,
      provider: request.provider,
    });

    this.emit('withdraw:start', request);

    try {
      // Select adapter
      const provider = request.provider || this.router.getDefaultProvider(PL.AMOUNT_HIDDEN);
      const adapter = this.getAdapter(provider);

      if (!adapter) {
        throw new ProviderNotAvailableError(provider);
      }

      const result = await adapter.withdraw(request);

      this.logger.info('Withdrawal complete', {
        signature: result.signature,
        provider: result.provider,
      });

      this.emit('withdraw:complete', result);
      return result;
    } catch (error) {
      const wrappedError = wrapError(error, 'Withdrawal failed');
      this.emit('withdraw:error', wrappedError, request);
      throw wrappedError;
    }
  }

  /**
   * Generate a zero-knowledge proof
   *
   * @example
   * ```typescript
   * const result = await kit.prove({
   *   circuit: 'balance-threshold',
   *   publicInputs: { threshold: 1000, commitment: '...' },
   *   privateInputs: { balance: 5000, salt: '...' },
   * });
   * ```
   */
  async prove(request: ProveRequest): Promise<ProveResult> {
    this.ensureInitialized();

    this.logger.info('Generating ZK proof', {
      circuit: request.circuit,
      provider: request.provider,
    });

    this.emit('prove:start', request);

    try {
      // Use Noir adapter for proofs
      const provider = request.provider || PP.NOIR;
      const adapter = this.getAdapter(provider);

      if (!adapter) {
        throw new ProviderNotAvailableError(provider);
      }

      // Check if adapter supports prove method
      if (!('prove' in adapter)) {
        throw new UnsupportedPrivacyLevelError(PL.ZK_PROVEN, provider);
      }

      const noirAdapter = adapter as NoirAdapter;
      const result = await noirAdapter.prove(request);

      this.logger.info('Proof generated', {
        provider: result.provider,
      });

      this.emit('prove:complete', result);
      return result;
    } catch (error) {
      const wrappedError = wrapError(error, 'Proof generation failed');
      this.emit('prove:error', wrappedError, request);
      throw wrappedError;
    }
  }

  /**
   * Get balance for a token (public and shielded)
   *
   * @example
   * ```typescript
   * const balance = await kit.getBalance('SOL');
   * console.log('Public:', balance.public);
   * console.log('Shielded (ShadowWire):', balance.shielded.shadowwire);
   * console.log('Total:', balance.total);
   * ```
   */
  async getBalance(token: string, address?: string): Promise<BalanceResult> {
    this.ensureInitialized();

    const walletAddress = address || this.wallet?.publicKey.toBase58();

    this.logger.debug('Getting balance', { token, address: walletAddress });

    // Get public balance from Solana
    let publicBalance = 0;

    if (this.connection && walletAddress) {
      try {
        if (token.toUpperCase() === 'SOL') {
          const pubkey = toPublicKey(walletAddress);
          const lamports = await this.connection.getBalance(pubkey);
          publicBalance = lamports / 1e9;
        } else {
          // For SPL tokens, would need to query token accounts
          // This is a simplified implementation
          publicBalance = 0;
        }
      } catch (error) {
        this.logger.warn('Failed to get public balance', error);
      }
    }

    // Get shielded balances from each provider
    const shielded: Partial<Record<PrivacyProvider, number>> = {};

    const balancePromises = Array.from(this.adapters.entries()).map(
      async ([provider, adapter]) => {
        try {
          const balance = await adapter.getBalance(token, walletAddress);
          return { provider, balance };
        } catch (error) {
          this.logger.warn(`Failed to get ${provider} balance`, error);
          return { provider, balance: 0 };
        }
      }
    );

    const results = await Promise.all(balancePromises);

    for (const { provider, balance } of results) {
      if (balance > 0) {
        shielded[provider] = balance;
      }
    }

    const totalShielded = Object.values(shielded).reduce((sum, b) => sum + b, 0);

    return {
      public: publicBalance,
      shielded,
      total: publicBalance + totalShielded,
      token,
    };
  }

  /**
   * Estimate costs for an operation
   *
   * @example
   * ```typescript
   * const estimate = await kit.estimate({
   *   operation: 'transfer',
   *   amount: 1.5,
   *   token: 'SOL',
   *   privacy: PrivacyLevel.AMOUNT_HIDDEN,
   * });
   * console.log('Estimated fee:', estimate.fee, 'SOL');
   * console.log('Estimated time:', estimate.latencyMs, 'ms');
   * ```
   */
  async estimate(request: EstimateRequest): Promise<EstimateResult> {
    this.ensureInitialized();

    this.logger.debug('Estimating costs', request);

    // If provider specified, use that adapter directly
    if (request.provider) {
      const adapter = this.getAdapter(request.provider);
      if (!adapter) {
        throw new ProviderNotAvailableError(request.provider);
      }
      return adapter.estimate(request);
    }

    // Auto-select best provider and get its estimate
    if (request.privacy) {
      try {
        const criteria: SelectionCriteria = {
          privacyLevel: request.privacy,
          token: request.token || 'SOL',
          amount: request.amount,
        };

        const selection = await this.router.selectProvider(criteria);
        return selection.estimate;
      } catch (error) {
        this.logger.warn('Auto-selection failed, using default provider', error);
      }
    }

    // Fall back to first available adapter
    const firstAdapter = this.adapters.values().next().value;
    if (!firstAdapter) {
      throw new PrivacyKitError('No adapters available', 'NO_ADAPTERS_AVAILABLE');
    }

    return firstAdapter.estimate(request);
  }

  /**
   * Create a pipeline builder for chaining operations
   *
   * @example
   * ```typescript
   * const result = await kit.pipeline()
   *   .deposit({ amount: 10, token: 'SOL' })
   *   .wait(5000)
   *   .transfer({
   *     recipient: 'address',
   *     amount: 5,
   *     token: 'SOL',
   *     privacy: PrivacyLevel.AMOUNT_HIDDEN,
   *   })
   *   .withdraw({ recipient: 'address', amount: 5, token: 'SOL' })
   *   .execute();
   * ```
   */
  pipeline(): PipelineBuilder {
    return new PipelineBuilder(this);
  }

  /**
   * Execute a pipeline of operations
   * @internal
   */
  async executePipeline(steps: PipelineStep[]): Promise<PipelineResult> {
    this.ensureInitialized();
    this.ensureWallet();

    this.logger.info(`Executing pipeline with ${steps.length} steps`);
    this.emit('pipeline:start', steps);

    const results: PipelineResult['steps'] = [];
    let totalFee = 0;
    let currentCommitment: string | undefined;

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        this.emit('pipeline:step', step, i);
        this.logger.debug(`Executing pipeline step ${i + 1}/${steps.length}: ${step.type}`);

        let result: TransferResult | DepositResult | WithdrawResult | ProveResult;

        switch (step.type) {
          case 'deposit': {
            const depositResult = await this.deposit({
              amount: step.params.amount as number,
              token: step.params.token as string,
              provider: step.provider,
            });
            result = depositResult;
            currentCommitment = depositResult.commitment;
            totalFee += depositResult.fee;
            break;
          }

          case 'transfer': {
            const transferResult = await this.transfer({
              recipient: step.params.recipient as string,
              amount: step.params.amount as number,
              token: step.params.token as string,
              privacy: step.params.privacy as PrivacyLevel,
              provider: step.provider,
            });
            result = transferResult;
            totalFee += transferResult.fee;
            break;
          }

          case 'withdraw': {
            const withdrawResult = await this.withdraw({
              recipient: step.params.recipient as string,
              amount: step.params.amount as number,
              token: step.params.token as string,
              provider: step.provider,
              commitment: (step.params.commitment as string) || currentCommitment,
            });
            result = withdrawResult;
            totalFee += withdrawResult.fee;
            break;
          }

          case 'prove': {
            const proveResult = await this.prove({
              circuit: step.params.circuit as string,
              publicInputs: step.params.publicInputs as Record<string, unknown>,
              privateInputs: step.params.privateInputs as Record<string, unknown>,
              provider: step.provider,
            });
            result = proveResult;
            break;
          }

          case 'wait': {
            const duration = step.params.durationMs as number;
            this.logger.debug(`Waiting ${duration}ms`);
            await new Promise((resolve) => setTimeout(resolve, duration));
            continue; // Skip adding to results
          }

          default:
            throw new PrivacyKitError(
              `Unknown pipeline step type: ${step.type}`,
              'INVALID_PIPELINE_STEP'
            );
        }

        results.push({
          type: step.type,
          result,
          provider: step.provider || (result as { provider: PrivacyProvider }).provider,
        });
      }

      const pipelineResult: PipelineResult = {
        steps: results,
        totalFee,
        success: true,
      };

      this.logger.info('Pipeline execution complete', { totalFee, steps: results.length });
      this.emit('pipeline:complete', pipelineResult);

      return pipelineResult;
    } catch (error) {
      const wrappedError = wrapError(error, 'Pipeline execution failed');
      this.emit('pipeline:error', wrappedError, results.length);
      throw wrappedError;
    }
  }

  /**
   * Select the best adapter for a request
   */
  private async selectAdapter(request: TransferRequest): Promise<PrivacyProviderAdapter> {
    // If provider specified, use it directly
    if (request.provider) {
      const adapter = this.getAdapter(request.provider);
      if (!adapter) {
        throw new ProviderNotAvailableError(request.provider);
      }
      return adapter;
    }

    // Auto-select based on request criteria
    const criteria: SelectionCriteria = {
      privacyLevel: request.privacy,
      token: request.token,
      amount: request.amount,
      maxFee: request.options?.maxFee,
    };

    const selection = await this.router.selectProvider(criteria);
    this.logger.debug('Auto-selected provider', {
      provider: selection.provider,
      score: selection.score,
      reasons: selection.reasons,
    });

    return selection.adapter;
  }

  /**
   * Get a specific adapter by provider
   */
  getAdapter(provider: PrivacyProvider): PrivacyProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  /**
   * Get all initialized adapters
   */
  getAdapters(): PrivacyProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get the router instance
   */
  getRouter(): PrivacyRouter {
    return this.router;
  }

  /**
   * Check if SDK is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(provider: PrivacyProvider): boolean {
    const adapter = this.adapters.get(provider);
    return adapter?.isReady() ?? false;
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): PrivacyProvider[] {
    return Array.from(this.adapters.keys()).filter((p) =>
      this.adapters.get(p)?.isReady()
    );
  }

  /**
   * Get routing recommendation for a transfer
   */
  async getRecommendation(request: TransferRequest): Promise<{
    recommended: {
      provider: PrivacyProvider;
      estimate: EstimateResult;
      reasons: string[];
    };
    alternatives: Array<{
      provider: PrivacyProvider;
      estimate: EstimateResult;
    }>;
    explanation: string;
  }> {
    this.ensureInitialized();

    const result = await this.router.getRecommendation(request);

    return {
      recommended: {
        provider: result.recommended.provider,
        estimate: result.recommended.estimate,
        reasons: result.recommended.reasons,
      },
      alternatives: result.alternatives.map((alt) => ({
        provider: alt.provider,
        estimate: alt.estimate,
      })),
      explanation: result.explanation,
    };
  }

  /**
   * Get SDK version information
   */
  getVersion(): { sdk: string; protocol: string } {
    return VERSION;
  }

  /**
   * Get current configuration
   */
  getConfig(): PrivacyKitConfig {
    return { ...this.config };
  }

  /**
   * Get current network
   */
  getNetwork(): NetworkCluster {
    return this.config.network;
  }

  /**
   * Destroy the SDK instance and clean up resources
   */
  async destroy(): Promise<void> {
    this.logger.info('Destroying PrivacyKit instance');

    // Clear all listeners
    this.removeAllListeners();

    // Clear adapters
    this.adapters.clear();

    // Clear connection
    this.connection = null;
    this.wallet = null;
    this.initialized = false;

    this.logger.info('PrivacyKit instance destroyed');
  }
}

// Re-export commonly used types for convenience
export {
  PrivacyLevel,
  PrivacyProvider,
  type PrivacyKitConfig,
  type TransferRequest,
  type TransferResult,
  type DepositRequest,
  type DepositResult,
  type WithdrawRequest,
  type WithdrawResult,
  type ProveRequest,
  type ProveResult,
  type BalanceResult,
  type EstimateRequest,
  type EstimateResult,
  type WalletAdapter,
  type PipelineStep,
  type PipelineResult,
};

// Default export
export default PrivacyKit;
