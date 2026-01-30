/**
 * Arcium Adapter
 *
 * Production integration with Arcium's Multi-Party Computation network
 * for fully encrypted DeFi operations on Solana.
 *
 * Features:
 * - C-SPL (Confidential SPL) token support with encrypted balances
 * - Multi-party computation for confidential state transitions
 * - Confidential swaps, transfers, and DeFi operations
 * - Compatible with Anchor development patterns
 * - Uses real Arcium program IDs and encryption protocols
 */
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  type TransactionSignature,
} from '@solana/web3.js';
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
import { wrapError } from '../utils/errors';
import {
  ArciumClient,
  CSPLTokenClient,
  CSPL_TOKEN_CONFIGS,
  CSPL_PROGRAM_IDS,
  type ArciumClientConfig,
  type EncryptedValue,
  type MempoolPriorityFeeStats,
  CLUSTER_OFFSETS,
  ArciumError,
  ArciumErrorType,
} from '../arcium';

/**
 * Arcium network RPC endpoints
 */
const ARCIUM_RPC_ENDPOINTS = {
  devnet: 'https://api.devnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
} as const;

/**
 * Supported tokens for Arcium C-SPL operations
 */
const SUPPORTED_TOKENS = Object.keys(CSPL_TOKEN_CONFIGS);

/**
 * Fee structure for Arcium operations (in percentage)
 */
const FEE_STRUCTURE: {
  transfer: number;
  shield: number;
  unshield: number;
  priorityFeeBase: number;
} = {
  transfer: 0.002, // 0.2%
  shield: 0.001, // 0.1%
  unshield: 0.001, // 0.1%
  priorityFeeBase: 5000, // Base priority fee in lamports
};

/**
 * Latency estimates for different operations (in milliseconds)
 * MPC operations require coordination with multiple nodes
 */
const LATENCY_ESTIMATES = {
  transfer: 8000, // MPC coordination for encrypted transfer
  shield: 4000, // Simpler operation - just wrapping
  unshield: 6000, // MPC verification of encrypted balance
  prove: 10000, // Full MPC computation
} as const;

/**
 * Arcium Adapter
 *
 * Production-ready adapter for Arcium's MPC network providing:
 * - Confidential token transfers with hidden amounts
 * - Shield/unshield operations for C-SPL tokens
 * - Encrypted balance management
 * - MPC-based confidential computation
 */
export class ArciumAdapter extends BaseAdapter {
  readonly provider = PrivacyProvider.ARCIUM;
  readonly name = 'Arcium';
  readonly supportedLevels: PrivacyLevel[] = [
    PrivacyLevel.FULL_ENCRYPTED,
    PrivacyLevel.AMOUNT_HIDDEN,
    PrivacyLevel.SENDER_HIDDEN,
  ];
  readonly supportedTokens = SUPPORTED_TOKENS;

  private arciumClient: ArciumClient | null = null;
  private csplClient: CSPLTokenClient | null = null;
  private network: 'devnet' | 'mainnet-beta' = 'devnet';
  private clusterOffset: number = CLUSTER_OFFSETS.DEVNET_V063;

  /**
   * Initialize Arcium adapter
   * Establishes connection to Arcium MPC network and fetches MXE public key
   */
  protected async onInitialize(): Promise<void> {
    if (!this.connection) {
      throw new ArciumError(ArciumErrorType.NetworkError, 'Connection not available');
    }

    // Determine network from connection
    try {
      const genesisHash = await this.connection.getGenesisHash();

      // Mainnet genesis hash
      if (genesisHash === '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') {
        this.network = 'mainnet-beta';
        this.clusterOffset = CLUSTER_OFFSETS.MAINNET;
      } else {
        this.network = 'devnet';
        this.clusterOffset = CLUSTER_OFFSETS.DEVNET_V063;
      }
    } catch {
      // Default to devnet if genesis hash check fails
      this.network = 'devnet';
      this.clusterOffset = CLUSTER_OFFSETS.DEVNET_V063;
    }

    // Get RPC URL from connection or use default
    const rpcUrl = ARCIUM_RPC_ENDPOINTS[this.network];

    // Initialize Arcium client
    const config: ArciumClientConfig = {
      cluster: this.network,
      clusterOffset: this.clusterOffset,
      rpcUrl,
      commitment: 'confirmed',
    };

    this.arciumClient = new ArciumClient(config);

    // Set wallet if available
    if (this.wallet) {
      this.arciumClient.setWallet(this.wallet);
    }

    // Initialize client and fetch MXE public key
    try {
      await this.arciumClient.initialize();
    } catch (error) {
      this.logger.warn('Failed to fetch MXE public key - some operations may be limited', error);
      // Continue anyway - some read operations can still work
    }

    // Initialize C-SPL client
    this.csplClient = new CSPLTokenClient(this.arciumClient);
    if (this.wallet) {
      this.csplClient.setWallet(this.wallet);
    }

    this.logger.info(`Arcium adapter initialized on ${this.network}`);
    this.logger.info(`  Cluster offset: ${this.clusterOffset}`);
    this.logger.info(`  Supported tokens: ${SUPPORTED_TOKENS.join(', ')}`);
  }

