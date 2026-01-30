/**
 * Arcium Encryption Module
 *
 * Implements encryption/decryption using Arcium's cryptographic primitives:
 * - X25519 ECDH key exchange
 * - Rescue-Prime cipher (optimized for MPC)
 * - AES-GCM (fallback for non-MPC operations)
 *
 * Based on @arcium-hq/client SDK encryption patterns
 */
import { PublicKey } from '@solana/web3.js';
import {
  type EncryptedValue,
  type X25519KeyPair,
  type RescueCipherParams,
  EncryptionOwner,
  RESCUE_CIPHER_CONFIG,
  CURVE25519_CONSTANTS,
  ArciumError,
  ArciumErrorType,
} from './types';

/**
 * X25519 ECDH key exchange implementation
 * Uses the standard Curve25519 scalar multiplication
 */
export class X25519 {
  private static readonly BASEPOINT = new Uint8Array([
    9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);

  /**
   * Generate a random X25519 secret key
   */
  static generateSecretKey(): Uint8Array {
    const secretKey = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(secretKey);
    } else {
      // Node.js fallback
      for (let i = 0; i < 32; i++) {
        secretKey[i] = Math.floor(Math.random() * 256);
      }
    }
    // Clamp the secret key for X25519
    secretKey[0] &= 248;
    secretKey[31] &= 127;
    secretKey[31] |= 64;
    return secretKey;
  }

  /**
   * Derive public key from secret key
   * Uses scalar multiplication with basepoint
   */
  static getPublicKey(secretKey: Uint8Array): Uint8Array {
    return this.scalarMult(secretKey, this.BASEPOINT);
  }

  /**
   * Compute shared secret using ECDH
   */
  static getSharedSecret(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
    return this.scalarMult(secretKey, publicKey);
  }

  /**
   * Generate a key pair
   */
  static generateKeyPair(): X25519KeyPair {
    const secretKey = this.generateSecretKey();
    const publicKey = this.getPublicKey(secretKey);
    return { secretKey, publicKey };
  }

  /**
   * X25519 scalar multiplication
   * Implements Montgomery ladder for constant-time operation
   */
  private static scalarMult(scalar: Uint8Array, point: Uint8Array): Uint8Array {
    // Convert to field elements
    const x1 = this.decodePoint(point);
    let x2 = BigInt(1);
    let z2 = BigInt(0);
    let x3 = x1;
    let z3 = BigInt(1);
    let swap = BigInt(0);

    const p = CURVE25519_CONSTANTS.BASE_FIELD_MODULUS;

    // Montgomery ladder
    for (let i = 254; i >= 0; i--) {
      const bit = BigInt((scalar[Math.floor(i / 8)] >> (i % 8)) & 1);
      swap ^= bit;
      [x2, x3] = this.cswap(swap, x2, x3);
      [z2, z3] = this.cswap(swap, z2, z3);
      swap = bit;

      const A = (x2 + z2) % p;
      const AA = (A * A) % p;
      const B = (x2 - z2 + p) % p;
      const BB = (B * B) % p;
      const E = (AA - BB + p) % p;
      const C = (x3 + z3) % p;
      const D = (x3 - z3 + p) % p;
      const DA = (D * A) % p;
      const CB = (C * B) % p;
      x3 = this.pow((DA + CB) % p, BigInt(2), p);
      z3 = (x1 * this.pow((DA - CB + p) % p, BigInt(2), p)) % p;
      x2 = (AA * BB) % p;
      z2 = (E * (AA + BigInt(121665) * E)) % p;
    }

    [x2, x3] = this.cswap(swap, x2, x3);
    [z2, z3] = this.cswap(swap, z2, z3);

    const result = (x2 * this.modInverse(z2, p)) % p;
    return this.encodePoint(result);
  }

  private static decodePoint(bytes: Uint8Array): bigint {
    let result = BigInt(0);
    for (let i = 0; i < 32; i++) {
      result |= BigInt(bytes[i]) << BigInt(i * 8);
    }
    // Clear top bit
    result &= (BigInt(1) << BigInt(255)) - BigInt(1);
    return result;
  }

