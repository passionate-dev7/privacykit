/**
 * ShadowWire Production Adapter
 *
 * Uses the official `@radr/shadowwire` SDK for production-ready
 * privacy pool operations on Solana.
 *
 * Features:
 * - Real deposits/withdrawals via official SDK
 * - SOL, USDC, USDT, RADR, BONK, ORE support
 * - Client-side ZK proof generation with WASM
 * - Signature-based authentication
 * - Internal and external private transfers
 *
 * @module adapters/shadowwire-production
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
} from '../types';
import { PrivacyProvider, PrivacyLevel } from '../types';
import { BaseAdapter } from './base';
import {
  TransactionError,
  InsufficientBalanceError,
  AmountBelowMinimumError,
  NetworkError,
  ProofGenerationError,
  wrapError,
} from '../utils/errors';

// Import official ShadowWire SDK
import {
  ShadowWireClient,
  generateTransferSignature,
  determineSignatureTransferType,
  initWASM,
  generateRangeProof,
  isWASMSupported,
  BULLETPROOF_INFO,
  TOKEN_FEES,
  TOKEN_MINIMUMS,
  TOKEN_MINTS,
  TOKEN_DECIMALS,
  // Error classes
  ShadowWireError,
  InsufficientBalanceError as SWInsufficientBalanceError,
  InvalidAddressError,
  InvalidAmountError,
  RecipientNotFoundError,
  ProofUploadError,
  TransferError,
  NetworkError as SWNetworkError,
  WASMNotSupportedError,
  ProofGenerationError as SWProofGenerationError,
} from '@radr/shadowwire';

import type {
  TokenSymbol,
  TransferType,
  ZKProofData,
  PoolBalance,
  TransferResponse,
  DepositResponse,
  WithdrawResponse,
} from '@radr/shadowwire';

/**
 * Supported tokens with configuration
 * These are the primary tokens for the production adapter
 * Note: USDT is not currently supported by the ShadowWire SDK
 */
const PRODUCTION_TOKENS: TokenSymbol[] = ['SOL', 'USDC', 'RADR', 'BONK', 'ORE'];