  /**
   * Update wallet reference
   */
  setWallet(wallet: WalletAdapter): void {
    super.setWallet(wallet);
    if (this.arciumClient) {
      this.arciumClient.setWallet(wallet);
    }
    if (this.csplClient) {
      this.csplClient.setWallet(wallet);
    }
  }

  /**
   * Get confidential balance for a token
   * Uses the connected wallet's encryption key to decrypt the balance
   */
  async getBalance(token: string, address?: string): Promise<number> {
    this.ensureReady();

    const walletAddress = address || this.wallet?.publicKey.toBase58();
    if (!walletAddress) {
      throw new ArciumError(ArciumErrorType.InvalidInput, 'No wallet address provided');
    }

    const tokenUpper = token.toUpperCase();
    const tokenConfig = CSPL_TOKEN_CONFIGS[tokenUpper];

    if (!tokenConfig) {
      throw new ArciumError(ArciumErrorType.InvalidInput, `Token ${token} not supported by Arcium`);
    }

    try {
      // If querying for connected wallet, use C-SPL client to decrypt balance
      if (this.csplClient && this.wallet && walletAddress === this.wallet.publicKey.toBase58()) {
        return await this.csplClient.getBalance(tokenUpper);
      }

      // For other addresses, we can only return the encrypted balance exists or not
      const ownerPubkey = new PublicKey(walletAddress);
      const accountInfo = await this.csplClient?.getConfidentialAccountInfo(
        ownerPubkey,
        tokenConfig.mint
      );

      if (accountInfo) {
        // Account exists but we can't decrypt it
        this.logger.debug(`Confidential account exists for ${walletAddress} but balance is encrypted`);
        return -1; // Indicate encrypted balance exists
      }

      // No confidential account - check regular balance
      const connection = this.getConnection();
      if (tokenUpper === 'SOL') {
        const balance = await connection.getBalance(new PublicKey(walletAddress));
        return balance / LAMPORTS_PER_SOL;
      }

      return 0;
    } catch (error) {
      throw wrapError(error, 'Failed to get Arcium balance');
    }
  }

  /**
   * Execute a confidential transfer via Arcium MPC
   * Amount and balance changes are hidden from observers
   */
  async transfer(request: TransferRequest): Promise<TransferResult> {
    this.ensureReady();
    const wallet = this.ensureWallet();

    if (!this.arciumClient || !this.csplClient) {
      throw new ArciumError(ArciumErrorType.NetworkError, 'Arcium client not initialized');
    }

    const token = request.token.toUpperCase();
    const tokenConfig = CSPL_TOKEN_CONFIGS[token];

    if (!tokenConfig) {
      throw new ArciumError(ArciumErrorType.InvalidInput, `Token ${request.token} not supported by Arcium`);
    }

    const recipient =
      typeof request.recipient === 'string'
        ? new PublicKey(request.recipient)
        : request.recipient;

    this.logger.info(`Initiating confidential transfer of ${request.amount} ${token}`);

    try {
      // Encrypt the transfer amount
      const encryptedAmount = this.csplClient.encryptAmount(request.amount, tokenConfig.mint);

      // Execute confidential transfer
      const signature = await this.csplClient.confidentialTransfer({
        sender: wallet.publicKey,
        recipient,
        encryptedAmount,
        mint: tokenConfig.mint,
      });

      this.logger.info(`Confidential transfer complete: ${signature}`);

      // Calculate fee
      const fee = request.amount * FEE_STRUCTURE.transfer;

      return {
        signature,
        provider: this.provider,
        privacyLevel: PrivacyLevel.FULL_ENCRYPTED,
        fee,
        anonymitySet: undefined, // MPC provides computational privacy, not anonymity set
      };
    } catch (error) {
      throw wrapError(error, 'Arcium confidential transfer failed');
    }
  }

