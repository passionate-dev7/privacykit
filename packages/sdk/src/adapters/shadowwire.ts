/**
 * ShadowWire/ShadowPay Adapter
 *
 * Production integration with the ShadowPay API for private transfers
 * using Groth16 zero-knowledge proofs and ElGamal encryption on BN254.
 *
 * API Base URL: https://shadow.radr.fun/shadowpay/v1
 * Documentation: https://registry.scalar.com/@radr/apis/shadowpay-api
 * NPM Packages: @shadowpay/core, @shadowpay/server, @shadowpay/client
 *
 * Features:
 * - Internal transfers: Amount hidden using ZK proofs
 * - External transfers: Sender anonymous, amount visible
 * - Supports SOL, USDC, USDT, RADR, BONK, and other SPL tokens
 * - x402 payment protocol integration
 * - ElGamal encryption for amount privacy
 */

import type {
  TransferRequest,
  TransferResult,
  DepositRequest,
  DepositResult,
  WithdrawRequest,
  WithdrawResult,
  EstimateRequest,
  EstimateResult,
  WalletAdapter,
} from '../types';
import { PrivacyProvider, PrivacyLevel } from '../types';
import { BaseAdapter } from './base';
import {
  InsufficientBalanceError,
  RecipientNotFoundError,
  TransactionError,
  AmountBelowMinimumError,
  NetworkError,
  wrapError,
} from '../utils/errors';
import { retry } from '../utils';
import { toSmallestUnit, fromSmallestUnit } from '../types/tokens';
import {
  ShadowPayApiClient,
  ShadowPayApiErrorClass,
  SHADOWPAY_TOKENS,
  SHADOWPAY_API_URL,
  API_VERSION,
  createSignedMessage,
  createTransferPayload,
} from '../shadowwire';
import { ShadowPayErrorCode } from '../shadowwire/types';
import type {
  PrivateTransferRequest,
  PrivateTransferResponse,
  BalanceResponse,
  DepositResponse,
  WithdrawalResponse,
  TokenConfig,
} from '../shadowwire/types';

/**
 * Extended token configuration with legacy support
 * Includes tokens from the original adapter plus official ShadowPay tokens
 */
const EXTENDED_TOKENS: Record<string, TokenConfig> = {
  ...SHADOWPAY_TOKENS,
  // Additional tokens from legacy configuration
  JIM: { symbol: 'JIM', decimals: 9, fee: 0.01, minAmount: 1 },
  GODL: { symbol: 'GODL', decimals: 11, fee: 0.01, minAmount: 0.001 },
  HUSTLE: { symbol: 'HUSTLE', decimals: 9, fee: 0.003, minAmount: 0.1 },
  ZEC: { symbol: 'ZEC', decimals: 9, fee: 0.01, minAmount: 0.01 },
  CRT: { symbol: 'CRT', decimals: 9, fee: 0.01, minAmount: 1 },
  BLACKCOIN: { symbol: 'BLACKCOIN', decimals: 6, fee: 0.01, minAmount: 1 },
  GIL: { symbol: 'GIL', decimals: 6, fee: 0.01, minAmount: 1 },
  ANON: { symbol: 'ANON', decimals: 9, fee: 0.01, minAmount: 1 },
  WLFI: { symbol: 'WLFI', decimals: 6, fee: 0.01, minAmount: 1 },
  USD1: { symbol: 'USD1', decimals: 6, fee: 0.01, minAmount: 1 },
  AOL: { symbol: 'AOL', decimals: 6, fee: 0.01, minAmount: 1 },
  IQLABS: { symbol: 'IQLABS', decimals: 9, fee: 0.005, minAmount: 0.1 },
  SANA: { symbol: 'SANA', decimals: 6, fee: 0.01, minAmount: 1 },
  POKI: { symbol: 'POKI', decimals: 9, fee: 0.01, minAmount: 1 },
  RAIN: { symbol: 'RAIN', decimals: 6, fee: 0.02, minAmount: 1 },
  HOSICO: { symbol: 'HOSICO', decimals: 9, fee: 0.01, minAmount: 1 },
  SKR: { symbol: 'SKR', decimals: 6, fee: 0.005, minAmount: 1 },
};

