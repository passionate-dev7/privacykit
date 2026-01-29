import type { Connection } from '@solana/web3.js';
import type {
  PrivacyProvider,
  PrivacyLevel,
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
} from '../types';
import { Logger, defaultLogger } from '../utils/logger';
import { ProviderNotAvailableError } from '../utils/errors';

/**
 * Base class for privacy provider adapters
 * Provides common functionality and enforces interface implementation
 */
export abstract class BaseAdapter implements PrivacyProviderAdapter {
  abstract readonly provider: PrivacyProvider;
  abstract readonly name: string;
  abstract readonly supportedLevels: PrivacyLevel[];
  abstract readonly supportedTokens: string[];

  protected connection: Connection | null = null;
  protected wallet: WalletAdapter | null = null;
  protected initialized = false;
  protected logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger.child(this.constructor.name);
  }

  /**
   * Initialize the adapter with connection and wallet
   */
  async initialize(connection: Connection, wallet?: WalletAdapter): Promise<void> {
    this.connection = connection;
    this.wallet = wallet || null;
    await this.onInitialize();
    this.initialized = true;
    this.logger.info(`${this.name} adapter initialized`);
  }

  /**
   * Hook for subclasses to perform additional initialization
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Check if the adapter is ready for use
   */
  isReady(): boolean {
    return this.initialized && this.connection !== null;
  }

  /**
   * Ensure adapter is initialized before operations
   */
  protected ensureReady(): void {
    if (!this.isReady()) {
      throw new ProviderNotAvailableError(this.provider);
    }
  }

  /**
   * Ensure wallet is connected
   */
  protected ensureWallet(): WalletAdapter {
    if (!this.wallet) {
      throw new ProviderNotAvailableError(
        this.provider,
        new Error('Wallet not connected')
      );
    }
    return this.wallet;
  }

  /**
   * Get the connection instance
   */
  protected getConnection(): Connection {
    this.ensureReady();
    return this.connection!;
  }

  /**
   * Update wallet reference
   */
  setWallet(wallet: WalletAdapter): void {
    this.wallet = wallet;
  }

  /**
   * Abstract methods that must be implemented by subclasses
   */
  abstract getBalance(token: string, address?: string): Promise<number>;
  abstract transfer(request: TransferRequest): Promise<TransferResult>;
  abstract deposit(request: DepositRequest): Promise<DepositResult>;
  abstract withdraw(request: WithdrawRequest): Promise<WithdrawResult>;
  abstract estimate(request: EstimateRequest): Promise<EstimateResult>;

  /**
   * Check if an operation is supported
   */
  supports(operation: string, token: string, privacy: PrivacyLevel): boolean {
    // Check if token is supported
    if (!this.supportedTokens.includes(token.toUpperCase()) &&
        !this.supportedTokens.includes('*')) {
      return false;
    }

    // Check if privacy level is supported
    if (!this.supportedLevels.includes(privacy)) {
      return false;
    }

    // Check operation type
    const supportedOps = ['transfer', 'deposit', 'withdraw', 'prove', 'estimate'];
    return supportedOps.includes(operation);
  }
}
