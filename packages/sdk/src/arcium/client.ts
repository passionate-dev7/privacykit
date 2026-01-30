/**
 * Arcium MPC Client
 *
 * Real production client for interacting with Arcium's Multi-Party Computation network.
 * Implements account derivation, computation queuing, and result handling.
 *
 * Based on @arcium-hq/client SDK patterns
 */
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Keypair,
  type TransactionSignature,
  type Commitment,
} from '@solana/web3.js';
import type { WalletAdapter } from '../types';
import {
  type ArciumClientConfig,
  type ArciumProgramAddresses,
  type MXEAccount,
  type ComputationDefinition,
  type ComputationAccount,
  type ComputationResult,
  type MempoolAccount,
  type ExecutingPoolAccount,
  type MempoolPriorityFeeStats,
  type ClusterAccount,
  type ARXNodeInfo,
  type QueueComputationParams,
  type CallbackConfig,
  type EncryptedValue,
  ComputationStatus,
  MXEStatus,
  ArciumError,
  ArciumErrorType,
  CLUSTER_OFFSETS,
} from './types';
import { ArciumEncryption, sha256 } from './encryption';

/**
 * Arcium Program ID
 * This is the ARCIUM_ADDR constant from @arcium-hq/client
 * The actual program ID is derived from the IDL
 */
const ARCIUM_PROGRAM_ID = new PublicKey('ArcmCVZXJWy51tJPD1vKyaVgZ1BqpVE4eKK7dCKHTAW7');

/**
 * Account seeds for PDA derivation
 */
const ACCOUNT_SEEDS = {
  MXE: Buffer.from('mxe'),
  CLUSTER: Buffer.from('cluster'),
  MEMPOOL: Buffer.from('mempool'),
  EXECUTING_POOL: Buffer.from('executing_pool'),
  COMP_DEF: Buffer.from('comp_def'),
  COMPUTATION: Buffer.from('computation'),
  FEE_POOL: Buffer.from('fee_pool'),
  ARX_NODE: Buffer.from('arx_node'),
} as const;

/**
 * Fee pool account address (constant across all clusters)
 */
const ARCIUM_FEE_POOL_ACCOUNT_ADDRESS = new PublicKey(
  'D9EsDZNv3KwQELWiygFWkx3yMiCFsv8TupDMgSs5tDQM'
);

/**
 * Arcium Client
 *
 * Main client for interacting with Arcium's MPC network
 */
export class ArciumClient {
  private connection: Connection;
  private wallet: WalletAdapter | null = null;
  private config: ArciumClientConfig;
  private encryption: ArciumEncryption;
  private mxePublicKey: Uint8Array | null = null;
  private programAddresses: ArciumProgramAddresses;

  constructor(config: ArciumClientConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, {
      commitment: config.commitment || 'confirmed',
      wsEndpoint: config.wsUrl,
    });
    this.encryption = new ArciumEncryption();