/**
 * ShadowWire Adapter
 *
 * Real production integration with ShadowPay API for private transfers
 * using Groth16 ZK-SNARKs and ElGamal encryption.
 *
 * @example
 * ```typescript
 * const adapter = new ShadowWireAdapter();
 * await adapter.initialize(connection, wallet);
 *
 * // Execute a private transfer (amount hidden)
 * const result = await adapter.transfer({
 *   recipient: 'recipient_address',
 *   amount: 1.0,
 *   token: 'SOL',
 *   privacy: PrivacyLevel.AMOUNT_HIDDEN
 * });
 *
 * // Get shielded balance
 * const balance = await adapter.getBalance('SOL');
 * ```
 */
export class ShadowWireAdapter extends BaseAdapter {
  readonly provider = PrivacyProvider.SHADOWWIRE;
  readonly name = 'ShadowWire';
  readonly supportedLevels: PrivacyLevel[] = [
    PrivacyLevel.AMOUNT_HIDDEN,
    PrivacyLevel.SENDER_HIDDEN,
  ];
  readonly supportedTokens = Object.keys(EXTENDED_TOKENS);

  private apiClient: ShadowPayApiClient;
  private apiBaseUrl = SHADOWPAY_API_URL;
  private apiKey?: string;

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey;
    this.apiClient = new ShadowPayApiClient({
      apiKey,
      apiUrl: this.apiBaseUrl,
    });
  }

  /**
   * Initialize ShadowWire adapter
   * Verifies API connectivity
   */
  protected async onInitialize(): Promise<void> {
    try {
      const health = await this.apiClient.health();
      if (health.status !== 'ok') {
        this.logger.warn('ShadowPay API health check returned non-ok status');
      } else {
        this.logger.info('ShadowPay API connection verified');
      }
    } catch (error) {
      this.logger.warn('Could not verify ShadowPay API connectivity, will retry on operations');
    }
  }

  /**
   * Configure API base URL (useful for testing or custom deployments)
   */
  setApiUrl(url: string): void {
    this.apiBaseUrl = url;
    this.apiClient = new ShadowPayApiClient({
      apiKey: this.apiKey,
      apiUrl: url,
    });
  }

  /**
   * Set API key for authenticated requests
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.apiClient = new ShadowPayApiClient({
      apiKey,
      apiUrl: this.apiBaseUrl,
    });
  }

  /**
   * Get token configuration
   */
  private getTokenConfig(token: string): TokenConfig | undefined {
    return EXTENDED_TOKENS[token.toUpperCase()];
  }

  /**
   * Get balance for a token in the ShadowWire privacy pool
   *
   * Note: The ShadowPay API may not expose a direct balance endpoint.
   * Balance queries may need to be done via on-chain program state.
   */
  async getBalance(token: string, address?: string): Promise<number> {
    this.ensureReady();

    const walletAddress = address || this.wallet?.publicKey.toBase58();
    if (!walletAddress) {
      throw new Error('No wallet address provided');
    }

    const normalizedToken = token.toUpperCase();
    const tokenConfig = this.getTokenConfig(normalizedToken);
    if (!tokenConfig) {
      throw new Error(`Token ${token} not supported by ShadowWire`);
    }

    try {
      const response = await retry(
        async () => {
          try {
            return await this.apiClient.getBalance(walletAddress, normalizedToken);
          } catch (error) {
            // If balance endpoint returns 404, return 0 balance
            if (error instanceof ShadowPayApiErrorClass && error.status === 404) {
              return { balance: 0, token: normalizedToken };
            }
            throw error;
          }
        },
        { maxRetries: 3 }
      );

      return response.balance;
    } catch (error) {
      if (error instanceof ShadowPayApiErrorClass) {
        throw new NetworkError(`Failed to get balance: ${error.message}`, error);
      }
      throw wrapError(error, 'Failed to get ShadowWire balance');
    }
  }

  /**
   * Execute a private transfer via ShadowPay
   *
   * Internal transfers (AMOUNT_HIDDEN): Amount encrypted with ElGamal
   * External transfers (SENDER_HIDDEN): Sender identity protected
   */
  async transfer(request: TransferRequest): Promise<TransferResult> {
    this.ensureReady();
    const wallet = this.ensureWallet();

    const token = request.token.toUpperCase();
    const tokenConfig = this.getTokenConfig(token);

    if (!tokenConfig) {
      throw new Error(`Token ${request.token} not supported by ShadowWire`);
    }

    // Validate minimum amount
    if (request.amount < tokenConfig.minAmount) {
      throw new AmountBelowMinimumError(
        request.amount,
        tokenConfig.minAmount,
        token,
        this.provider
      );
    }

    // Determine transfer type based on privacy level
    const transferType =
      request.privacy === PrivacyLevel.AMOUNT_HIDDEN ? 'internal' : 'external';

    const recipient =
      typeof request.recipient === 'string'
        ? request.recipient
        : request.recipient.toBase58();

    this.logger.info(`Initiating ${transferType} transfer of ${request.amount} ${token}`);

    try {
      // Create and sign the transfer payload
      const timestamp = Date.now();
      const payload = createTransferPayload({
        action: 'transfer',
        sender: wallet.publicKey.toBase58(),
        recipient,
        amount: request.amount,
        token,
        type: transferType,
        timestamp,
      });

      const { signature } = await createSignedMessage(wallet, payload);

      // Build transfer request
      const transferRequest: PrivateTransferRequest = {
        sender: wallet.publicKey.toBase58(),
        recipient,
        amount: request.amount,
        token,
        type: transferType,
        timestamp,
        signature,
      };

      // Execute the transfer via API with retry
      const response = await retry(
        async () => {
          try {
            return await this.apiClient.transfer(transferRequest);
          } catch (error) {
            if (error instanceof ShadowPayApiErrorClass) {
              // Map API errors to SDK errors
              switch (error.code) {
                case ShadowPayErrorCode.INVALID_RECIPIENT:
                  throw new RecipientNotFoundError(recipient);
                case ShadowPayErrorCode.INSUFFICIENT_BALANCE:
                  throw new InsufficientBalanceError(request.amount, 0, token);
                case ShadowPayErrorCode.AMOUNT_BELOW_MINIMUM:
                  throw new AmountBelowMinimumError(
                    request.amount,
                    tokenConfig.minAmount,
                    token,
                    this.provider
                  );
                default:
                  throw new TransactionError(error.message);
              }
            }
            throw error;
          }
        },
        { maxRetries: 2 }
      );

      if (!response.success) {
        throw new TransactionError(response.error || 'Transfer failed');
      }

      this.logger.info(`Transfer complete: ${response.transactionId || response.signature}`);

      return {
        signature: response.transactionId || response.signature || '',
        provider: this.provider,
        privacyLevel: request.privacy,
        fee: response.fee || request.amount * tokenConfig.fee,
      };
    } catch (error) {
      if (
        error instanceof InsufficientBalanceError ||
        error instanceof RecipientNotFoundError ||
        error instanceof TransactionError ||
        error instanceof AmountBelowMinimumError
      ) {
        throw error;
      }
      throw wrapError(error, 'ShadowWire transfer failed');
    }
  }

  /**
   * Deposit tokens into ShadowWire privacy pool
   */
  async deposit(request: DepositRequest): Promise<DepositResult> {
    this.ensureReady();
    const wallet = this.ensureWallet();

    const token = request.token.toUpperCase();
    const tokenConfig = this.getTokenConfig(token);

    if (!tokenConfig) {
      throw new Error(`Token ${request.token} not supported by ShadowWire`);
    }

    if (request.amount < tokenConfig.minAmount) {
      throw new AmountBelowMinimumError(
        request.amount,
        tokenConfig.minAmount,
        token,
        this.provider
      );
    }

    this.logger.info(`Depositing ${request.amount} ${token} into ShadowWire`);

    try {
      const timestamp = Date.now();
      const payload = createTransferPayload({
        action: 'deposit',
        sender: wallet.publicKey.toBase58(),
        amount: request.amount,
        token,
        timestamp,
      });

      const { signature } = await createSignedMessage(wallet, payload);

      // Convert to smallest units for API
      const amountSmallest = toSmallestUnit(request.amount, token).toString();

      const response = await retry(
        async () => {
          return await this.apiClient.deposit({
            wallet: wallet.publicKey.toBase58(),
            amount: amountSmallest,
            token,
            timestamp,
            signature,
          });
        },
        { maxRetries: 2 }
      );

      if (!response.success) {
        throw new TransactionError(response.error || 'Deposit failed');
      }

      this.logger.info(`Deposit complete: ${response.transactionId || response.signature}`);

      return {
        signature: response.transactionId || response.signature || '',
        provider: this.provider,
        commitment: response.commitment,
        fee: response.fee || request.amount * tokenConfig.fee,
      };
    } catch (error) {
      if (error instanceof TransactionError || error instanceof AmountBelowMinimumError) {
        throw error;
      }
      throw wrapError(error, 'ShadowWire deposit failed');
    }
  }

  /**
   * Withdraw tokens from ShadowWire privacy pool
   */
  async withdraw(request: WithdrawRequest): Promise<WithdrawResult> {
    this.ensureReady();
    const wallet = this.ensureWallet();

    const token = request.token.toUpperCase();
    const tokenConfig = this.getTokenConfig(token);

    if (!tokenConfig) {
      throw new Error(`Token ${request.token} not supported by ShadowWire`);
    }

    const recipient =
      typeof request.recipient === 'string'
        ? request.recipient
        : request.recipient.toBase58();

    this.logger.info(`Withdrawing ${request.amount} ${token} from ShadowWire`);

    try {
      const timestamp = Date.now();
      const payload = createTransferPayload({
        action: 'withdraw',
        sender: wallet.publicKey.toBase58(),
        recipient,
        amount: request.amount,
        token,
        timestamp,
      });

      const { signature } = await createSignedMessage(wallet, payload);

      // Convert to smallest units for API
      const amountSmallest = toSmallestUnit(request.amount, token).toString();

      const response = await retry(
        async () => {
          return await this.apiClient.withdraw({
            wallet: wallet.publicKey.toBase58(),
            recipient,
            amount: amountSmallest,
            token,
            timestamp,
            signature,
          });
        },
        { maxRetries: 2 }
      );

      if (!response.success) {
        throw new TransactionError(response.error || 'Withdrawal failed');
      }

      this.logger.info(`Withdrawal complete: ${response.transactionId || response.signature}`);

      return {
        signature: response.transactionId || response.signature || '',
        provider: this.provider,
        fee: response.fee || request.amount * tokenConfig.fee,
      };
    } catch (error) {
      if (error instanceof TransactionError) {
        throw error;
      }
      throw wrapError(error, 'ShadowWire withdrawal failed');
    }
  }

  /**
   * Estimate costs for an operation
   */
  async estimate(request: EstimateRequest): Promise<EstimateResult> {
    const token = (request.token || 'SOL').toUpperCase();
    const tokenConfig = this.getTokenConfig(token);

    if (!tokenConfig) {
      return {
        fee: 0,
        provider: this.provider,
        latencyMs: 0,
        warnings: [`Token ${token} not supported by ShadowWire`],
      };
    }

    const amount = request.amount || 0;
    const feePercent = tokenConfig.fee;
    const fee = amount * feePercent;

    const warnings: string[] = [];

    if (amount > 0 && amount < tokenConfig.minAmount) {
      warnings.push(
        `Amount ${amount} ${token} is below minimum ${tokenConfig.minAmount}`
      );
    }

    // Estimate latency based on operation type
    // Internal transfers with ZK proofs take longer
    let latencyMs = 3000; // Base latency
    if (request.operation === 'transfer') {
      latencyMs = request.privacy === PrivacyLevel.AMOUNT_HIDDEN ? 5000 : 3000;
    } else if (request.operation === 'deposit' || request.operation === 'withdraw') {
      latencyMs = 4000;
    }

    return {
      fee,
      tokenFee: fee,
      provider: this.provider,
      latencyMs,
      anonymitySet: 500, // Estimated pool size
      warnings,
    };
  }

  /**
   * Get fee percentage for a token
   */
  getFeePercentage(token: string): number {
    const config = this.getTokenConfig(token.toUpperCase());
    return config?.fee || 0.01;
  }

  /**
   * Get minimum amount for a token
   */
  getMinimumAmount(token: string): number {
    const config = this.getTokenConfig(token.toUpperCase());
    return config?.minAmount || 0;
  }

  /**
   * Calculate fee breakdown for an amount
   */
  calculateFee(
    amount: number,
    token: string
  ): { fee: number; netAmount: number; feePercent: number } {
    const feePercent = this.getFeePercentage(token);
    const fee = amount * feePercent;
    return {
      fee,
      netAmount: amount - fee,
      feePercent,
    };
  }

  /**
   * Verify a payment access token
   * Used for x402 payment protocol integration
   */
  async verifyPayment(
    accessToken: string,
    requirement?: { amount: number; token: string }
  ): Promise<{ authorized: boolean; status: string }> {
    return this.apiClient.verifyPayment(accessToken, requirement);
  }
}