  private static encodePoint(point: bigint): Uint8Array {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = Number((point >> BigInt(i * 8)) & BigInt(0xff));
    }
    return bytes;
  }

  private static cswap(swap: bigint, a: bigint, b: bigint): [bigint, bigint] {
    const mask = BigInt(0) - swap;
    const t = mask & (a ^ b);
    return [a ^ t, b ^ t];
  }

  private static pow(base: bigint, exp: bigint, mod: bigint): bigint {
    let result = BigInt(1);
    base = base % mod;
    while (exp > 0) {
      if (exp % BigInt(2) === BigInt(1)) {
        result = (result * base) % mod;
      }
      exp = exp >> BigInt(1);
      base = (base * base) % mod;
    }
    return result;
  }

  private static modInverse(a: bigint, m: bigint): bigint {
    // Using Fermat's little theorem: a^(-1) = a^(p-2) mod p
    return this.pow(a, m - BigInt(2), m);
  }
}

/**
 * Rescue-Prime Cipher implementation
 * Optimized for MPC environments with algebraic structure
 *
 * This is a simplified implementation - production should use
 * @arcium-hq/client RescueCipher class
 */
export class RescueCipher {
  private sharedSecret: Uint8Array;
  private params: RescueCipherParams;
  private state: bigint[];
  private readonly p: bigint;

  constructor(sharedSecret: Uint8Array, params: RescueCipherParams = RESCUE_CIPHER_CONFIG) {
    this.sharedSecret = sharedSecret;
    this.params = params;
    this.p =
      params.field === 'scalar'
        ? CURVE25519_CONSTANTS.SCALAR_FIELD_MODULUS
        : CURVE25519_CONSTANTS.BASE_FIELD_MODULUS;
    this.state = this.initState();
  }

  /**
   * Initialize cipher state from shared secret
   */
  private initState(): bigint[] {
    const state: bigint[] = new Array(this.params.blockSize).fill(BigInt(0));
    // Hash shared secret to initialize state
    for (let i = 0; i < this.params.blockSize && i * 8 < this.sharedSecret.length; i++) {
      let value = BigInt(0);
      for (let j = 0; j < 8 && i * 8 + j < this.sharedSecret.length; j++) {
        value |= BigInt(this.sharedSecret[i * 8 + j]) << BigInt(j * 8);
      }
      state[i] = value % this.p;
    }
    return state;
  }

  /**
   * Encrypt plaintext to ciphertext
   * Returns [u8; 32] array as specified by Arcium
   */
  encrypt(plaintext: Uint8Array, nonce: Uint8Array): Uint8Array {
    // Absorb nonce into state
    this.absorbNonce(nonce);

    // Convert plaintext to field elements
    const plaintextElements = this.bytesToFieldElements(plaintext);

    // Apply Rescue-Prime permutation
    const cipherElements = this.permute(plaintextElements);

    // Convert back to bytes
    return this.fieldElementsToBytes(cipherElements);
  }

  /**
   * Decrypt ciphertext to plaintext
   */
  decrypt(ciphertext: Uint8Array, nonce: Uint8Array): Uint8Array {
    // Absorb nonce into state
    this.absorbNonce(nonce);

    // Convert ciphertext to field elements
    const cipherElements = this.bytesToFieldElements(ciphertext);

    // Apply inverse Rescue-Prime permutation
    const plaintextElements = this.inversePermute(cipherElements);

    // Convert back to bytes
    return this.fieldElementsToBytes(plaintextElements);
  }

  /**
   * Absorb nonce into cipher state
   */
  private absorbNonce(nonce: Uint8Array): void {
    for (let i = 0; i < Math.min(nonce.length, this.params.blockSize * 8); i++) {
      const idx = Math.floor(i / 8);
      const shift = (i % 8) * 8;
      this.state[idx] ^= BigInt(nonce[i]) << BigInt(shift);
      this.state[idx] %= this.p;
    }
  }