  /**
   * Shield tokens into Arcium confidential pool
   * Converts regular SPL tokens to C-SPL tokens with encrypted balances
   */
  async deposit(request: DepositRequest): Promise<DepositResult> {
    this.ensureReady();
    const wallet = this.ensureWallet();

    if (!this.csplClient) {
      throw new ArciumError(ArciumErrorType.NetworkError, 'C-SPL client not initialized');
    }

    const token = request.token.toUpperCase();
    const tokenConfig = CSPL_TOKEN_CONFIGS[token];

    if (!tokenConfig) {
      throw new ArciumError(ArciumErrorType.InvalidInput, `Token ${request.token} not supported by Arcium`);
    }

    this.logger.info(`Shielding ${request.amount} ${token} into Arcium`);

    try {
      // Ensure confidential account is initialized
      const accountInfo = await this.csplClient.getConfidentialAccountInfo(
        wallet.publicKey,
        tokenConfig.mint
      );

      if (!accountInfo) {
        this.logger.info('Initializing confidential account...');
        await this.csplClient.initializeConfidentialAccount(tokenConfig.mint);
      }

      // Shield tokens
      const signature = await this.csplClient.shield({
        sourceAccount: wallet.publicKey,
        amount: request.amount,
        mint: tokenConfig.mint,
      });

      this.logger.info(`Shield complete: ${signature}`);

      return {
        signature,
        provider: this.provider,
        fee: request.amount * FEE_STRUCTURE.shield,
      };
    } catch (error) {
      throw wrapError(error, 'Arcium shield operation failed');
    }
  }

  /**
   * Unshield tokens from Arcium confidential pool
   * Converts C-SPL tokens back to regular SPL tokens
   */
  async withdraw(request: WithdrawRequest): Promise<WithdrawResult> {
    this.ensureReady();
    const wallet = this.ensureWallet();

    if (!this.csplClient) {
      throw new ArciumError(ArciumErrorType.NetworkError, 'C-SPL client not initialized');
    }

    const token = request.token.toUpperCase();
    const tokenConfig = CSPL_TOKEN_CONFIGS[token];

    if (!tokenConfig) {
      throw new ArciumError(ArciumErrorType.InvalidInput, `Token ${request.token} not supported by Arcium`);
    }

    const recipient =
      typeof request.recipient === 'string'
        ? new PublicKey(request.recipient)
        : request.recipient;

    this.logger.info(`Unshielding ${request.amount} ${token} from Arcium`);

    try {
      const signature = await this.csplClient.unshield({
        destinationAccount: recipient,
        amount: request.amount,
        mint: tokenConfig.mint,
      });

      this.logger.info(`Unshield complete: ${signature}`);

      return {
        signature,
        provider: this.provider,
        fee: request.amount * FEE_STRUCTURE.unshield,
      };
    } catch (error) {
      throw wrapError(error, 'Arcium unshield operation failed');
    }
  }

  /**
   * Estimate costs for an operation
   */
  async estimate(request: EstimateRequest): Promise<EstimateResult> {
    const token = (request.token || 'SOL').toUpperCase();
    const amount = request.amount || 0;

    if (!CSPL_TOKEN_CONFIGS[token]) {
      return {
        fee: 0,
        provider: this.provider,
        latencyMs: 0,
        warnings: [`Token ${token} not supported by Arcium`],
      };
    }

    // Get mempool priority fee stats if client is initialized
    let priorityFee = FEE_STRUCTURE.priorityFeeBase;
    if (this.arciumClient) {
      try {
        const feeStats = await this.arciumClient.getMempoolPriorityFeeStats();
        priorityFee = Number(feeStats.median) || FEE_STRUCTURE.priorityFeeBase;
      } catch {
        // Use base priority fee if stats unavailable
      }
    }

    // Calculate operation fee
    const feePercent =
      request.operation === 'transfer' ? FEE_STRUCTURE.transfer :
      request.operation === 'deposit' ? FEE_STRUCTURE.shield :
      request.operation === 'withdraw' ? FEE_STRUCTURE.unshield :
      0;

    const operationFee = amount * feePercent;
    const priorityFeeSOL = priorityFee / LAMPORTS_PER_SOL;
    const totalFee = operationFee + priorityFeeSOL;

    // Get latency estimate
    const latencyMs =
      LATENCY_ESTIMATES[request.operation as keyof typeof LATENCY_ESTIMATES] || 5000;

    const warnings: string[] = [];

    // Check if token has confidential transfers enabled
    const tokenConfig = CSPL_TOKEN_CONFIGS[token];
    if (tokenConfig && !tokenConfig.confidentialTransferEnabled) {
      warnings.push(`${token} does not support confidential transfers yet`);
    }

    return {
      fee: totalFee,
      tokenFee: operationFee,
      provider: this.provider,
      latencyMs,
      anonymitySet: undefined, // MPC provides computational privacy, not anonymity set
      warnings,
    };
  }

