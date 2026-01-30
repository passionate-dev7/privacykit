/**
 * C-SPL (Confidential SPL) Token Module
 *
 * Implements confidential token operations using Arcium's MPC network.
 * C-SPL tokens support encrypted balances and confidential transfers
 * while maintaining composability with standard SPL tokens.
 *
 * Based on Arcium's Confidential SPL Token standard:
 * - Confidential Transfer Adapter
 * - Encrypted SPL Token
 * - Confidential Auditor Adapter
 */
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  type TransactionSignature,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from '@solana/spl-token';
import type { WalletAdapter } from '../types';
import {
  type CSPLTokenConfig,
  type ConfidentialTokenAccount,
  type ConfidentialTransferRequest,
  type ShieldRequest,
  type UnshieldRequest,
  type EncryptedValue,
  ConfidentialAccountState,
  ArciumError,
  ArciumErrorType,
} from './types';
import { ArciumClient } from './client';
import { ArciumEncryption, serializeLE, deserializeLE } from './encryption';

/**
 * C-SPL Program IDs
 * These programs work together to provide confidential token functionality
 */
export const CSPL_PROGRAM_IDS = {
  /** Confidential Transfer Adapter - extends Token-2022 for on-chain program support */
  confidentialTransferAdapter: new PublicKey('8ot7ugPZifAd2pDyq2M118QzFKgJrHKHBwCscHbiiSvM'),
  /** Encrypted SPL Token - lightweight confidential token implementation */
  encryptedSplToken: new PublicKey('GUDjGmajhtENqyih8p2pz5NaKbNFk7dsS6k5TrX7kyRh'),
  /** Confidential Auditor Adapter - programmable compliance */
  confidentialAuditorAdapter: new PublicKey('48nWF8oac4GcjyT19k7HbgcTjHEdfhsVAKq5eRxYpmEB'),
  /** Confidential ATA Program - associated token accounts for confidential tokens */
  confidentialAta: new PublicKey('HTwgGkQGGZBJQFg1EUGm1aSmi3G9MhBKbaLpRhnP6JGi'),
  /** Token Wrap Program - wrapping SPL tokens to confidential variants */
  tokenWrap: new PublicKey('YkdjzjDqWQ3khsojNZEGgoivbthWyty3YgnPur6sQAW'),
} as const;

/**
 * Account seeds for C-SPL PDA derivation
 */
const CSPL_SEEDS = {
  CONFIDENTIAL_ACCOUNT: Buffer.from('confidential_account'),
  CONFIDENTIAL_MINT: Buffer.from('confidential_mint'),
  SHIELD_VAULT: Buffer.from('shield_vault'),
  AUDITOR: Buffer.from('auditor'),
} as const;

/**
 * Supported C-SPL tokens with their configurations
 */
export const CSPL_TOKEN_CONFIGS: Record<string, CSPLTokenConfig> = {
  SOL: {
    mint: new PublicKey('So11111111111111111111111111111111111111112'),
    decimals: 9,
    confidentialTransferEnabled: true,
  },
  USDC: {
    mint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    decimals: 6,
    confidentialTransferEnabled: true,
  },
  USDT: {
    mint: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
    decimals: 6,
    confidentialTransferEnabled: true,
  },
  BONK: {
    mint: new PublicKey('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'),
    decimals: 5,
    confidentialTransferEnabled: false, // Not yet supported
  },
};

/**
 * C-SPL Token Client
 *
 * Handles confidential SPL token operations:
 * - Shield (wrap) regular SPL tokens to confidential
 * - Unshield (unwrap) confidential tokens back to regular
 * - Confidential transfers between accounts
 * - Query encrypted balances
 */
export class CSPLTokenClient {
  private connection: Connection;
  private wallet: WalletAdapter | null = null;
  private arciumClient: ArciumClient;
  private encryption: ArciumEncryption;

  constructor(arciumClient: ArciumClient) {
    this.arciumClient = arciumClient;
    this.connection = arciumClient.getConnection();
    this.encryption = arciumClient.getEncryption();
  }

  /**
   * Set wallet for signing transactions
   */
  setWallet(wallet: WalletAdapter): void {
    this.wallet = wallet;
    this.arciumClient.setWallet(wallet);
  }

