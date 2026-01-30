/**
 * Privacy Cash Production Adapter
 *
 * Uses the official `privacycash` SDK for production-ready
 * privacy pool operations on Solana.
 *
 * Features:
 * - Real deposits/withdrawals via official SDK
 * - SOL, USDC, USDT, ORE, ZEC, STORE support
 * - Automatic UTXO management
 * - Real ZK proofs via relayer
 *
 * @module adapters/privacycash-production
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
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
  TransactionError,
  InsufficientBalanceError,
  AmountBelowMinimumError,
  wrapError,
} from '../utils/errors';

// Import official Privacy Cash SDK
import { PrivacyCash } from 'privacycash';

/**
 * Token configurations with mint addresses and decimals
 */
const TOKEN_CONFIGS: Record<string, {
  mint: string;
  decimals: number;
  minDeposit: number;
  minWithdraw: number;
}> = {
  SOL: {
    mint: 'So11111111111111111111111111111111111111112',
    decimals: 9,
    minDeposit: 0.01,
    minWithdraw: 0.01,
  },
  USDC: {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    minDeposit: 2,
    minWithdraw: 2,
  },
  USDT: {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
    minDeposit: 2,
    minWithdraw: 2,
  },
  ORE: {
    mint: 'oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp',
    decimals: 11,
    minDeposit: 0.02,
    minWithdraw: 0.02,
  },
  ZEC: {
    mint: 'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS',
    decimals: 8,
    minDeposit: 0.01,
    minWithdraw: 0.01,
  },
  STORE: {
    mint: 'sTorERYB6xAZ1SSbwpK3zoK2EEwbBrc7TZAzg1uCGiH',
    decimals: 9,
    minDeposit: 0.02,
    minWithdraw: 0.02,
  },
};

/**
 * RPC URLs for different networks
 */
const RPC_URLS = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
};

/**
 * Privacy Cash Production Adapter
 *
 * Uses the official privacycash SDK for all operations.
 */
export class PrivacyCashProductionAdapter extends BaseAdapter {
  readonly provider = PrivacyProvider.PRIVACY_CASH;
  readonly name = 'Privacy Cash (Production)';
  readonly supportedLevels: PrivacyLevel[] = [
    PrivacyLevel.COMPLIANT_POOL,
    PrivacyLevel.SENDER_HIDDEN,
  ];
  readonly supportedTokens = Object.keys(TOKEN_CONFIGS);

  private privacyCashClient: PrivacyCash | null = null;
  private network: 'mainnet-beta' | 'devnet' = 'devnet';
  private keypair: Keypair | null = null;

  /**
   * Override initialize to capture the original Keypair before conversion
   * The Privacy Cash SDK requires a Keypair, not a WalletAdapter
   */
  async initialize(connection: Connection, wallet?: WalletAdapter | Keypair): Promise<void> {
    // Store the Keypair directly if provided (before base class converts it)
    if (wallet && 'secretKey' in wallet && wallet.secretKey) {
      this.keypair = wallet as Keypair;
    }
    // Call parent initialize
    await super.initialize(connection, wallet);
  }

  /**
   * Initialize the adapter with the official SDK
   */
  protected async onInitialize(): Promise<void> {
    // Determine network
    const genesisHash = await this.connection!.getGenesisHash();
    this.network = genesisHash === '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
      ? 'mainnet-beta'
      : 'devnet';

    this.logger.info(`Privacy Cash Production adapter initialized on ${this.network}`);
  }

  /**
   * Create or get Privacy Cash client
   */
  private getClient(): PrivacyCash {
    if (!this.privacyCashClient) {
      if (!this.keypair) {
        throw new Error('Privacy Cash requires a Keypair wallet. Wallet adapter signing is not supported by the official SDK.');
      }

      this.privacyCashClient = new PrivacyCash({
        RPC_url: RPC_URLS[this.network],
        owner: this.keypair,
        enableDebug: true,
      });
    }
    return this.privacyCashClient;
  }

  /**
   * Get shielded balance
   */
  async getBalance(token: string, _address?: string): Promise<number> {
    this.ensureReady();
    const client = this.getClient();
    const normalizedToken = token.toUpperCase();
    const config = TOKEN_CONFIGS[normalizedToken];

    if (!config) {
      throw new Error(`Token ${token} not supported`);
    }

    try {
      if (normalizedToken === 'SOL') {
        const { lamports } = await client.getPrivateBalance();
        return lamports / LAMPORTS_PER_SOL;
      } else if (normalizedToken === 'USDC') {
        const { amount } = await client.getPrivateBalanceUSDC();
        return amount;
      } else {
        const { amount } = await client.getPrivateBalanceSpl(config.mint);
        return amount;
      }
    } catch (error) {
      this.logger.warn(`Failed to get balance for ${token}:`, error);
      return 0;
    }
  }