/**
 * ShadowWire Production Adapter
 *
 * Uses the official @radr/shadowwire SDK for all operations.
 *
 * @example
 * ```typescript
 * const adapter = new ShadowWireProductionAdapter();
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
export class ShadowWireProductionAdapter extends BaseAdapter {
  readonly provider = PrivacyProvider.SHADOWWIRE;
  readonly name = 'ShadowWire (Production)';
  readonly supportedLevels: PrivacyLevel[] = [
    PrivacyLevel.AMOUNT_HIDDEN,
    PrivacyLevel.SENDER_HIDDEN,
  ];
  readonly supportedTokens: string[] = PRODUCTION_TOKENS;

  private client: ShadowWireClient | null = null;
  private apiKey?: string;
  private wasmInitialized = false;
  private debug: boolean;
  private keypair: import('@solana/web3.js').Keypair | null = null;

  constructor(apiKey?: string, debug = false) {
    super();
    this.apiKey = apiKey;
    this.debug = debug;
  }

  /**
   * Override initialize to capture the original Keypair before conversion
   */
  async initialize(
    connection: import('@solana/web3.js').Connection,
    wallet?: import('../types').WalletAdapter | import('@solana/web3.js').Keypair
  ): Promise<void> {
    // Store the Keypair directly if provided (before base class converts it)
    if (wallet && 'secretKey' in wallet && (wallet as any).secretKey) {
      this.keypair = wallet as import('@solana/web3.js').Keypair;
    }
    // Call parent initialize
    await super.initialize(connection, wallet);
  }

  /**
   * Initialize the adapter with the official SDK
   */
  protected async onInitialize(): Promise<void> {
    // Create the ShadowWire client
    this.client = new ShadowWireClient({
      apiKey: this.apiKey,
      network: 'mainnet-beta',
      debug: this.debug,
    });

    // Try to initialize WASM for client-side proof generation
    if (isWASMSupported()) {
      try {
        await initWASM();
        this.wasmInitialized = true;
        this.logger.info('WASM initialized for client-side proof generation');
      } catch (error) {
        this.logger.warn('WASM initialization failed, using server-side proofs', error);
        this.wasmInitialized = false;
      }
    } else {
      this.logger.info('WASM not supported, using server-side proof generation');
    }

    this.logger.info('ShadowWire Production adapter initialized');
  }

  /**
   * Get the ShadowWire client instance
   */
  private getClient(): ShadowWireClient {
    if (!this.client) {
      throw new Error('ShadowWire client not initialized');
    }
    return this.client;
  }

  /**
   * Validate token is supported
   */
  private validateToken(token: string): TokenSymbol {
    const normalizedToken = token.toUpperCase() as TokenSymbol;
    if (!PRODUCTION_TOKENS.includes(normalizedToken)) {
      throw new Error(`Token ${token} not supported. Supported tokens: ${PRODUCTION_TOKENS.join(', ')}`);
    }
    return normalizedToken;
  }

  /**
   * Convert SDK wallet adapter to ShadowWire wallet adapter
   */
  private getShadowWireWallet(): { signMessage: (message: Uint8Array) => Promise<Uint8Array> } {
    const wallet = this.ensureWallet();
    return {
      signMessage: (message: Uint8Array) => wallet.signMessage(message),
    };
  }

  /**
   * Get wallet address
   */
  private getWalletAddress(): string {
    const wallet = this.ensureWallet();
    return wallet.publicKey.toBase58();
  }

  /**
   * Map ShadowWire errors to SDK errors
   */
  private mapError(error: unknown, operation: string): Error {
    if (error instanceof SWInsufficientBalanceError) {
      return new InsufficientBalanceError(0, 0, 'unknown');
    }
    if (error instanceof InvalidAddressError) {
      return new TransactionError(`Invalid address: ${error.message}`);
    }
    if (error instanceof InvalidAmountError) {
      return new TransactionError(`Invalid amount: ${error.message}`);
    }
    if (error instanceof RecipientNotFoundError) {
      return new TransactionError(`Recipient not found: ${error.message}`);
    }
    if (error instanceof ProofUploadError) {
      return new TransactionError(`Proof upload failed: ${error.message}`);
    }
    if (error instanceof TransferError) {
      return new TransactionError(`Transfer failed: ${error.message}`);
    }
    if (error instanceof SWNetworkError) {
      return new NetworkError(`Network error: ${error.message}`);
    }
    if (error instanceof WASMNotSupportedError) {
      return new ProofGenerationError('bulletproof', new Error('WASM not supported'));
    }
    if (error instanceof SWProofGenerationError) {
      return new ProofGenerationError('bulletproof', error);
    }
    if (error instanceof ShadowWireError) {
      return new TransactionError(`${operation} failed: ${error.message}`);
    }
    return wrapError(error, `${operation} failed`);
  }

  /**
   * Get shielded balance for a token
   */
  async getBalance(token: string, address?: string): Promise<number> {
    this.ensureReady();
    const client = this.getClient();
    const normalizedToken = this.validateToken(token);

    const walletAddress = address || this.getWalletAddress();

    try {
      const balance: PoolBalance = await client.getBalance(walletAddress, normalizedToken);
      return balance.available;
    } catch (error) {
      this.logger.warn(`Failed to get balance for ${token}:`, error);
      // Return 0 for accounts that don't exist in the pool yet
      if (error instanceof ShadowWireError) {
        return 0;
      }
      throw this.mapError(error, 'getBalance');
    }
  }

  /**
   * Deposit into ShadowWire privacy pool
   */
  async deposit(request: DepositRequest): Promise<DepositResult> {
    this.ensureReady();
    const client = this.getClient();
    const token = this.validateToken(request.token);

    // Check minimum amount (TOKEN_MINIMUMS is in smallest units, convert to token units)
    const minAmountSmallest = TOKEN_MINIMUMS[token] || 0;
    const decimals = TOKEN_DECIMALS[token] || 9;
    const minAmount = minAmountSmallest / Math.pow(10, decimals);
    if (request.amount < minAmount) {
      throw new AmountBelowMinimumError(
        request.amount,
        minAmount,
        token,
        this.provider
      );
    }

    const walletAddress = this.getWalletAddress();

    // Convert amount from token units to smallest units (lamports) - reuse decimals from above
    const amountInSmallestUnits = Math.floor(request.amount * Math.pow(10, decimals));

    this.logger.info(`Depositing ${request.amount} ${token} (${amountInSmallestUnits} smallest units) into ShadowWire`);

    try {
      const response: DepositResponse = await client.deposit({
        wallet: walletAddress,
        amount: amountInSmallestUnits,
        token_mint: TOKEN_MINTS[token],
      });

      if (!response.success) {
        throw new TransactionError('Deposit request failed');
      }

      this.logger.info(`Deposit prepared: pool=${response.pool_address}`);

      // Sign and submit the unsigned transaction
      if (response.unsigned_tx_base64 && this.keypair && this.connection) {
        const { VersionedTransaction } = await import('@solana/web3.js');
        const txBuffer = Buffer.from(response.unsigned_tx_base64, 'base64');
        const versionedTx = VersionedTransaction.deserialize(txBuffer);
        versionedTx.sign([this.keypair]);

        const signature = await this.connection.sendRawTransaction(versionedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        this.logger.info(`Deposit submitted: ${signature}`);

        // Wait for confirmation
        await this.connection.confirmTransaction(signature, 'confirmed');
        this.logger.info(`Deposit confirmed: ${signature}`);

        return {
          signature,
          provider: this.provider,
          commitment: response.pool_address,
          fee: 0,
        };
      }

      // If no unsigned tx or can't sign, return what we have
      return {
        signature: response.user_balance_pda || '',
        provider: this.provider,
        commitment: response.pool_address,
        fee: 0,
        unsignedTransaction: response.unsigned_tx_base64,
      };
    } catch (error) {
      throw this.mapError(error, 'deposit');
    }
  }

  /**
   * Withdraw from ShadowWire privacy pool
   */
  async withdraw(request: WithdrawRequest): Promise<WithdrawResult> {
    this.ensureReady();
    const client = this.getClient();
    const token = this.validateToken(request.token);

    // Check minimum amount (TOKEN_MINIMUMS is in smallest units, convert to token units)
    const minAmountSmallest = TOKEN_MINIMUMS[token] || 0;
    const decimals = TOKEN_DECIMALS[token] || 9;
    const minAmount = minAmountSmallest / Math.pow(10, decimals);
    if (request.amount < minAmount) {
      throw new AmountBelowMinimumError(
        request.amount,
        minAmount,
        token,
        this.provider
      );
    }

    const walletAddress = this.getWalletAddress();

    // Convert amount from token units to smallest units (lamports) - reuse decimals from above
    const amountInSmallestUnits = Math.floor(request.amount * Math.pow(10, decimals));

    this.logger.info(`Withdrawing ${request.amount} ${token} (${amountInSmallestUnits} smallest units) from ShadowWire`);

    try {
      const response: WithdrawResponse = await client.withdraw({
        wallet: walletAddress,
        amount: amountInSmallestUnits,
        token_mint: TOKEN_MINTS[token],
      });

      if (!response.success) {
        throw new TransactionError(response.error || 'Withdrawal failed');
      }

      this.logger.info(`Withdrawal complete: ${response.tx_signature}`);

      return {
        signature: response.tx_signature || '',
        provider: this.provider,
        fee: response.fee || 0,
      };
    } catch (error) {
      throw this.mapError(error, 'withdraw');
    }
  }

  /**
   * Execute a private transfer via ShadowWire
   *
   * Internal transfers (AMOUNT_HIDDEN): Amount encrypted with ZK proofs
   * External transfers (SENDER_HIDDEN): Sender identity protected
   */
  async transfer(request: TransferRequest): Promise<TransferResult> {
    this.ensureReady();
    const client = this.getClient();
    const token = this.validateToken(request.token);

    // Check minimum amount (TOKEN_MINIMUMS is in smallest units, convert to token units)
    const minAmountSmallest = TOKEN_MINIMUMS[token] || 0;
    const decimals = TOKEN_DECIMALS[token] || 9;
    const minAmount = minAmountSmallest / Math.pow(10, decimals);
    if (request.amount < minAmount) {
      throw new AmountBelowMinimumError(
        request.amount,
        minAmount,
        token,
        this.provider
      );
    }

    const walletAddress = this.getWalletAddress();
    const recipient = typeof request.recipient === 'string'
      ? request.recipient
      : request.recipient.toBase58();

    // Convert amount from token units to smallest units (lamports) - reuse decimals from above
    const amountInSmallestUnits = Math.floor(request.amount * Math.pow(10, decimals));

    // Determine transfer type based on privacy level
    const transferType: TransferType =
      request.privacy === PrivacyLevel.AMOUNT_HIDDEN ? 'internal' : 'external';

    this.logger.info(`Initiating ${transferType} transfer of ${request.amount} ${token} (${amountInSmallestUnits} smallest units)`);

    try {
      // Generate signature for authentication
      const shadowWireWallet = this.getShadowWireWallet();
      const signatureTransferType = determineSignatureTransferType(transferType === 'internal');
      const signatureAuth = await generateTransferSignature(shadowWireWallet, signatureTransferType);

      // Check if we should use client-side proofs
      let customProof: ZKProofData | undefined;
      if (this.wasmInitialized && transferType === 'internal') {
        try {
          this.logger.debug('Generating client-side range proof');
          customProof = await generateRangeProof(
            amountInSmallestUnits,
            BULLETPROOF_INFO.DEFAULT_BIT_LENGTH
          );
          this.logger.debug('Client-side proof generated successfully');
        } catch (error) {
          this.logger.warn('Client-side proof generation failed, using server-side', error);
          customProof = undefined;
        }
      }

      // Execute the transfer
      let response: TransferResponse;

      if (customProof) {
        // Use transfer with client-generated proofs
        response = await client.transferWithClientProofs({
          sender: walletAddress,
          recipient,
          amount: amountInSmallestUnits,
          token,
          type: transferType,
          customProof,
          wallet: shadowWireWallet,
        });
      } else {
        // Use standard transfer (server generates proofs)
        response = await client.transfer({
          sender: walletAddress,
          recipient,
          amount: amountInSmallestUnits,
          token,
          type: transferType,
          wallet: shadowWireWallet,
        });
      }

      if (!response.success) {
        throw new TransactionError('Transfer failed');
      }

      this.logger.info(`Transfer complete: ${response.tx_signature}`);

      // Calculate fee
      const feePercentage = TOKEN_FEES[token] || 0.01;
      const fee = request.amount * feePercentage;

      return {
        signature: response.tx_signature,
        provider: this.provider,
        privacyLevel: request.privacy,
        fee,
        anonymitySet: response.amount_hidden ? 500 : undefined,
      };
    } catch (error) {
      throw this.mapError(error, 'transfer');
    }
  }

  /**
   * Estimate operation costs
   */
  async estimate(request: EstimateRequest): Promise<EstimateResult> {
    const token = (request.token || 'SOL').toUpperCase() as TokenSymbol;

    // Check if token is supported
    if (!PRODUCTION_TOKENS.includes(token)) {
      return {
        fee: 0,
        provider: this.provider,
        latencyMs: 0,
        warnings: [`Token ${token} not supported by ShadowWire Production`],
      };
    }

    const client = this.getClient();
    const amount = request.amount || 0;

    // Get fee information from SDK
    const feePercentage = client.getFeePercentage(token);
    const minAmount = client.getMinimumAmount(token);
    const feeCalc = client.calculateFee(amount, token);

    const warnings: string[] = [];
    if (amount > 0 && amount < minAmount) {
      warnings.push(`Amount ${amount} ${token} is below minimum ${minAmount}`);
    }

    // Estimate latency based on operation type and proof generation
    let latencyMs = 3000; // Base latency
    if (request.operation === 'transfer') {
      if (request.privacy === PrivacyLevel.AMOUNT_HIDDEN) {
        // Internal transfers with ZK proofs take longer
        latencyMs = this.wasmInitialized ? 4000 : 6000;
      } else {
        latencyMs = 3000;
      }
    } else if (request.operation === 'deposit' || request.operation === 'withdraw') {
      latencyMs = 4000;
    }

    return {
      fee: feeCalc.fee,
      tokenFee: feeCalc.fee,
      provider: this.provider,
      latencyMs,
      anonymitySet: 500, // Estimated pool size
      warnings,
    };
  }

  /**
   * Generate a ZK proof locally using WASM
   * Useful for pre-generating proofs before transfers
   */
  async generateProofLocally(amount: number, token: TokenSymbol): Promise<ZKProofData> {
    if (!this.wasmInitialized) {
      throw new ProofGenerationError('bulletproof', new Error('WASM not initialized'));
    }

    const client = this.getClient();
    return client.generateProofLocally(amount, token);
  }

  /**
   * Check if WASM is available for client-side proof generation
   */
  isWASMAvailable(): boolean {
    return this.wasmInitialized;
  }

  /**
   * Get Bulletproof information
   */
  getBulletproofInfo(): typeof BULLETPROOF_INFO {
    return BULLETPROOF_INFO;
  }

  /**
   * Get fee percentage for a token
   */
  getFeePercentage(token: string): number {
    const normalizedToken = token.toUpperCase() as TokenSymbol;
    return TOKEN_FEES[normalizedToken] || 0.01;
  }

  /**
   * Get minimum amount for a token
   */
  getMinimumAmount(token: string): number {
    const normalizedToken = token.toUpperCase() as TokenSymbol;
    return TOKEN_MINIMUMS[normalizedToken] || 0;
  }

  /**
   * Get token decimals
   */
  getTokenDecimals(token: string): number {
    const normalizedToken = token.toUpperCase() as TokenSymbol;
    return TOKEN_DECIMALS[normalizedToken] || 9;
  }

  /**
   * Get token mint address
   */
  getTokenMint(token: string): string | undefined {
    const normalizedToken = token.toUpperCase() as TokenSymbol;
    return TOKEN_MINTS[normalizedToken];
  }

  /**
   * Calculate fee breakdown for an amount
   */
  calculateFee(
    amount: number,
    token: string
  ): { fee: number; feePercentage: number; netAmount: number } {
    const client = this.getClient();
    const normalizedToken = token.toUpperCase() as TokenSymbol;
    return client.calculateFee(amount, normalizedToken);
  }
}

/**
 * Factory function to create ShadowWire production adapter
 */
export function createShadowWireProductionAdapter(
  apiKey?: string,
  debug = false
): ShadowWireProductionAdapter {
  return new ShadowWireProductionAdapter(apiKey, debug);
}