  /**
   * Get confidential account address for a user and mint
   */
  getConfidentialAccountAddress(owner: PublicKey, mint: PublicKey): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
      [CSPL_SEEDS.CONFIDENTIAL_ACCOUNT, owner.toBuffer(), mint.toBuffer()],
      CSPL_PROGRAM_IDS.encryptedSplToken
    );
    return address;
  }

  /**
   * Get confidential mint address for an SPL token
   */
  getConfidentialMintAddress(mint: PublicKey): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
      [CSPL_SEEDS.CONFIDENTIAL_MINT, mint.toBuffer()],
      CSPL_PROGRAM_IDS.encryptedSplToken
    );
    return address;
  }

  /**
   * Get shield vault address for an SPL token
   */
  getShieldVaultAddress(mint: PublicKey): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
      [CSPL_SEEDS.SHIELD_VAULT, mint.toBuffer()],
      CSPL_PROGRAM_IDS.tokenWrap
    );
    return address;
  }

  /**
   * Check if a token supports C-SPL confidential transfers
   */
  isTokenSupported(tokenSymbol: string): boolean {
    const config = CSPL_TOKEN_CONFIGS[tokenSymbol.toUpperCase()];
    return config?.confidentialTransferEnabled ?? false;
  }

  /**
   * Get token configuration
   */
  getTokenConfig(tokenSymbol: string): CSPLTokenConfig | null {
    return CSPL_TOKEN_CONFIGS[tokenSymbol.toUpperCase()] ?? null;
  }

  /**
   * Initialize a confidential token account
   * Must be called before receiving confidential transfers
   */
  async initializeConfidentialAccount(mint: PublicKey): Promise<TransactionSignature> {
    if (!this.wallet) {
      throw new ArciumError(ArciumErrorType.InvalidInput, 'Wallet not connected');
    }

    const confidentialAccount = this.getConfidentialAccountAddress(this.wallet.publicKey, mint);
    const confidentialMint = this.getConfidentialMintAddress(mint);

    // Build initialize instruction
    const data = Buffer.alloc(1 + 32); // discriminator + client pubkey
    data.writeUInt8(0, 0); // Initialize account instruction
    Buffer.from(this.encryption.getPublicKey()).copy(data, 1);

    const instruction = new TransactionInstruction({
      programId: CSPL_PROGRAM_IDS.encryptedSplToken,
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: confidentialAccount, isSigner: false, isWritable: true },
        { pubkey: confidentialMint, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });

    const transaction = new Transaction().add(instruction);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    const signedTx = await this.wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(signedTx.serialize());

    await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    return signature;
  }

  /**
   * Shield (wrap) regular SPL tokens into confidential tokens
   * Tokens are transferred to a vault and a confidential balance is created
   */
  async shield(request: ShieldRequest): Promise<TransactionSignature> {
    if (!this.wallet) {
      throw new ArciumError(ArciumErrorType.InvalidInput, 'Wallet not connected');
    }

    const confidentialAccount = this.getConfidentialAccountAddress(this.wallet.publicKey, request.mint);
    const shieldVault = this.getShieldVaultAddress(request.mint);

    // Get source token account
    const sourceAta = await getAssociatedTokenAddress(request.mint, this.wallet.publicKey);

    // Encrypt the amount
    const amountLamports = BigInt(Math.floor(request.amount * Math.pow(10, this.getDecimals(request.mint))));
    const encryptedAmount = this.encryption.encryptForCSPL(amountLamports);

    // Build shield instruction
    const data = Buffer.alloc(1 + 8 + 32 + 16); // discriminator + amount + ciphertext + nonce
    data.writeUInt8(1, 0); // Shield instruction
    data.writeBigUInt64LE(amountLamports, 1);
    Buffer.from(encryptedAmount.ciphertext).copy(data, 9);
    Buffer.from(encryptedAmount.nonce).copy(data, 41);

    const instructions: TransactionInstruction[] = [];

    // Transfer tokens to vault
    instructions.push(
      createTransferInstruction(
        sourceAta,
        shieldVault,
        this.wallet.publicKey,
        amountLamports
      )
    );

    // Shield instruction
    instructions.push(
      new TransactionInstruction({
        programId: CSPL_PROGRAM_IDS.tokenWrap,
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: sourceAta, isSigner: false, isWritable: true },
          { pubkey: shieldVault, isSigner: false, isWritable: true },
          { pubkey: confidentialAccount, isSigner: false, isWritable: true },
          { pubkey: request.mint, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: CSPL_PROGRAM_IDS.encryptedSplToken, isSigner: false, isWritable: false },
        ],
        data,
      })
    );

    const transaction = new Transaction().add(...instructions);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    const signedTx = await this.wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(signedTx.serialize());

    await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    return signature;
  }

  /**
   * Unshield (unwrap) confidential tokens back to regular SPL tokens
   */
  async unshield(request: UnshieldRequest): Promise<TransactionSignature> {
    if (!this.wallet) {
      throw new ArciumError(ArciumErrorType.InvalidInput, 'Wallet not connected');
    }

    const confidentialAccount = this.getConfidentialAccountAddress(this.wallet.publicKey, request.mint);
    const shieldVault = this.getShieldVaultAddress(request.mint);

    // Encrypt the amount for MPC verification
    const amountLamports = BigInt(Math.floor(request.amount * Math.pow(10, this.getDecimals(request.mint))));
    const encryptedAmount = this.encryption.encryptForCSPL(amountLamports);

    // Build unshield instruction - this triggers MPC to verify encrypted balance
    const data = Buffer.alloc(1 + 8 + 32 + 16);
    data.writeUInt8(2, 0); // Unshield instruction
    data.writeBigUInt64LE(amountLamports, 1);
    Buffer.from(encryptedAmount.ciphertext).copy(data, 9);
    Buffer.from(encryptedAmount.nonce).copy(data, 41);

    const instructions: TransactionInstruction[] = [];

    // Ensure destination ATA exists
    const destinationAta = await getAssociatedTokenAddress(request.mint, request.destinationAccount);
    try {
      await getAccount(this.connection, destinationAta);
    } catch {
      // Create ATA if it doesn't exist
      instructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          destinationAta,
          request.destinationAccount,
          request.mint
        )
      );
    }

    // Unshield instruction
    instructions.push(
      new TransactionInstruction({
        programId: CSPL_PROGRAM_IDS.tokenWrap,
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: confidentialAccount, isSigner: false, isWritable: true },
          { pubkey: shieldVault, isSigner: false, isWritable: true },
          { pubkey: destinationAta, isSigner: false, isWritable: true },
          { pubkey: request.mint, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: CSPL_PROGRAM_IDS.encryptedSplToken, isSigner: false, isWritable: false },
          // MPC accounts
          { pubkey: this.arciumClient.getMempoolAccAddress(), isSigner: false, isWritable: true },
          { pubkey: this.arciumClient.getClusterAccAddress(), isSigner: false, isWritable: false },
        ],
        data,
      })
    );

    const transaction = new Transaction().add(...instructions);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    const signedTx = await this.wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(signedTx.serialize());

    await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    return signature;
  }

  /**
   * Execute a confidential transfer between accounts
   * Amount is encrypted and verified by MPC without revealing the value
   */
  async confidentialTransfer(request: ConfidentialTransferRequest): Promise<TransactionSignature> {
    if (!this.wallet) {
      throw new ArciumError(ArciumErrorType.InvalidInput, 'Wallet not connected');
    }

    const senderConfidentialAccount = this.getConfidentialAccountAddress(request.sender, request.mint);
    const recipientConfidentialAccount = this.getConfidentialAccountAddress(request.recipient, request.mint);

    // Build confidential transfer instruction
    const ciphertextSize = request.encryptedAmount.ciphertext.length;
    const nonceSize = request.encryptedAmount.nonce.length;
    const data = Buffer.alloc(1 + 4 + ciphertextSize + 4 + nonceSize);

    let offset = 0;
    data.writeUInt8(3, offset); // Confidential transfer instruction
    offset += 1;

    data.writeUInt32LE(ciphertextSize, offset);
    offset += 4;
    Buffer.from(request.encryptedAmount.ciphertext).copy(data, offset);
    offset += ciphertextSize;

    data.writeUInt32LE(nonceSize, offset);
    offset += 4;
    Buffer.from(request.encryptedAmount.nonce).copy(data, offset);

    const instruction = new TransactionInstruction({
      programId: CSPL_PROGRAM_IDS.confidentialTransferAdapter,
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: senderConfidentialAccount, isSigner: false, isWritable: true },
        { pubkey: recipientConfidentialAccount, isSigner: false, isWritable: true },
        { pubkey: request.mint, isSigner: false, isWritable: false },
        { pubkey: CSPL_PROGRAM_IDS.encryptedSplToken, isSigner: false, isWritable: false },
        // MPC accounts for encrypted computation
        { pubkey: this.arciumClient.getMempoolAccAddress(), isSigner: false, isWritable: true },
        { pubkey: this.arciumClient.getClusterAccAddress(), isSigner: false, isWritable: false },
        { pubkey: this.arciumClient.getMXEAccAddress(), isSigner: false, isWritable: false },
      ],
      data,
    });

    const transaction = new Transaction().add(instruction);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    const signedTx = await this.wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(signedTx.serialize());

    await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    return signature;
  }

  /**
   * Get encrypted balance of a confidential account
   * The returned balance is encrypted and can only be decrypted by the account owner
   */
  async getEncryptedBalance(owner: PublicKey, mint: PublicKey): Promise<EncryptedValue<bigint> | null> {
    const confidentialAccount = this.getConfidentialAccountAddress(owner, mint);
    const accountInfo = await this.connection.getAccountInfo(confidentialAccount);

    if (!accountInfo) {
      return null;
    }

    // Parse confidential account data
    // Layout: [discriminator(8)] [state(1)] [mint(32)] [owner(32)] [encrypted_balance(48)] [pending(48)]
    const data = accountInfo.data;
    if (data.length < 121) {
      return null;
    }

    const ciphertext = data.slice(73, 105);
    const nonce = data.slice(105, 121);

    return {
      ciphertext: new Uint8Array(ciphertext),
      nonce: new Uint8Array(nonce),
      typeHint: 'bigint',
    };
  }

  /**
   * Decrypt balance using owner's encryption key
   */
  decryptBalance(encryptedBalance: EncryptedValue<bigint>): bigint {
    return this.encryption.decryptCSPL(encryptedBalance);
  }

  /**
   * Get decrypted balance for the connected wallet
   */
  async getBalance(tokenSymbol: string): Promise<number> {
    if (!this.wallet) {
      throw new ArciumError(ArciumErrorType.InvalidInput, 'Wallet not connected');
    }

    const config = this.getTokenConfig(tokenSymbol);
    if (!config) {
      throw new ArciumError(ArciumErrorType.InvalidInput, `Unknown token: ${tokenSymbol}`);
    }

    const encryptedBalance = await this.getEncryptedBalance(this.wallet.publicKey, config.mint);
    if (!encryptedBalance) {
      return 0;
    }

    const balanceLamports = this.decryptBalance(encryptedBalance);
    return Number(balanceLamports) / Math.pow(10, config.decimals);
  }

  /**
   * Get confidential account info
   */
  async getConfidentialAccountInfo(owner: PublicKey, mint: PublicKey): Promise<ConfidentialTokenAccount | null> {
    const confidentialAccount = this.getConfidentialAccountAddress(owner, mint);
    const accountInfo = await this.connection.getAccountInfo(confidentialAccount);

    if (!accountInfo) {
      return null;
    }

    const data = accountInfo.data;
    if (data.length < 121) {
      return null;
    }

    const state = data[8];

    return {
      owner: new PublicKey(data.slice(41, 73)),
      mint: new PublicKey(data.slice(9, 41)),
      encryptedBalance: {
        ciphertext: new Uint8Array(data.slice(73, 105)),
        nonce: new Uint8Array(data.slice(105, 121)),
      },
      encryptedPendingBalance: data.length >= 169 ? {
        ciphertext: new Uint8Array(data.slice(121, 153)),
        nonce: new Uint8Array(data.slice(153, 169)),
      } : undefined,
      state: state === 0 ? ConfidentialAccountState.Uninitialized :
             state === 1 ? ConfidentialAccountState.Initialized :
             ConfidentialAccountState.Frozen,
    };
  }

  /**
   * Apply pending balance to available balance
   * This finalizes incoming confidential transfers
   */
  async applyPendingBalance(mint: PublicKey): Promise<TransactionSignature> {
    if (!this.wallet) {
      throw new ArciumError(ArciumErrorType.InvalidInput, 'Wallet not connected');
    }

    const confidentialAccount = this.getConfidentialAccountAddress(this.wallet.publicKey, mint);

    const data = Buffer.alloc(1);
    data.writeUInt8(4, 0); // Apply pending instruction

    const instruction = new TransactionInstruction({
      programId: CSPL_PROGRAM_IDS.encryptedSplToken,
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: confidentialAccount, isSigner: false, isWritable: true },
        // MPC accounts for balance computation
        { pubkey: this.arciumClient.getMempoolAccAddress(), isSigner: false, isWritable: true },
        { pubkey: this.arciumClient.getClusterAccAddress(), isSigner: false, isWritable: false },
      ],
      data,
    });

    const transaction = new Transaction().add(instruction);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    const signedTx = await this.wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(signedTx.serialize());

    await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    return signature;
  }

  /**
   * Get decimals for a mint
   */
  private getDecimals(mint: PublicKey): number {
    for (const config of Object.values(CSPL_TOKEN_CONFIGS)) {
      if (config.mint.equals(mint)) {
        return config.decimals;
      }
    }
    return 9; // Default to SOL decimals
  }

  /**
   * Encrypt amount for confidential transfer
   */
  encryptAmount(amount: number, mint: PublicKey): EncryptedValue<bigint> {
    const decimals = this.getDecimals(mint);
    const amountLamports = BigInt(Math.floor(amount * Math.pow(10, decimals)));
    return this.encryption.encryptForCSPL(amountLamports);
  }
}

/**
 * Create a C-SPL token client from an Arcium client
 */
export function createCSPLClient(arciumClient: ArciumClient): CSPLTokenClient {
  return new CSPLTokenClient(arciumClient);
}