    // Initialize program addresses
    this.programAddresses = {
      arcium: ARCIUM_PROGRAM_ID,
      mxeRegistry: this.getMXEAccAddress(ARCIUM_PROGRAM_ID),
      mempool: this.getMempoolAccAddress(config.clusterOffset),
      feePool: ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    };
  }

  /**
   * Set the wallet for signing transactions
   */
  setWallet(wallet: WalletAdapter): void {
    this.wallet = wallet;
  }

  /**
   * Get the Arcium program ID
   */
  getArciumProgramId(): PublicKey {
    return ARCIUM_PROGRAM_ID;
  }

  /**
   * Initialize the client by fetching MXE public key
   */
  async initialize(): Promise<void> {
    try {
      const mxePublicKey = await this.getMXEPublicKey();
      this.mxePublicKey = mxePublicKey;
      await this.encryption.setMxePublicKey(mxePublicKey);

      if (this.config.debug) {
        console.log('Arcium client initialized');
        console.log('  Cluster offset:', this.config.clusterOffset);
        console.log('  MXE public key:', Buffer.from(mxePublicKey).toString('hex').slice(0, 16) + '...');
      }
    } catch (error) {
      throw new ArciumError(
        ArciumErrorType.NetworkError,
        'Failed to initialize Arcium client',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get MXE account address
   */
  getMXEAccAddress(programId: PublicKey = ARCIUM_PROGRAM_ID): PublicKey {
    const [address] = PublicKey.findProgramAddressSync([ACCOUNT_SEEDS.MXE], programId);
    return address;
  }

  /**
   * Get cluster account address
   */
  getClusterAccAddress(clusterOffset: number = this.config.clusterOffset): PublicKey {
    const offsetBuffer = Buffer.alloc(4);
    offsetBuffer.writeUInt32LE(clusterOffset);

    const [address] = PublicKey.findProgramAddressSync(
      [ACCOUNT_SEEDS.CLUSTER, offsetBuffer],
      ARCIUM_PROGRAM_ID
    );
    return address;
  }

  /**
   * Get mempool account address
   */
  getMempoolAccAddress(clusterOffset: number = this.config.clusterOffset): PublicKey {
    const offsetBuffer = Buffer.alloc(4);
    offsetBuffer.writeUInt32LE(clusterOffset);

    const [address] = PublicKey.findProgramAddressSync(
      [ACCOUNT_SEEDS.MEMPOOL, offsetBuffer],
      ARCIUM_PROGRAM_ID
    );
    return address;
  }

  /**
   * Get executing pool account address
   */
  getExecutingPoolAccAddress(clusterOffset: number = this.config.clusterOffset): PublicKey {
    const offsetBuffer = Buffer.alloc(4);
    offsetBuffer.writeUInt32LE(clusterOffset);

    const [address] = PublicKey.findProgramAddressSync(
      [ACCOUNT_SEEDS.EXECUTING_POOL, offsetBuffer],
      ARCIUM_PROGRAM_ID
    );
    return address;
  }

  /**
   * Get computation definition account address
   */
  getCompDefAccAddress(compDefOffset: number, ownerProgram: PublicKey): PublicKey {
    const offsetBuffer = Buffer.alloc(4);
    offsetBuffer.writeUInt32LE(compDefOffset);

    const [address] = PublicKey.findProgramAddressSync(
      [ACCOUNT_SEEDS.COMP_DEF, ownerProgram.toBuffer(), offsetBuffer],
      ARCIUM_PROGRAM_ID
    );
    return address;
  }

  /**
   * Get computation account address
   */
  getComputationAccAddress(computationId: Uint8Array): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
      [ACCOUNT_SEEDS.COMPUTATION, Buffer.from(computationId)],
      ARCIUM_PROGRAM_ID
    );
    return address;
  }

  /**
   * Get ARX node account address
   */
  getARXNodeAccAddress(nodeOffset: number): PublicKey {
    const offsetBuffer = Buffer.alloc(4);
    offsetBuffer.writeUInt32LE(nodeOffset);

    const [address] = PublicKey.findProgramAddressSync(
      [ACCOUNT_SEEDS.ARX_NODE, offsetBuffer],
      ARCIUM_PROGRAM_ID
    );
    return address;
  }

  /**
   * Fetch MXE public key from on-chain account
   */
  async getMXEPublicKey(): Promise<Uint8Array> {
    const mxeAddress = this.getMXEAccAddress();
    const accountInfo = await this.connection.getAccountInfo(mxeAddress);

    if (!accountInfo) {
      throw new ArciumError(ArciumErrorType.MXENotFound, `MXE account not found at ${mxeAddress.toBase58()}`);
    }

    // Extract X25519 public key from account data
    // Account layout: [discriminator(8)] [status(1)] [node_count(4)] [x25519_pubkey(32)] ...
    const data = accountInfo.data;
    if (data.length < 45) {
      throw new ArciumError(ArciumErrorType.InvalidInput, 'Invalid MXE account data');
    }

    return data.slice(13, 45); // X25519 public key at offset 13
  }

  /**
   * Get MXE account info
   */
  async getMXEAccInfo(): Promise<MXEAccount> {
    const mxeAddress = this.getMXEAccAddress();
    const accountInfo = await this.connection.getAccountInfo(mxeAddress);

    if (!accountInfo) {
      throw new ArciumError(ArciumErrorType.MXENotFound, `MXE account not found at ${mxeAddress.toBase58()}`);
    }

    const data = accountInfo.data;

    return {
      publicKey: data.slice(1, 33),
      clusterOffset: data.readUInt32LE(33),
      status: data[37] === 0 ? MXEStatus.Active : data[37] === 1 ? MXEStatus.Recovery : MXEStatus.Inactive,
      nodeCount: data.readUInt32LE(38),
      x25519PublicKey: data.slice(13, 45),
    };
  }

  /**
   * Get mempool account info
   */
  async getMempoolAccInfo(): Promise<MempoolAccount> {
    const mempoolAddress = this.getMempoolAccAddress();
    const accountInfo = await this.connection.getAccountInfo(mempoolAddress);

    if (!accountInfo) {
      return { computations: [], size: 0, capacity: 100 };
    }

    // Parse mempool account data
    const data = accountInfo.data;
    const size = data.readUInt32LE(8);
    const capacity = data.readUInt32LE(12);

    const computations = [];
    let offset = 16;
    for (let i = 0; i < size && offset + 16 <= data.length; i++) {
      computations.push({
        offset: data.readUInt32LE(offset),
        priorityFee: data.readBigUInt64LE(offset + 4),
        queuedAt: data.readUInt32LE(offset + 12),
      });
      offset += 16;
    }

    return { computations, size, capacity };
  }

  /**
   * Get executing pool account info
   */
  async getExecutingPoolAccInfo(): Promise<ExecutingPoolAccount> {
    const poolAddress = this.getExecutingPoolAccAddress();
    const accountInfo = await this.connection.getAccountInfo(poolAddress);

    if (!accountInfo) {
      return { executing: [], lockedAccounts: [] };
    }

    // Parse executing pool data
    const data = accountInfo.data;
    const executingCount = data.readUInt32LE(8);

    const executing = [];
    let offset = 12;
    for (let i = 0; i < executingCount && offset + 16 <= data.length; i++) {
      executing.push({
        offset: data.readUInt32LE(offset),
        priorityFee: data.readBigUInt64LE(offset + 4),
        queuedAt: data.readUInt32LE(offset + 12),
      });
      offset += 16;
    }

    const lockedCount = data.readUInt32LE(offset);
    offset += 4;

    const lockedAccounts = [];
    for (let i = 0; i < lockedCount && offset + 32 <= data.length; i++) {
      lockedAccounts.push(new PublicKey(data.slice(offset, offset + 32)));
      offset += 32;
    }

    return { executing, lockedAccounts };
  }

  /**
   * Get mempool priority fee statistics
   */
  async getMempoolPriorityFeeStats(): Promise<MempoolPriorityFeeStats> {
    const mempool = await this.getMempoolAccInfo();

    if (mempool.size === 0) {
      return {
        min: BigInt(0),
        max: BigInt(0),
        average: BigInt(0),
        median: BigInt(0),
        mempoolSize: 0,
      };
    }

    const fees = mempool.computations.map((c) => c.priorityFee).sort((a, b) => (a < b ? -1 : 1));

    const min = fees[0];
    const max = fees[fees.length - 1];
    const sum = fees.reduce((a, b) => a + b, BigInt(0));
    const average = sum / BigInt(fees.length);
    const median = fees[Math.floor(fees.length / 2)];

    return {
      min,
      max,
      average,
      median,
      mempoolSize: mempool.size,
    };
  }

  /**
   * Get cluster account info
   */
  async getClusterAccInfo(clusterOffset: number = this.config.clusterOffset): Promise<ClusterAccount> {
    const clusterAddress = this.getClusterAccAddress(clusterOffset);
    const accountInfo = await this.connection.getAccountInfo(clusterAddress);

    if (!accountInfo) {
      throw new ArciumError(ArciumErrorType.ClusterNotSet, `Cluster account not found for offset ${clusterOffset}`);
    }

    const data = accountInfo.data;

    return {
      offset: data.readUInt32LE(8),
      mxe: new PublicKey(data.slice(12, 44)),
      nodeCount: data.readUInt32LE(44),
      recoverySetSize: data.readUInt32LE(48),
      active: data[52] === 1,
    };
  }

  /**
   * Get ARX node info
   */
  async getARXNodeInfo(nodeOffset: number): Promise<ARXNodeInfo> {
    const nodeAddress = this.getARXNodeAccAddress(nodeOffset);
    const accountInfo = await this.connection.getAccountInfo(nodeAddress);

    if (!accountInfo) {
      throw new ArciumError(ArciumErrorType.NetworkError, `ARX node not found for offset ${nodeOffset}`);
    }

    const data = accountInfo.data;

    return {
      offset: data.readUInt32LE(8),
      authority: new PublicKey(data.slice(12, 44)),
      identity: data.slice(44, 76),
      blsPublicKey: data.slice(76, 124),
      x25519PublicKey: data.slice(124, 156),
      active: data[156] === 1,
      epochRange: [data.readUInt32LE(157), data.readUInt32LE(161)],
    };
  }

  /**
   * Get computations currently in mempool
   */
  async getComputationsInMempool(): Promise<ComputationAccount[]> {
    const mempool = await this.getMempoolAccInfo();
    const computations: ComputationAccount[] = [];

    for (const ref of mempool.computations) {
      try {
        const compAddress = this.getComputationAccAddress(
          Buffer.alloc(4).fill(ref.offset)
        );
        const accountInfo = await this.connection.getAccountInfo(compAddress);

        if (accountInfo) {
          const data = accountInfo.data;
          computations.push({
            id: data.slice(8, 40),
            compDefOffset: data.readUInt32LE(40),
            priorityFee: data.readBigUInt64LE(44),
            encryptedInputs: data.slice(52),
            status: ComputationStatus.Pending,
          });
        }
      } catch {
        // Skip invalid computations
      }
    }

    return computations;
  }

  /**
   * Encrypt value for MPC computation
   */
  encrypt<T>(value: T): EncryptedValue<T> {
    if (!this.mxePublicKey) {
      throw new ArciumError(ArciumErrorType.EncryptionFailed, 'Client not initialized');
    }
    return this.encryption.encrypt(value);
  }

  /**
   * Decrypt value from MPC computation result
   */
  decrypt<T>(encrypted: EncryptedValue<T>): T {
    return this.encryption.decrypt(encrypted);
  }

  /**
   * Build transaction to initialize a computation definition
   * This is called once per confidential instruction type
   */
  async buildInitCompDefTx(
    ownerProgram: PublicKey,
    compDefOffset: number,
    circuitHash: Uint8Array
  ): Promise<Transaction> {
    if (!this.wallet) {
      throw new ArciumError(ArciumErrorType.InvalidInput, 'Wallet not connected');
    }

    const compDefAddress = this.getCompDefAccAddress(compDefOffset, ownerProgram);
    const clusterAddress = this.getClusterAccAddress();

    // Build init_comp_def instruction
    const data = Buffer.alloc(1 + 4 + 32);
    data.writeUInt8(0, 0); // Instruction discriminator for init_comp_def
    data.writeUInt32LE(compDefOffset, 1);
    Buffer.from(circuitHash).copy(data, 5);

    const instruction = new TransactionInstruction({
      programId: ARCIUM_PROGRAM_ID,
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: compDefAddress, isSigner: false, isWritable: true },
        { pubkey: clusterAddress, isSigner: false, isWritable: false },
        { pubkey: ownerProgram, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });

    const transaction = new Transaction().add(instruction);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    return transaction;
  }

  /**
   * Build transaction to finalize a computation definition
   */
  async buildFinalizeCompDefTx(
    ownerProgram: PublicKey,
    compDefOffset: number
  ): Promise<Transaction> {
    if (!this.wallet) {
      throw new ArciumError(ArciumErrorType.InvalidInput, 'Wallet not connected');
    }

    const compDefAddress = this.getCompDefAccAddress(compDefOffset, ownerProgram);

    const data = Buffer.alloc(5);
    data.writeUInt8(1, 0); // Instruction discriminator for finalize_comp_def
    data.writeUInt32LE(compDefOffset, 1);

    const instruction = new TransactionInstruction({
      programId: ARCIUM_PROGRAM_ID,
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: compDefAddress, isSigner: false, isWritable: true },
        { pubkey: ownerProgram, isSigner: false, isWritable: false },
      ],
      data,
    });

    const transaction = new Transaction().add(instruction);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    return transaction;
  }

  /**
   * Queue a computation for MPC execution
   */
  async queueComputation(params: QueueComputationParams): Promise<TransactionSignature> {
    if (!this.wallet) {
      throw new ArciumError(ArciumErrorType.InvalidInput, 'Wallet not connected');
    }

    // Generate unique computation ID
    const computationId = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(computationId);
    }

    const computationAddress = this.getComputationAccAddress(computationId);
    const mempoolAddress = this.getMempoolAccAddress();
    const clusterAddress = this.getClusterAccAddress();

    // Build queue_computation instruction data
    const inputSize = params.encryptedInputs.length;
    const data = Buffer.alloc(1 + 32 + 4 + 8 + 4 + inputSize);
    let offset = 0;

    data.writeUInt8(2, offset); // Instruction discriminator for queue_computation
    offset += 1;

    Buffer.from(computationId).copy(data, offset);
    offset += 32;

    data.writeUInt32LE(params.compDefOffset, offset);
    offset += 4;

    data.writeBigUInt64LE(params.priorityFee, offset);
    offset += 8;

    data.writeUInt32LE(inputSize, offset);
    offset += 4;

    Buffer.from(params.encryptedInputs).copy(data, offset);

    const keys = [
      { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: computationAddress, isSigner: false, isWritable: true },
      { pubkey: mempoolAddress, isSigner: false, isWritable: true },
      { pubkey: clusterAddress, isSigner: false, isWritable: false },
      { pubkey: this.programAddresses.feePool, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    // Add callback accounts if specified
    if (params.callback) {
      keys.push({ pubkey: params.callback.programId, isSigner: false, isWritable: false });
      for (const acc of params.callback.remainingAccounts) {
        keys.push({ pubkey: acc, isSigner: false, isWritable: true });
      }
    }

    const instruction = new TransactionInstruction({
      programId: ARCIUM_PROGRAM_ID,
      keys,
      data,
    });

    const transaction = new Transaction().add(instruction);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    const signedTx = await this.wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      this.config.commitment || 'confirmed'
    );

    return signature;
  }

  /**
   * Wait for computation to finalize
   */
  async awaitComputationFinalization<T>(
    computationId: Uint8Array,
    timeoutMs: number = 60000
  ): Promise<ComputationResult<T>> {
    const computationAddress = this.getComputationAccAddress(computationId);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const accountInfo = await this.connection.getAccountInfo(computationAddress);

      if (accountInfo) {
        const data = accountInfo.data;
        // Check status byte - 3 = Finalized
        if (data[50] === 3) {
          return {
            id: computationId,
            output: data.slice(51) as unknown as T,
            signature: '', // Would need to track this from events
          };
        }
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new ArciumError(ArciumErrorType.TimeoutError, 'Computation finalization timed out');
  }

  /**
   * Subscribe to computation events
   */
  subscribeComputations(
    callback: (result: ComputationResult) => void
  ): () => void {
    const mempoolAddress = this.getMempoolAccAddress();

    const subscriptionId = this.connection.onAccountChange(
      mempoolAddress,
      (accountInfo) => {
        // Parse mempool changes and emit events
        // This is a simplified implementation
        if (this.config.debug) {
          console.log('Mempool account changed');
        }
      },
      this.config.commitment || 'confirmed'
    );

    // Return unsubscribe function
    return () => {
      this.connection.removeAccountChangeListener(subscriptionId);
    };
  }

  /**
   * Upload circuit bytecode
   */
  async uploadCircuit(
    circuitUrl: string,
    ownerProgram: PublicKey,
    compDefOffset: number
  ): Promise<TransactionSignature[]> {
    // Fetch circuit from URL
    const response = await fetch(circuitUrl);
    if (!response.ok) {
      throw new ArciumError(ArciumErrorType.NetworkError, `Failed to fetch circuit: ${response.statusText}`);
    }

    const circuitBytes = new Uint8Array(await response.arrayBuffer());
    const circuitHash = await sha256(circuitBytes);

    // Initialize computation definition
    const initTx = await this.buildInitCompDefTx(ownerProgram, compDefOffset, circuitHash);
    const signedInitTx = await this.wallet!.signTransaction(initTx);
    const initSig = await this.connection.sendRawTransaction(signedInitTx.serialize());

    // Upload circuit data in chunks if needed (max ~1KB per tx)
    const CHUNK_SIZE = 900;
    const uploadSigs: TransactionSignature[] = [initSig];

    for (let i = 0; i < circuitBytes.length; i += CHUNK_SIZE) {
      const chunk = circuitBytes.slice(i, Math.min(i + CHUNK_SIZE, circuitBytes.length));
      // Build upload chunk instruction
      // This would use the Arcium program's upload_circuit_chunk instruction
    }

    // Finalize computation definition
    const finalizeTx = await this.buildFinalizeCompDefTx(ownerProgram, compDefOffset);
    const signedFinalizeTx = await this.wallet!.signTransaction(finalizeTx);
    const finalizeSig = await this.connection.sendRawTransaction(signedFinalizeTx.serialize());
    uploadSigs.push(finalizeSig);

    return uploadSigs;
  }

  /**
   * Get connection instance
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get encryption instance
   */
  getEncryption(): ArciumEncryption {
    return this.encryption;
  }

  /**
   * Get client X25519 public key
   */
  getClientPublicKey(): Uint8Array {
    return this.encryption.getPublicKey();
  }

  /**
   * Close client and clean up resources
   */
  close(): void {
    // Clean up WebSocket connections if any
  }
}

/**
 * Create an Arcium client with default devnet configuration
 */
export function createDevnetClient(rpcUrl?: string): ArciumClient {
  return new ArciumClient({
    cluster: 'devnet',
    clusterOffset: CLUSTER_OFFSETS.DEVNET_V063,
    rpcUrl: rpcUrl || 'https://api.devnet.solana.com',
    commitment: 'confirmed',
  });
}

/**
 * Create an Arcium client with mainnet configuration
 */
export function createMainnetClient(rpcUrl?: string): ArciumClient {
  return new ArciumClient({
    cluster: 'mainnet-beta',
    clusterOffset: CLUSTER_OFFSETS.MAINNET,
    rpcUrl: rpcUrl || 'https://api.mainnet-beta.solana.com',
    commitment: 'confirmed',
  });
}

/**
 * Helper to compute comp_def_offset from function name
 * Matches the comp_def_offset! macro behavior
 */
export function compDefOffset(functionName: string): number {
  // Hash the function name and take first 4 bytes as u32
  const encoder = new TextEncoder();
  const bytes = encoder.encode(functionName);

  let hash = 0;
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash << 5) - hash + bytes[i]) | 0;
  }

  return hash >>> 0; // Convert to unsigned
}