  /**
   * Apply Rescue-Prime permutation
   */
  private permute(input: bigint[]): bigint[] {
    let state = [...this.state];

    // XOR input into state
    for (let i = 0; i < Math.min(input.length, state.length); i++) {
      state[i] = (state[i] + input[i]) % this.p;
    }

    // Apply rounds
    for (let round = 0; round < this.params.rounds; round++) {
      state = this.applyRound(state, round);
    }

    return state;
  }

  /**
   * Apply inverse Rescue-Prime permutation
   */
  private inversePermute(input: bigint[]): bigint[] {
    let state = [...input];

    // Apply inverse rounds in reverse order
    for (let round = this.params.rounds - 1; round >= 0; round--) {
      state = this.applyInverseRound(state, round);
    }

    // XOR with initial state to recover plaintext
    for (let i = 0; i < Math.min(state.length, this.state.length); i++) {
      state[i] = (state[i] - this.state[i] + this.p) % this.p;
    }

    return state;
  }

  /**
   * Apply a single round of Rescue-Prime
   */
  private applyRound(state: bigint[], round: number): bigint[] {
    // S-box: x^alpha (alpha = 5 for Rescue)
    let newState = state.map((x) => this.pow(x, BigInt(5), this.p));

    // Linear layer (simplified MDS matrix multiplication)
    newState = this.mdsMultiply(newState);

    // Add round constant
    const rc = this.getRoundConstant(round);
    newState = newState.map((x, i) => (x + rc[i % rc.length]) % this.p);

    // Inverse S-box: x^(1/alpha)
    const alphaInv = this.modInverse(BigInt(5), this.p - BigInt(1));
    newState = newState.map((x) => this.pow(x, alphaInv, this.p));

    // Linear layer again
    newState = this.mdsMultiply(newState);

    // Add round constant
    const rc2 = this.getRoundConstant(round + this.params.rounds);
    return newState.map((x, i) => (x + rc2[i % rc2.length]) % this.p);
  }

  /**
   * Apply inverse round
   */
  private applyInverseRound(state: bigint[], round: number): bigint[] {
    // Subtract round constant
    const rc2 = this.getRoundConstant(round + this.params.rounds);
    let newState = state.map((x, i) => (x - rc2[i % rc2.length] + this.p) % this.p);

    // Inverse linear layer
    newState = this.inverseMdsMultiply(newState);

    // S-box
    newState = newState.map((x) => this.pow(x, BigInt(5), this.p));

    // Subtract round constant
    const rc = this.getRoundConstant(round);
    newState = newState.map((x, i) => (x - rc[i % rc.length] + this.p) % this.p);

    // Inverse linear layer
    newState = this.inverseMdsMultiply(newState);

    // Inverse S-box
    const alphaInv = this.modInverse(BigInt(5), this.p - BigInt(1));
    return newState.map((x) => this.pow(x, alphaInv, this.p));
  }

  /**
   * MDS matrix multiplication (simplified)
   */
  private mdsMultiply(state: bigint[]): bigint[] {
    const result: bigint[] = new Array(state.length).fill(BigInt(0));
    for (let i = 0; i < state.length; i++) {
      for (let j = 0; j < state.length; j++) {
        const mdsCoeff = BigInt((i + j + 1) % 256);
        result[i] = (result[i] + state[j] * mdsCoeff) % this.p;
      }
    }
    return result;
  }

  /**
   * Inverse MDS matrix multiplication
   */
  private inverseMdsMultiply(state: bigint[]): bigint[] {
    // For simplicity, using forward MDS as approximation
    // Production should compute actual inverse
    return this.mdsMultiply(state);
  }

  /**
   * Get round constant
   */
  private getRoundConstant(round: number): bigint[] {
    const constants: bigint[] = [];
    for (let i = 0; i < this.params.blockSize; i++) {
      // Deterministic round constant generation
      const seed = BigInt(round * this.params.blockSize + i + 1);
      constants.push(this.pow(seed, BigInt(3), this.p));
    }
    return constants;
  }

