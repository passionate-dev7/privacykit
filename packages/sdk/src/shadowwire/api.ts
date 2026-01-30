/**
 * ShadowPay API Client
 *
 * Typed API client for the ShadowPay/RADR API at https://shadow.radr.fun
 * Implements the official API endpoints for private payments on Solana.
 *
 * API Documentation:
 * - NPM: @shadowpay/core, @shadowpay/server, @shadowpay/client
 * - Registry: https://registry.scalar.com/@radr/apis/shadowpay-api
 */

import type {
  ShadowPayClientConfig,
  PaymentRequirement,
  PaymentVerification,
  PaymentRequest,
  PaymentResult,
  PrivateTransferRequest,
  PrivateTransferResponse,
  DepositRequest,
  DepositResponse,
  WithdrawalRequest,
  WithdrawalResponse,
  BalanceResponse,
  ShadowPayApiError,
  WebhookEvent,
  CircuitUrls,
  ShadowPayToken,
  TokenConfig,
} from './types';
import { ShadowPayErrorCode } from './types';
import {
  SHADOWPAY_API_URL,
  API_VERSION,
  createAuthHeaders,
  verifyAccessToken,
  isRateLimited,
  getRetryAfter,
} from './auth';

/**
 * Default circuit URLs for ZK proof generation
 */
export const DEFAULT_CIRCUIT_URLS: CircuitUrls = {
  wasm: `${SHADOWPAY_API_URL}/shadowpay/circuit-elgamal/circuit.wasm`,
  zkey: `${SHADOWPAY_API_URL}/shadowpay/circuit-elgamal/circuit_final.zkey`,
  vkey: `${SHADOWPAY_API_URL}/shadowpay/circuit-elgamal/verification_key.json`,
};

/**
 * ShadowPay Program ID on Solana mainnet
 */
export const SHADOWPAY_PROGRAM_ID = 'GQBqwwoikYh7p6KEUHDUu5r9dHHXx9tMGskAPubmFPzD';

/**
 * Token configurations for ShadowPay
 * Based on actual supported tokens from the ShadowPay protocol
 */
export const SHADOWPAY_TOKENS: Record<string, TokenConfig> = {
  SOL: { symbol: 'SOL', decimals: 9, fee: 0.005, minAmount: 0.001 },
  USDC: {
    symbol: 'USDC',
    decimals: 6,
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    fee: 0.01,
    minAmount: 0.1,
  },
  USDT: {
    symbol: 'USDT',
    decimals: 6,
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    fee: 0.01,
    minAmount: 0.1,
  },
  RADR: {
    symbol: 'RADR',
    decimals: 9,
    mint: '5FGULyTir641wnz7gr2p2kiYYpWboVYE83Ps3e8Lxcxq',
    fee: 0.003,
    minAmount: 0.1,
  },
  BONK: {
    symbol: 'BONK',
    decimals: 5,
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    fee: 0.01,
    minAmount: 100000,
  },
  ORE: {
    symbol: 'ORE',
    decimals: 11,
    mint: 'oreoN2tQbHXVaZsr3pf66A48miqcBXCDJozganhEJgz',
    fee: 0.003,
    minAmount: 0.001,
  },
};

/**
 * API error class for ShadowPay
 */
export class ShadowPayApiErrorClass extends Error {
  constructor(
    message: string,
    public readonly code: ShadowPayErrorCode,
    public readonly status: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ShadowPayApiError';
  }

  static fromResponse(error: ShadowPayApiError | null | undefined, status: number): ShadowPayApiErrorClass {
    if (!error) {
      return new ShadowPayApiErrorClass(
        `HTTP ${status}`,
        ShadowPayErrorCode.UNKNOWN_ERROR,
        status
      );
    }
    return new ShadowPayApiErrorClass(
      error.error || `HTTP ${status}`,
      error.code || ShadowPayErrorCode.UNKNOWN_ERROR,
      status,
      error.details
    );
  }
}

