export * from './errors';
export * from './logger';
export * from './constants';

import { PublicKey, Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';
import type { WalletAdapter } from '../types';

/**
 * Validate a Solana public key string
 */
export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse address to PublicKey
 */
export function toPublicKey(address: string | PublicKey): PublicKey {
  if (address instanceof PublicKey) {
    return address;
  }
  return new PublicKey(address);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Generate a random bytes array
 */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Node.js fallback
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

/**
 * Convert bytes to base58 string
 */
export function bytesToBase58(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}

/**
 * Convert base58 string to bytes
 */
export function base58ToBytes(str: string): Uint8Array {
  return bs58.decode(str);
}

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Format SOL amount for display
 */
export function formatSol(lamports: number | bigint): string {
  const sol = Number(lamports) / 1e9;
  return sol.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 9,
  });
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(amount: number, decimals: number, symbol: string): string {
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  })} ${symbol}`;
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Check if WASM is supported
 */
export function isWasmSupported(): boolean {
  try {
    if (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function') {
      const module = new WebAssembly.Module(
        Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
      );
      return module instanceof WebAssembly.Module;
    }
  } catch {
    // WASM not supported
  }
  return false;
}

/**
 * Convert a Keypair to a WalletAdapter interface
 * This allows using raw Keypairs with adapters that expect WalletAdapter
 *
 * @param keypair - The Solana Keypair to wrap
 * @returns A WalletAdapter compatible object
 *
 * @example
 * ```typescript
 * const wallet = Keypair.fromSecretKey(secretKey);
 * const adapter = keypairToWalletAdapter(wallet);
 * await arciumAdapter.initialize(connection, adapter);
 * ```
 */
export function keypairToWalletAdapter(keypair: Keypair): WalletAdapter {
  return {
    publicKey: keypair.publicKey,

    signTransaction: async <T extends { serialize(): Uint8Array }>(tx: T): Promise<T> => {
      if (tx instanceof Transaction) {
        tx.partialSign(keypair);
        return tx as T;
      } else if (tx instanceof VersionedTransaction) {
        tx.sign([keypair]);
        return tx as T;
      }
      // For any other transaction type with sign method
      if ('sign' in tx && typeof (tx as any).sign === 'function') {
        (tx as any).sign([keypair]);
      }
      return tx;
    },

    signAllTransactions: async <T extends { serialize(): Uint8Array }>(txs: T[]): Promise<T[]> => {
      return Promise.all(
        txs.map(async (tx) => {
          if (tx instanceof Transaction) {
            tx.partialSign(keypair);
            return tx;
          } else if (tx instanceof VersionedTransaction) {
            tx.sign([keypair]);
            return tx;
          }
          if ('sign' in tx && typeof (tx as any).sign === 'function') {
            (tx as any).sign([keypair]);
          }
          return tx;
        })
      );
    },

    signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
      return nacl.sign.detached(message, keypair.secretKey);
    },
  };
}

/**
 * Check if an object is a raw Keypair
 */
export function isKeypair(obj: unknown): obj is Keypair {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'publicKey' in obj &&
    'secretKey' in obj &&
    obj.publicKey instanceof PublicKey &&
    obj.secretKey instanceof Uint8Array
  );
}

/**
 * Convert a Keypair or WalletAdapter to WalletAdapter
 * Automatically wraps Keypairs into WalletAdapter interface
 */
export function toWalletAdapter(wallet: Keypair | WalletAdapter): WalletAdapter {
  if (isKeypair(wallet)) {
    return keypairToWalletAdapter(wallet);
  }
  return wallet;
}