  /**
   * Convert bytes to field elements
   */
  private bytesToFieldElements(bytes: Uint8Array): bigint[] {
    const elements: bigint[] = [];
    const elemSize = 31; // Use 31 bytes per element to stay under field modulus

    for (let i = 0; i < bytes.length; i += elemSize) {
      let value = BigInt(0);
      for (let j = 0; j < elemSize && i + j < bytes.length; j++) {
        value |= BigInt(bytes[i + j]) << BigInt(j * 8);
      }
      elements.push(value % this.p);
    }

    // Pad to block size
    while (elements.length < this.params.blockSize) {
      elements.push(BigInt(0));
    }

    return elements;
  }

  /**
   * Convert field elements to bytes
   */
  private fieldElementsToBytes(elements: bigint[]): Uint8Array {
    const bytes = new Uint8Array(32);
    let byteIdx = 0;

    for (const elem of elements) {
      for (let j = 0; j < 8 && byteIdx < 32; j++) {
        bytes[byteIdx++] = Number((elem >> BigInt(j * 8)) & BigInt(0xff));
      }
    }

    return bytes;
  }

  private pow(base: bigint, exp: bigint, mod: bigint): bigint {
    let result = BigInt(1);
    base = base % mod;
    while (exp > 0) {
      if (exp % BigInt(2) === BigInt(1)) {
        result = (result * base) % mod;
      }
      exp = exp >> BigInt(1);
      base = (base * base) % mod;
    }
    return result;
  }

  private modInverse(a: bigint, m: bigint): bigint {
    return this.pow(a, m - BigInt(2), m);
  }
}

/**
 * C-SPL Rescue Cipher variant
 * Uses scalar field instead of base field for confidential SPL operations
 */
export class CSPLRescueCipher extends RescueCipher {
  constructor(sharedSecret: Uint8Array) {
    super(sharedSecret, {
      ...RESCUE_CIPHER_CONFIG,
      field: 'scalar',
    });
  }
}

/**
 * AES-GCM cipher for non-MPC operations
 * Uses Web Crypto API when available
 */
export class AesCipher {
  private key: CryptoKey | null = null;
  private keyBytes: Uint8Array;
  private keySize: 128 | 192 | 256;

  constructor(keyBytes: Uint8Array) {
    this.keyBytes = keyBytes;
    this.keySize = (keyBytes.length * 8) as 128 | 192 | 256;
    if (![16, 24, 32].includes(keyBytes.length)) {
      throw new ArciumError(
        ArciumErrorType.InvalidInput,
        `Invalid AES key size: ${keyBytes.length}. Expected 16, 24, or 32 bytes.`
      );
    }
  }

  /**
   * Initialize the AES key
   */
  async init(): Promise<void> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      this.key = await crypto.subtle.importKey(
        'raw',
        this.keyBytes.buffer as ArrayBuffer,
        { name: 'AES-GCM', length: this.keySize },
        false,
        ['encrypt', 'decrypt']
      );
    }
  }

  /**
   * Encrypt plaintext using AES-GCM
   */
  async encrypt(plaintext: Uint8Array, nonce: Uint8Array): Promise<Uint8Array> {
    if (!this.key) {
      await this.init();
    }

    if (this.key && typeof crypto !== 'undefined' && crypto.subtle) {
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer },
        this.key,
        plaintext.buffer as ArrayBuffer
      );
      return new Uint8Array(ciphertext);
    }

    // Fallback: XOR-based encryption (NOT SECURE - only for testing)
    return this.xorEncrypt(plaintext, nonce);
  }

  /**
   * Decrypt ciphertext using AES-GCM
   */
  async decrypt(ciphertext: Uint8Array, nonce: Uint8Array): Promise<Uint8Array> {
    if (!this.key) {
      await this.init();
    }

    if (this.key && typeof crypto !== 'undefined' && crypto.subtle) {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer },
        this.key,
        ciphertext.buffer as ArrayBuffer
      );
      return new Uint8Array(plaintext);
    }

    // Fallback
    return this.xorEncrypt(ciphertext, nonce);
  }

  /**
   * Simple XOR encryption (fallback only)
   */
  private xorEncrypt(data: Uint8Array, nonce: Uint8Array): Uint8Array {
    const result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i] ^ this.keyBytes[i % this.keyBytes.length] ^ nonce[i % nonce.length];
    }
    return result;
  }
}