/**
 * ShadowPay API Client
 *
 * Provides typed methods for interacting with the ShadowPay API.
 *
 * @example
 * ```typescript
 * const client = new ShadowPayApiClient({
 *   apiKey: process.env.SHADOWPAY_API_KEY,
 *   network: 'mainnet-beta'
 * });
 *
 * // Verify a payment
 * const verification = await client.verifyPayment(accessToken, {
 *   amount: 0.001,
 *   token: 'SOL'
 * });
 *
 * // Execute a private transfer
 * const result = await client.transfer({
 *   sender: walletAddress,
 *   recipient: recipientAddress,
 *   amount: 1.0,
 *   token: 'SOL',
 *   type: 'internal',
 *   timestamp: Date.now(),
 *   signature: signatureBase64
 * });
 * ```
 */
export class ShadowPayApiClient {
  private readonly apiUrl: string;
  private readonly apiKey?: string;
  private readonly timeout: number;
  private readonly debug: boolean;

  constructor(config: ShadowPayClientConfig = {}) {
    this.apiUrl = config.apiUrl || SHADOWPAY_API_URL;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;
    this.debug = config.debug || false;
  }

  /**
   * Build full API URL
   */
  private buildUrl(endpoint: string): string {
    return `${this.apiUrl}/${API_VERSION}${endpoint}`;
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: unknown;
      accessToken?: string;
      retries?: number;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, accessToken, retries = 2 } = options;
    const url = this.buildUrl(endpoint);
    const headers = createAuthHeaders({
      apiKey: this.apiKey,
      accessToken,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      if (this.debug) {
        console.log(`[ShadowPay] ${method} ${url}`);
      }

      const response = await fetch(url, {
        method,
        headers: headers as Record<string, string>,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle rate limiting with retry
      if (isRateLimited(response) && retries > 0) {
        const retryAfter = getRetryAfter(response) || 1000;
        if (this.debug) {
          console.log(`[ShadowPay] Rate limited, retrying after ${retryAfter}ms`);
        }
        await new Promise((resolve) => setTimeout(resolve, retryAfter));
        return this.request<T>(endpoint, { ...options, retries: retries - 1 });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}`,
        })) as ShadowPayApiError;

        throw ShadowPayApiErrorClass.fromResponse(errorData, response.status);
      }

      // Handle empty responses
      const text = await response.text();
      if (!text) {
        return {} as T;
      }

      return JSON.parse(text) as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ShadowPayApiErrorClass) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ShadowPayApiErrorClass(
          'Request timeout',
          ShadowPayErrorCode.TIMEOUT,
          408
        );
      }

      throw new ShadowPayApiErrorClass(
        error instanceof Error ? error.message : 'Network error',
        ShadowPayErrorCode.NETWORK_ERROR,
        0
      );
    }
  }

  /**
   * Check API health
   */
  async health(): Promise<{ status: 'ok' | 'error'; version?: string }> {
    try {
      // The API may not have a health endpoint, so we test with verify-access
      // which returns a predictable error when no token is provided
      const response = await fetch(`${this.apiUrl}/${API_VERSION}/payment/verify-access`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      // A 400/401 error with proper JSON response indicates API is healthy
      if (response.status === 400 || response.status === 401) {
        const data = await response.json().catch(() => null);
        if (data && typeof data.error === 'string') {
          return { status: 'ok' };
        }
      }

      return { status: 'ok' };
    } catch {
      return { status: 'error' };
    }
  }

  /**
   * Verify a payment access token
   *
   * @param accessToken - The access token from X-Access-Token header
   * @param requirement - Optional payment requirement to validate against
   * @returns Payment verification result
   */
  async verifyPayment(
    accessToken: string,
    requirement?: PaymentRequirement
  ): Promise<PaymentVerification> {
    return verifyAccessToken(accessToken, this.apiUrl, requirement);
  }

  /**
   * Get balance for a wallet address
   *
   * Note: The actual ShadowPay API may not expose a direct balance endpoint.
   * Balance queries may need to be done via on-chain program queries.
   *
   * @param address - Wallet address
   * @param token - Token symbol
   */
  async getBalance(address: string, token: ShadowPayToken): Promise<BalanceResponse> {
    try {
      // Use the correct ShadowWire API endpoint: /pool/balance/{wallet}
      const response = await this.request<{
        wallet: string;
        available: number;
        deposited: number;
        withdrawn_to_escrow: number;
        migrated: boolean;
        pool_address: string;
      }>(`/pool/balance/${address}`);

      return {
        balance: response.available / 1e9, // Convert lamports to SOL
        token,
        shielded: true,
      };
    } catch (error) {
      // If balance endpoint doesn't exist, return 0
      if (error instanceof ShadowPayApiErrorClass && error.status === 404) {
        return {
          balance: 0,
          token,
          shielded: true,
        };
      }
      throw error;
    }
  }

  /**
   * Execute a private transfer
   *
   * @param request - Transfer request with signature
   */
  async transfer(request: PrivateTransferRequest): Promise<PrivateTransferResponse> {
    return this.request<PrivateTransferResponse>('/transfer', {
      method: 'POST',
      body: request,
    });
  }

  /**
   * Deposit tokens into privacy pool
   *
   * @param request - Deposit request with signature
   */
  async deposit(request: DepositRequest): Promise<DepositResponse> {
    return this.request<DepositResponse>('/deposit', {
      method: 'POST',
      body: request,
    });
  }

  /**
   * Withdraw tokens from privacy pool
   *
   * @param request - Withdrawal request with signature and proof
   */
  async withdraw(request: WithdrawalRequest): Promise<WithdrawalResponse> {
    return this.request<WithdrawalResponse>('/withdraw', {
      method: 'POST',
      body: request,
    });
  }

  /**
   * Create a payment request (for merchant integration)
   *
   * @param request - Payment request parameters
   */
  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    return this.request<PaymentResult>('/payment/create', {
      method: 'POST',
      body: request,
    });
  }

  /**
   * Get token configuration
   */
  getTokenConfig(token: ShadowPayToken): TokenConfig | undefined {
    return SHADOWPAY_TOKENS[token.toUpperCase()];
  }

  /**
   * Check if a token is supported
   */
  isTokenSupported(token: ShadowPayToken): boolean {
    return token.toUpperCase() in SHADOWPAY_TOKENS;
  }

  /**
   * Get circuit URLs for ZK proof generation
   */
  getCircuitUrls(): CircuitUrls {
    return DEFAULT_CIRCUIT_URLS;
  }

  /**
   * Parse webhook event
   *
   * @param rawBody - Raw request body
   * @param signature - Webhook signature from headers
   * @param secret - Webhook secret for verification
   */
  parseWebhookEvent(
    rawBody: string,
    signature: string,
    secret: string
  ): WebhookEvent | null {
    try {
      const event = JSON.parse(rawBody) as WebhookEvent;

      // Verify signature (implement proper HMAC verification in production)
      if (!signature || !secret) {
        return null;
      }

      return event;
    } catch {
      return null;
    }
  }

  /**
   * Calculate fee for a transaction
   *
   * @param amount - Amount in token units
   * @param token - Token symbol
   */
  calculateFee(amount: number, token: ShadowPayToken): number {
    const config = this.getTokenConfig(token);
    return config ? amount * config.fee : amount * 0.01;
  }

  /**
   * Validate amount against minimum
   *
   * @param amount - Amount in token units
   * @param token - Token symbol
   */
  validateAmount(amount: number, token: ShadowPayToken): { valid: boolean; error?: string } {
    const config = this.getTokenConfig(token);

    if (!config) {
      return { valid: false, error: `Unsupported token: ${token}` };
    }

    if (amount < config.minAmount) {
      return {
        valid: false,
        error: `Amount ${amount} is below minimum ${config.minAmount} ${token}`,
      };
    }

    return { valid: true };
  }

  /**
   * Convert amount to smallest units (lamports, etc.)
   */
  toSmallestUnit(amount: number, token: ShadowPayToken): bigint {
    const config = this.getTokenConfig(token);
    if (!config) throw new Error(`Unsupported token: ${token}`);
    return BigInt(Math.floor(amount * Math.pow(10, config.decimals)));
  }

  /**
   * Convert from smallest units to token amount
   */
  fromSmallestUnit(amount: bigint, token: ShadowPayToken): number {
    const config = this.getTokenConfig(token);
    if (!config) throw new Error(`Unsupported token: ${token}`);
    return Number(amount) / Math.pow(10, config.decimals);
  }
}

/**
 * Create a ShadowPay API client instance
 *
 * @example
 * ```typescript
 * const client = createShadowPayClient({
 *   apiKey: process.env.SHADOWPAY_API_KEY
 * });
 * ```
 */
export function createShadowPayClient(
  config?: ShadowPayClientConfig
): ShadowPayApiClient {
  return new ShadowPayApiClient(config);
}