  /**
   * Deposit into Privacy Cash pool
   */
  async deposit(request: DepositRequest): Promise<DepositResult> {
    this.ensureReady();
    const client = this.getClient();
    const token = request.token.toUpperCase();
    const config = TOKEN_CONFIGS[token];

    if (!config) {
      throw new Error(`Token ${request.token} not supported`);
    }

    if (request.amount < config.minDeposit) {
      throw new AmountBelowMinimumError(
        request.amount,
        config.minDeposit,
        token,
        this.provider
      );
    }

    this.logger.info(`Depositing ${request.amount} ${token} into Privacy Cash`);

    try {
      let result: { tx: string };

      if (token === 'SOL') {
        const lamports = Math.floor(request.amount * LAMPORTS_PER_SOL);
        result = await client.deposit({ lamports });
      } else if (token === 'USDC') {
        const base_units = Math.floor(request.amount * Math.pow(10, config.decimals));
        result = await client.depositUSDC({ base_units });
      } else {
        // For other SPL tokens, use depositSPL if available
        const base_units = Math.floor(request.amount * Math.pow(10, config.decimals));
        result = await (client as any).depositSPL({
          base_units,
          mintAddress: config.mint,
          amount: request.amount,
        });
      }

      this.logger.info(`Deposit complete: ${result.tx}`);

      return {
        signature: result.tx,
        provider: this.provider,
        fee: 0, // Deposit fee is 0 according to API config
      };
    } catch (error) {
      throw wrapError(error, 'Privacy Cash deposit failed');
    }
  }

  /**
   * Withdraw from Privacy Cash pool
   */
  async withdraw(request: WithdrawRequest): Promise<WithdrawResult> {
    this.ensureReady();
    const client = this.getClient();
    const token = (request.token || 'SOL').toUpperCase();
    const config = TOKEN_CONFIGS[token];

    if (!config) {
      throw new Error(`Token ${token} not supported`);
    }

    const recipient = typeof request.recipient === 'string'
      ? request.recipient
      : request.recipient.toBase58();

    this.logger.info(`Withdrawing ${request.amount} ${token} to ${recipient}`);

    try {
      let result: {
        isPartial: boolean;
        tx: string;
        recipient: string;
        amount_in_lamports?: number;
        fee_in_lamports?: number;
        base_units?: number;
        fee_base_units?: number;
      };

      if (token === 'SOL') {
        const lamports = Math.floor(request.amount * LAMPORTS_PER_SOL);
        result = await client.withdraw({
          lamports,
          recipientAddress: recipient,
        });
      } else if (token === 'USDC') {
        const base_units = Math.floor(request.amount * Math.pow(10, config.decimals));
        result = await client.withdrawUSDC({
          base_units,
          recipientAddress: recipient,
        });
      } else {
        const base_units = Math.floor(request.amount * Math.pow(10, config.decimals));
        result = await (client as any).withdrawSPL({
          base_units,
          mintAddress: config.mint,
          recipientAddress: recipient,
          amount: request.amount,
        });
      }

      // Calculate fee
      let fee = 0;
      if (result.fee_in_lamports) {
        fee = result.fee_in_lamports / LAMPORTS_PER_SOL;
      } else if (result.fee_base_units) {
        fee = result.fee_base_units / Math.pow(10, config.decimals);
      }

      this.logger.info(`Withdrawal complete: ${result.tx}`);
      if (result.isPartial) {
        this.logger.warn('Partial withdrawal - not all funds were withdrawn');
      }

      return {
        signature: result.tx,
        provider: this.provider,
        fee,
      };
    } catch (error) {
      throw wrapError(error, 'Privacy Cash withdrawal failed');
    }
  }

  /**
   * Private transfer (deposit + withdraw)
   */
  async transfer(request: TransferRequest): Promise<TransferResult> {
    this.ensureReady();

    this.logger.info(`Privacy Cash transfer: ${request.amount} ${request.token}`);

    // Step 1: Deposit
    const depositResult = await this.deposit({
      amount: request.amount,
      token: request.token,
    });

    // Step 2: Withdraw to recipient
    const withdrawResult = await this.withdraw({
      amount: request.amount,
      token: request.token,
      recipient: request.recipient,
    });

    return {
      signature: withdrawResult.signature,
      provider: this.provider,
      privacyLevel: PrivacyLevel.COMPLIANT_POOL,
      fee: depositResult.fee + withdrawResult.fee,
    };
  }

  /**
   * Estimate operation costs
   */
  async estimate(request: EstimateRequest): Promise<EstimateResult> {
    const token = (request.token || 'SOL').toUpperCase();
    const config = TOKEN_CONFIGS[token];

    if (!config) {
      return {
        fee: 0,
        provider: this.provider,
        latencyMs: 0,
        warnings: [`Token ${token} not supported`],
      };
    }

    const amount = request.amount || 0;
    // Withdrawal fee is 0.35% according to API config
    const feeRate = 0.0035;
    let fee = 0;

    if (request.operation === 'withdraw' || request.operation === 'transfer') {
      fee = amount * feeRate;
    }

    const warnings: string[] = [];
    if (amount > 0 && amount < config.minDeposit) {
      warnings.push(`Amount below minimum ${config.minDeposit} ${token}`);
    }

    return {
      fee,
      tokenFee: fee,
      provider: this.provider,
      latencyMs: request.operation === 'withdraw' ? 15000 : 5000,
      warnings,
    };
  }

  /**
   * Clear UTXO cache
   */
  async clearCache(): Promise<void> {
    if (this.privacyCashClient) {
      await this.privacyCashClient.clearCache();
    }
  }
}

/**
 * Factory function to create Privacy Cash production adapter
 */
export function createPrivacyCashProductionAdapter(): PrivacyCashProductionAdapter {
  return new PrivacyCashProductionAdapter();
}