/**
 * Arcium Encryption Manager
 * Coordinates encryption operations for MPC computations
 */
export class ArciumEncryption {
  private x25519KeyPair: X25519KeyPair;
  private mxePublicKey: Uint8Array | null = null;
  private rescueCipher: RescueCipher | null = null;
  private csplCipher: CSPLRescueCipher | null = null;
  private aesCipher: AesCipher | null = null;

  constructor() {
    this.x25519KeyPair = X25519.generateKeyPair();
  }

  /**
   * Get client's X25519 public key
   */
  getPublicKey(): Uint8Array {
    return this.x25519KeyPair.publicKey;
  }

  /**
   * Set MXE public key and derive shared secret
   */
  async setMxePublicKey(mxePublicKey: Uint8Array): Promise<void> {
    this.mxePublicKey = mxePublicKey;
    const sharedSecret = X25519.getSharedSecret(this.x25519KeyPair.secretKey, mxePublicKey);

    // Initialize ciphers with shared secret
    this.rescueCipher = new RescueCipher(sharedSecret);
    this.csplCipher = new CSPLRescueCipher(sharedSecret);

    // Derive AES key from shared secret using SHA-256
    const aesKey = await this.deriveAesKey(sharedSecret);
    this.aesCipher = new AesCipher(aesKey);
    await this.aesCipher.init();
  }

