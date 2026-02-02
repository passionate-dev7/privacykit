import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

/**
 * Wallet adapter interface for CLI usage
 */
export interface CLIWalletAdapter {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Error thrown when wallet operations fail
 */
export class WalletError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'WalletError';
  }
}

/**
 * Load keypair from file
 * Supports JSON array format (Solana CLI) and base58 format
 */
export function loadKeypair(keypairPath: string): Keypair {
  // Expand ~ to home directory
  const expandedPath = keypairPath.replace(/^~/, os.homedir());
  const absolutePath = path.isAbsolute(expandedPath)
    ? expandedPath
    : path.join(process.cwd(), expandedPath);

  if (!fs.existsSync(absolutePath)) {
    throw new WalletError(
      `Keypair file not found: ${absolutePath}`,
      'KEYPAIR_NOT_FOUND'
    );
  }

  try {
    const content = fs.readFileSync(absolutePath, 'utf-8').trim();

    // Try to parse as JSON array (Solana CLI format)
    try {
      const secretKey = new Uint8Array(JSON.parse(content));
      if (secretKey.length !== 64) {
        throw new Error('Invalid secret key length');
      }
      return Keypair.fromSecretKey(secretKey);
    } catch {
      // Not JSON, try base58
    }

    // Try to parse as base58 encoded secret key
    try {
      const secretKey = bs58.decode(content);
      if (secretKey.length !== 64) {
        throw new Error('Invalid secret key length');
      }
      return Keypair.fromSecretKey(secretKey);
    } catch {
      // Not base58 either
    }

    throw new Error('Unrecognized keypair format');
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      `Failed to load keypair from ${absolutePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'KEYPAIR_LOAD_FAILED'
    );
  }
}

/**
 * Create a wallet adapter from a keypair
 */
export function createWalletAdapter(keypair: Keypair): CLIWalletAdapter {
  return {
    publicKey: keypair.publicKey,

    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      if (tx instanceof Transaction) {
        tx.partialSign(keypair);
      } else {
        // VersionedTransaction
        tx.sign([keypair]);
      }
      return tx;
    },

    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      for (const tx of txs) {
        if (tx instanceof Transaction) {
          tx.partialSign(keypair);
        } else {
          tx.sign([keypair]);
        }
      }
      return txs;
    },

    async signMessage(message: Uint8Array): Promise<Uint8Array> {
      return nacl.sign.detached(message, keypair.secretKey);
    },
  };
}

/**
 * Load wallet from keypair file and create adapter
 */
export function loadWallet(keypairPath: string): CLIWalletAdapter {
  const keypair = loadKeypair(keypairPath);
  return createWalletAdapter(keypair);
}

/**
 * Get the default keypair path
 */
export function getDefaultKeypairPath(): string {
  return path.join(os.homedir(), '.config', 'solana', 'id.json');
}

/**
 * Check if default keypair exists
 */
export function defaultKeypairExists(): boolean {
  const defaultPath = getDefaultKeypairPath();
  return fs.existsSync(defaultPath);
}

/**
 * Validate a Solana address
 */
export function isValidAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 3) {
    return address;
  }
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Get wallet info for display
 */
export function getWalletInfo(wallet: CLIWalletAdapter): {
  address: string;
  truncatedAddress: string;
} {
  const address = wallet.publicKey.toBase58();
  return {
    address,
    truncatedAddress: truncateAddress(address),
  };
}
