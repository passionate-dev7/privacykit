/**
 * Commitment Generation for Privacy Cash
 *
 * Production-ready Poseidon-based commitments following the Tornado Cash pattern:
 * - commitment = Poseidon(secret, nullifier)
 * - nullifierHash = Poseidon(nullifier)
 *
 * The commitment is stored in the Merkle tree.
 * The nullifierHash is revealed during withdrawal to prevent double-spending.
 */

import {
  poseidonHash,
  poseidonHashSingle,
  randomFieldElement,
  bytesToField,
  fieldToBytes,
  fieldToHex,
  hexToField,
  SNARK_FIELD_SIZE,
  isValidFieldElement,
} from './poseidon';
import type { DepositNote, EncodedNote } from './types';

/**
 * Current note encoding version
 */
const NOTE_VERSION = 1;

/**
 * Generate a new deposit note with random secret and nullifier
 */
export async function generateDepositNote(
  amount: number,
  token: string
): Promise<DepositNote> {
  // Generate cryptographically secure random values
  const secret = randomFieldElement();
  const nullifier = randomFieldElement();

  // Compute commitment: Poseidon(secret, nullifier)
  const commitment = await poseidonHash(secret, nullifier);

  // Compute nullifier hash: Poseidon(nullifier)
  // This is what gets revealed during withdrawal
  const nullifierHash = await poseidonHashSingle(nullifier);

  return {
    commitment,
    nullifierHash,
    secret,
    nullifier,
    amount,
    token,
    timestamp: Date.now(),
  };
}

/**
 * Regenerate commitment and nullifierHash from existing secret/nullifier
 * Useful for note validation and recovery
 */
export async function regenerateCommitment(
  secret: bigint,
  nullifier: bigint
): Promise<{ commitment: bigint; nullifierHash: bigint }> {
  const commitment = await poseidonHash(secret, nullifier);
  const nullifierHash = await poseidonHashSingle(nullifier);
  return { commitment, nullifierHash };
}

/**
 * Verify that a note's commitment matches its secret/nullifier
 */
export async function verifyNote(note: DepositNote): Promise<boolean> {
  const { commitment, nullifierHash } = await regenerateCommitment(
    note.secret,
    note.nullifier
  );
  return commitment === note.commitment && nullifierHash === note.nullifierHash;
}

/**
 * Encode a deposit note to a string for storage
 * The encoded note contains all information needed for withdrawal
 *
 * Format: "privacy-cash-note-v{version}-{base64Data}"
 */
export function encodeNote(note: DepositNote): string {
  const data: EncodedNote = {
    version: NOTE_VERSION,
    commitment: fieldToHex(note.commitment),
    nullifierHash: fieldToHex(note.nullifierHash),
    secret: fieldToHex(note.secret),
    nullifier: fieldToHex(note.nullifier),
    amount: note.amount,
    token: note.token,
    timestamp: note.timestamp,
    leafIndex: note.leafIndex,
  };

  const jsonStr = JSON.stringify(data);
  const base64 = Buffer.from(jsonStr).toString('base64url');

  return `privacy-cash-note-v${NOTE_VERSION}-${base64}`;
}

/**
 * Decode an encoded note string back to a DepositNote
 */