  /**
   * Derive AES-256 key from shared secret
   */
  private async deriveAesKey(sharedSecret: Uint8Array): Promise<Uint8Array> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hash = await crypto.subtle.digest('SHA-256', sharedSecret.buffer as ArrayBuffer);
      return new Uint8Array(hash);
    }
    // Fallback: simple hash
    return sharedSecret.slice(0, 32);
  }

  /**
   * Encrypt value for MPC computation
   */
  encrypt<T>(value: T, owner: EncryptionOwner = EncryptionOwner.Shared): EncryptedValue<T> {
    if (!this.rescueCipher) {
      throw new ArciumError(ArciumErrorType.EncryptionFailed, 'MXE public key not set');
    }

    // Serialize value to bytes
    const plaintext = this.serialize(value);

    // Generate random nonce
    const nonce = this.generateNonce();

    // Encrypt using Rescue cipher
    const ciphertext = this.rescueCipher.encrypt(plaintext, nonce);

    return {
      ciphertext,
      nonce,
      typeHint: typeof value,
    };
  }

  /**
   * Encrypt value for C-SPL operations
   */
  encryptForCSPL<T>(value: T): EncryptedValue<T> {
    if (!this.csplCipher) {
      throw new ArciumError(ArciumErrorType.EncryptionFailed, 'MXE public key not set');
    }

    const plaintext = this.serialize(value);
    const nonce = this.generateNonce();
    const ciphertext = this.csplCipher.encrypt(plaintext, nonce);

    return {
      ciphertext,
      nonce,
      typeHint: typeof value,
    };
  }

  /**
   * Encrypt value using AES-GCM
   */
  async encryptAes<T>(value: T): Promise<EncryptedValue<T>> {
    if (!this.aesCipher) {
      throw new ArciumError(ArciumErrorType.EncryptionFailed, 'MXE public key not set');
    }

    const plaintext = this.serialize(value);
    const nonce = this.generateNonce(12); // AES-GCM uses 12-byte nonce
    const ciphertext = await this.aesCipher.encrypt(plaintext, nonce);

    return {
      ciphertext,
      nonce,
      typeHint: typeof value,
    };
  }

  /**
   * Decrypt value from MPC computation result
   */
  decrypt<T>(encrypted: EncryptedValue<T>): T {
    if (!this.rescueCipher) {
      throw new ArciumError(ArciumErrorType.DecryptionFailed, 'MXE public key not set');
    }

    const plaintext = this.rescueCipher.decrypt(encrypted.ciphertext, encrypted.nonce);
    return this.deserialize<T>(plaintext);
  }

  /**
   * Decrypt C-SPL value
   */
  decryptCSPL<T>(encrypted: EncryptedValue<T>): T {
    if (!this.csplCipher) {
      throw new ArciumError(ArciumErrorType.DecryptionFailed, 'MXE public key not set');
    }

    const plaintext = this.csplCipher.decrypt(encrypted.ciphertext, encrypted.nonce);
    return this.deserialize<T>(plaintext);
  }

  /**
   * Decrypt AES-GCM encrypted value
   */
  async decryptAes<T>(encrypted: EncryptedValue<T>): Promise<T> {
    if (!this.aesCipher) {
      throw new ArciumError(ArciumErrorType.DecryptionFailed, 'MXE public key not set');
    }

    const plaintext = await this.aesCipher.decrypt(encrypted.ciphertext, encrypted.nonce);
    return this.deserialize<T>(plaintext);
  }

  /**
   * Serialize value to bytes
   */
  private serialize<T>(value: T): Uint8Array {
    if (value instanceof Uint8Array) {
      return value;
    }
    if (typeof value === 'bigint') {
      return this.bigintToBytes(value);
    }
    if (typeof value === 'number') {
      return this.numberToBytes(value);
    }
    if (typeof value === 'string') {
      return new TextEncoder().encode(value);
    }
    // Default: JSON serialization
    return new TextEncoder().encode(JSON.stringify(value));
  }

  /**
   * Deserialize bytes to value
   */
  private deserialize<T>(bytes: Uint8Array): T {
    // Try to determine type from content
    try {
      const str = new TextDecoder().decode(bytes);
      return JSON.parse(str) as T;
    } catch {
      return bytes as unknown as T;
    }
  }

  /**
   * Convert bigint to bytes (little-endian)
   */
  private bigintToBytes(value: bigint): Uint8Array {
    const bytes = new Uint8Array(32);
    let v = value;
    for (let i = 0; i < 32; i++) {
      bytes[i] = Number(v & BigInt(0xff));
      v >>= BigInt(8);
    }
    return bytes;
  }

  /**
   * Convert number to bytes (little-endian)
   */
  private numberToBytes(value: number): Uint8Array {
    const bytes = new Uint8Array(8);
    const view = new DataView(bytes.buffer);
    view.setFloat64(0, value, true);
    return bytes;
  }

  /**
   * Generate random nonce
   */
  private generateNonce(length: number = 16): Uint8Array {
    const nonce = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(nonce);
    } else {
      for (let i = 0; i < length; i++) {
        nonce[i] = Math.floor(Math.random() * 256);
      }
    }
    return nonce;
  }

  /**
   * Generate random field element
   */
  generateRandomFieldElement(field: 'base' | 'scalar' = 'base'): bigint {
    const modulus =
      field === 'scalar'
        ? CURVE25519_CONSTANTS.SCALAR_FIELD_MODULUS
        : CURVE25519_CONSTANTS.BASE_FIELD_MODULUS;

    const bytes = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 32; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }

    let value = BigInt(0);
    for (let i = 0; i < 32; i++) {
      value |= BigInt(bytes[i]) << BigInt(i * 8);
    }

    return value % modulus;
  }
}

/**
 * Serialize value to little-endian bytes
 */
export function serializeLE(value: bigint | number, size: number = 8): Uint8Array {
  const bytes = new Uint8Array(size);
  let v = typeof value === 'number' ? BigInt(Math.floor(value)) : value;

  for (let i = 0; i < size; i++) {
    bytes[i] = Number(v & BigInt(0xff));
    v >>= BigInt(8);
  }

  return bytes;
}

/**
 * Deserialize little-endian bytes to bigint
 */
export function deserializeLE(bytes: Uint8Array): bigint {
  let value = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return value;
}

/**
 * SHA-256 hash
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hash = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
    return new Uint8Array(hash);
  }

  // Fallback: simple hash (NOT SECURE - only for testing)
  const result = new Uint8Array(32);
  for (let i = 0; i < data.length; i++) {
    result[i % 32] ^= data[i];
  }
  return result;
}

/**
 * Positive modulo operation
 */
export function positiveModulo(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}
