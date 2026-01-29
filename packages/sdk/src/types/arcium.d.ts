/**
 * Type declarations for @arcium-hq packages
 * These are stub declarations for Arcium MPC packages
 */

declare module '@arcium-hq/client' {
  import type { Connection, PublicKey, TransactionSignature } from '@solana/web3.js';

  export interface ArciumConfig {
    cluster: 'devnet' | 'mainnet-beta';
    clusterOffset?: number;
    rpcUrl?: string;
  }

  export interface ComputationResult<T> {
    output: T;
    signature: TransactionSignature;
  }

  export class ArciumClient {
    constructor(config: ArciumConfig);
    setWallet(wallet: unknown): void;
    initialize(): Promise<void>;
    getMxePublicKey(): Uint8Array | null;
    encrypt<T>(value: T): { ciphertext: Uint8Array; nonce: Uint8Array };
    decrypt<T>(encrypted: { ciphertext: Uint8Array; nonce: Uint8Array }): T;
    queueComputation(params: {
      compDefOffset: number;
      encryptedInputs: Uint8Array;
      priorityFee?: bigint;
    }): Promise<TransactionSignature>;
    awaitComputationFinalization<T>(
      computationId: Uint8Array,
      timeout?: number
    ): Promise<ComputationResult<T>>;
  }
}

declare module '@arcium-hq/reader' {
  export interface MempoolPriorityFeeStats {
    min: bigint;
    max: bigint;
    median: bigint;
    mean: bigint;
  }

  export function getMempoolPriorityFeeStats(rpcUrl: string): Promise<MempoolPriorityFeeStats>;
}