export function decodeNote(encoded: string): DepositNote {
  // Handle legacy format (just base64)
  let base64Data: string;
  let version: number;

  if (encoded.startsWith('privacy-cash-note-v')) {
    const match = encoded.match(/^privacy-cash-note-v(\d+)-(.+)$/);
    if (!match) {
      throw new Error('Invalid note format');
    }
    version = parseInt(match[1], 10);
    base64Data = match[2];
  } else {
    // Legacy format - try to parse as raw base64
    version = 0;
    base64Data = encoded;
  }

  let data: EncodedNote | any;
  try {
    const jsonStr = Buffer.from(base64Data, 'base64url').toString();
    data = JSON.parse(jsonStr);
  } catch {
    // Try standard base64
    try {
      const jsonStr = Buffer.from(base64Data, 'base64').toString();
      data = JSON.parse(jsonStr);
    } catch {
      throw new Error('Failed to decode note data');
    }
  }

  // Handle legacy format
  if (version === 0 || !data.version) {
    return decodeLegacyNote(data);
  }

  // Validate required fields
  const requiredFields = ['commitment', 'nullifierHash', 'secret', 'nullifier', 'amount', 'token'];
  for (const field of requiredFields) {
    if (!(field in data)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Convert hex strings back to bigints
  const note: DepositNote = {
    commitment: hexToField(data.commitment),
    nullifierHash: hexToField(data.nullifierHash),
    secret: hexToField(data.secret),
    nullifier: hexToField(data.nullifier),
    amount: data.amount,
    token: data.token,
    timestamp: data.timestamp || Date.now(),
    leafIndex: data.leafIndex,
  };

  // Validate field elements
  if (!isValidFieldElement(note.commitment)) {
    throw new Error('Invalid commitment: not a valid field element');
  }
  if (!isValidFieldElement(note.nullifierHash)) {
    throw new Error('Invalid nullifierHash: not a valid field element');
  }
  if (!isValidFieldElement(note.secret)) {
    throw new Error('Invalid secret: not a valid field element');
  }
  if (!isValidFieldElement(note.nullifier)) {
    throw new Error('Invalid nullifier: not a valid field element');
  }

  return note;
}

/**
 * Decode legacy note format (from mocked implementation)
 */
function decodeLegacyNote(data: any): DepositNote {
  // Legacy format used 'c', 'n', 's' abbreviations
  const commitment = data.c ? hexToField(data.c) : hexToField(data.commitment || '0');
  const secret = data.s ? hexToField(data.s) : hexToField(data.secret || '0');
  const nullifier = data.n ? hexToField(data.n) : hexToField(data.nullifier || '0');

  return {
    commitment,
    nullifierHash: BigInt(0), // Will need to be recomputed
    secret,
    nullifier,
    amount: data.a || data.amount || 0,
    token: data.t || data.token || 'SOL',
    timestamp: data.ts || data.timestamp || Date.now(),
    leafIndex: data.leafIndex,
  };
}

/**
 * Create a note from explicit parameters (for testing or recovery)
 */
export async function createNoteFromParams(params: {
  secret: bigint | string;
  nullifier: bigint | string;
  amount: number;
  token: string;
  leafIndex?: number;
}): Promise<DepositNote> {
  const secret = typeof params.secret === 'string' ? hexToField(params.secret) : params.secret;
  const nullifier = typeof params.nullifier === 'string' ? hexToField(params.nullifier) : params.nullifier;

  const { commitment, nullifierHash } = await regenerateCommitment(secret, nullifier);

  return {
    commitment,
    nullifierHash,
    secret,
    nullifier,
    amount: params.amount,
    token: params.token,
    timestamp: Date.now(),
    leafIndex: params.leafIndex,
  };
}

/**
 * Generate a deterministic note from a seed
 * Useful for testing and reproducible note generation
 */
export async function generateDeterministicNote(
  seed: Uint8Array,
  amount: number,
  token: string
): Promise<DepositNote> {
  // Derive secret and nullifier from seed
  const seedField = bytesToField(seed);
  const secret = seedField;
  const nullifier = (seedField + BigInt(1)) % SNARK_FIELD_SIZE;

  const { commitment, nullifierHash } = await regenerateCommitment(secret, nullifier);

  return {
    commitment,
    nullifierHash,
    secret,
    nullifier,
    amount,
    token,
    timestamp: Date.now(),
  };
}

/**
 * Split amount into multiple notes for better privacy
 * Returns notes with amounts that sum to the original
 */
export async function splitIntoNotes(
  totalAmount: number,
  token: string,
  numNotes: number = 3
): Promise<DepositNote[]> {
  if (numNotes < 1) {
    throw new Error('Must create at least 1 note');
  }

  const notes: DepositNote[] = [];
  let remaining = totalAmount;

  for (let i = 0; i < numNotes - 1; i++) {
    // Random split between 10% and 50% of remaining
    const minAmount = remaining * 0.1;
    const maxAmount = remaining * 0.5;
    const amount = minAmount + Math.random() * (maxAmount - minAmount);
    const roundedAmount = Math.floor(amount * 1000) / 1000;

    notes.push(await generateDepositNote(roundedAmount, token));
    remaining -= roundedAmount;
  }

  // Last note gets the remainder
  notes.push(await generateDepositNote(remaining, token));

  return notes;
}

/**
 * Compute commitment from public key (for stealth addresses)
 * This allows deposits to be made to a derived address
 */
export async function computeStealthCommitment(
  recipientPubkey: Uint8Array,
  ephemeralSecret: bigint
): Promise<bigint> {
  const pubkeyField = bytesToField(recipientPubkey);
  return poseidonHash(pubkeyField, ephemeralSecret);
}

/**
 * Export types for external use
 */
export type { DepositNote, EncodedNote };