  /**
   * Execute a confidential computation on Arcium MPC network
   * Allows arbitrary encrypted computations
   */
  async confidentialCompute<T>(
    compDefOffset: number,
    encryptedInputs: Uint8Array,
    priorityFee?: bigint
  ): Promise<T> {
    this.ensureReady();

    if (!this.arciumClient) {
      throw new ArciumError(ArciumErrorType.NetworkError, 'Arcium client not initialized');
    }

    // Get recommended priority fee if not provided
    let fee = priorityFee;
    if (!fee) {
      const feeStats = await this.arciumClient.getMempoolPriorityFeeStats();
      fee = feeStats.median || BigInt(FEE_STRUCTURE.priorityFeeBase);
    }

    // Queue computation
    const signature = await this.arciumClient.queueComputation({
      compDefOffset,
      encryptedInputs,
      priorityFee: fee,
    });

    this.logger.info(`Computation queued: ${signature}`);

    // Wait for computation to finalize
    // Generate a computation ID from the signature
    const computationId = new Uint8Array(32);
    const sigBytes = Buffer.from(signature, 'base64');
    sigBytes.copy(Buffer.from(computationId.buffer), 0, 0, 32);

    const result = await this.arciumClient.awaitComputationFinalization<T>(
      computationId,
      60000 // 1 minute timeout
    );

    return result.output;
  }

  /**
   * Encrypt data for MPC computation
   */
  encrypt<T>(value: T): EncryptedValue<T> {
    if (!this.arciumClient) {
      throw new ArciumError(ArciumErrorType.NetworkError, 'Arcium client not initialized');
    }
    return this.arciumClient.encrypt(value);
  }

  /**
   * Decrypt data from MPC computation result
   */
  decrypt<T>(encrypted: EncryptedValue<T>): T {
    if (!this.arciumClient) {
      throw new ArciumError(ArciumErrorType.NetworkError, 'Arcium client not initialized');
    }
    return this.arciumClient.decrypt(encrypted);
  }

  /**
   * Get the underlying Arcium client
   */
  getArciumClient(): ArciumClient | null {
    return this.arciumClient;
  }

  /**
   * Get the C-SPL token client
   */
  getCSPLClient(): CSPLTokenClient | null {
    return this.csplClient;
  }

  /**
   * Get current network
   */
  getNetwork(): 'devnet' | 'mainnet-beta' {
    return this.network;
  }

  /**
   * Get cluster offset
   */
  getClusterOffset(): number {
    return this.clusterOffset;
  }

  /**
   * Check if adapter is fully initialized with MXE connection
   */
  isFullyInitialized(): boolean {
    return this.arciumClient !== null && this.csplClient !== null;
  }

  /**
   * Get mempool statistics
   */
  async getMempoolStats(): Promise<MempoolPriorityFeeStats | null> {
    if (!this.arciumClient) {
      return null;
    }
    return this.arciumClient.getMempoolPriorityFeeStats();
  }

  /**
   * Apply pending confidential balance for a token
   * Finalizes incoming confidential transfers
   */
  async applyPendingBalance(token: string): Promise<TransactionSignature | null> {
    if (!this.csplClient) {
      return null;
    }

    const tokenConfig = CSPL_TOKEN_CONFIGS[token.toUpperCase()];
    if (!tokenConfig) {
      throw new ArciumError(ArciumErrorType.InvalidInput, `Token ${token} not supported`);
    }

    return this.csplClient.applyPendingBalance(tokenConfig.mint);
  }
}
