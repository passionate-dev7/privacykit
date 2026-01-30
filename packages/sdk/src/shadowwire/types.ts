/**
 * ShadowPay/RADR API Types
 *
 * Type definitions matching the actual ShadowPay API at https://shadow.radr.fun
 * Based on @shadowpay/core, @shadowpay/server, and @shadowpay/client packages
 */

/**
 * Supported tokens for ShadowPay transactions
 */
export type ShadowPayToken = 'SOL' | 'USDC' | 'USDT' | string;

/**
 * Token configuration with decimals and mint addresses
 */
export interface TokenConfig {
  symbol: string;
  decimals: number;
  mint?: string;
  fee: number;
  minAmount: number;
}

/**
 * Payment requirement for protecting routes/content
 */
export interface PaymentRequirement {
  /** Amount required in token units */
  amount: number;
  /** Token type (SOL, USDC, USDT, or SPL mint address) */
  token: ShadowPayToken;
  /** Optional memo/description */
  memo?: string;
  /** Optional expiry time in seconds */
  expiresIn?: number;
}

/**
 * Payment verification result from verify-access endpoint
 */
export interface PaymentVerification {
  /** Whether the payment is authorized */
  authorized: boolean;
  /** Payment status */
  status: 'paid' | 'unpaid' | 'expired' | 'invalid';
  /** Amount paid (if authorized) */
  amount?: number;
  /** Token used for payment */
  token?: ShadowPayToken;
  /** Wallet address that made the payment */
  payer?: string;
  /** Timestamp when payment was made */
  timestamp?: number;
  /** Payment/transaction ID */
  paymentId?: string;
  /** Access token expiry */
  expiresAt?: number;
}

/**
 * Payment request for client-side payment creation
 */
export interface PaymentRequest {
  /** Recipient/merchant public key */
  to: string;
  /** Amount in token units */
  amount: number;
  /** Token type */
  token: ShadowPayToken;
  /** Optional memo */
  memo?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Payment result after successful payment
 */
export interface PaymentResult {
  /** Whether payment was successful */
  success: boolean;
  /** Transaction signature on Solana */
  signature?: string;
  /** Access token for accessing protected content */
  accessToken?: string;
  /** Payment ID */
  paymentId?: string;
  /** Fee paid */
  fee?: number;
  /** Error message if failed */
  error?: string;
  /** Error code if failed */
  errorCode?: ShadowPayErrorCode;
}

/**
 * Webhook event types from ShadowPay
 */
export type WebhookEventType =
  | 'payment.success'
  | 'payment.failed'
  | 'payment.refunded'
  | 'payment.pending'
  | 'payment.expired';

/**
 * Webhook event payload
 */
export interface WebhookEvent {
  /** Event type */
  type: WebhookEventType;
  /** Event timestamp */
  timestamp: number;
  /** Event data */
  data: {
    paymentId: string;
    amount: number;
    token: ShadowPayToken;
    payer: string;
    recipient: string;
    signature?: string;
    error?: string;
  };
  /** Event signature for verification */
  signature: string;
}

/**
 * ShadowPay API error codes
 */
export enum ShadowPayErrorCode {
  // Authentication errors
  MISSING_API_KEY = 'MISSING_API_KEY',
  INVALID_API_KEY = 'INVALID_API_KEY',
  MISSING_ACCESS_TOKEN = 'MISSING_ACCESS_TOKEN',
  INVALID_ACCESS_TOKEN = 'INVALID_ACCESS_TOKEN',
  EXPIRED_ACCESS_TOKEN = 'EXPIRED_ACCESS_TOKEN',

  // Payment errors
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  AMOUNT_BELOW_MINIMUM = 'AMOUNT_BELOW_MINIMUM',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INVALID_RECIPIENT = 'INVALID_RECIPIENT',

  // Token errors
  UNSUPPORTED_TOKEN = 'UNSUPPORTED_TOKEN',
  INVALID_TOKEN = 'INVALID_TOKEN',

  // Transaction errors
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',
  PROOF_GENERATION_FAILED = 'PROOF_GENERATION_FAILED',
  PROOF_VERIFICATION_FAILED = 'PROOF_VERIFICATION_FAILED',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  RPC_ERROR = 'RPC_ERROR',
  TIMEOUT = 'TIMEOUT',

  // Rate limiting
  RATE_LIMITED = 'RATE_LIMITED',

  // General errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * ShadowPay API error response
 */
export interface ShadowPayApiError {
  error: string;
  code?: ShadowPayErrorCode;
  status?: string;
  details?: Record<string, unknown>;
}

/**
 * ElGamal encrypted amount
 */
export interface EncryptedAmount {
  /** Ciphertext component 1 (point on BN254 curve) */
  c1: string;
  /** Ciphertext component 2 (point on BN254 curve) */
  c2: string;
}

/**
 * ElGamal keypair for amount encryption
 */
export interface ElGamalKeypair {
  /** Private key (scalar) */
  privateKey: Uint8Array;
  /** Public key (point on curve) */
  publicKey: string;
}

/**
 * ZK Proof for payment verification
 */
export interface ZKProof {
  /** Proof data (Groth16 format) */
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  /** Public signals */
  publicSignals: string[];
}

/**
 * Payment commitment for privacy pool
 */
export interface PaymentCommitment {
  /** Sender commitment hash */
  senderCommitment: string;
  /** Receiver commitment hash */
  receiverCommitment?: string;
  /** Payment commitment hash */
  paymentCommitment: string;
  /** Salt used in commitment */
  salt: string;
  /** Nullifier for double-spend prevention */
  nullifier?: string;
}

/**
 * Private transfer request
 */
export interface PrivateTransferRequest {
  /** Sender wallet address */
  sender: string;
  /** Recipient address */
  recipient: string;
  /** Amount in token units */
  amount: number;
  /** Token type */
  token: ShadowPayToken;
  /** Transfer type: internal (amount hidden) or external (sender hidden) */
  type: 'internal' | 'external';
  /** Timestamp for replay protection */
  timestamp: number;
  /** Wallet signature */
  signature: string;
  /** Optional ZK proof for internal transfers */
  proof?: ZKProof;
  /** Encrypted amount for internal transfers */
  encryptedAmount?: EncryptedAmount;
}

/**
 * Private transfer response
 */
export interface PrivateTransferResponse {
  success: boolean;
  transactionId?: string;
  signature?: string;
  fee?: number;
  error?: string;
  errorCode?: ShadowPayErrorCode;
}

/**
 * Deposit request into privacy pool
 */
export interface DepositRequest {
  /** Wallet address */
  wallet: string;
  /** Amount in smallest units (lamports, etc.) */
  amount: string;
  /** Token type */
  token: ShadowPayToken;
  /** Timestamp */
  timestamp: number;
  /** Wallet signature */
  signature: string;
  /** Commitment for future withdrawal */
  commitment?: PaymentCommitment;
}

/**
 * Deposit response
 */
export interface DepositResponse {
  success: boolean;
  transactionId?: string;
  signature?: string;
  commitment?: string;
  fee?: number;
  error?: string;
  errorCode?: ShadowPayErrorCode;
}

/**
 * Withdrawal request from privacy pool
 */
export interface WithdrawalRequest {
  /** Wallet address */
  wallet: string;
  /** Recipient address */
  recipient: string;
  /** Amount in smallest units */
  amount: string;
  /** Token type */
  token: ShadowPayToken;
  /** Timestamp */
  timestamp: number;
  /** Wallet signature */
  signature: string;
  /** Nullifier to prevent double-spend */
  nullifier?: string;
  /** ZK proof of valid withdrawal */
  proof?: ZKProof;
}

/**
 * Withdrawal response
 */
export interface WithdrawalResponse {
  success: boolean;
  transactionId?: string;
  signature?: string;
  fee?: number;
  error?: string;
  errorCode?: ShadowPayErrorCode;
}

/**
 * Balance query response
 */
export interface BalanceResponse {
  /** Balance in token units */
  balance: number;
  /** Token type */
  token: ShadowPayToken;
  /** Whether balance is shielded/private */
  shielded?: boolean;
  /** Last updated timestamp */
  updatedAt?: number;
}

/**
 * Circuit URLs for ZK proof generation
 */
export interface CircuitUrls {
  /** WebAssembly circuit file */
  wasm: string;
  /** ZKey file for proving */
  zkey: string;
  /** Verification key */
  vkey: string;
}

/**
 * ShadowPay client configuration
 */
export interface ShadowPayClientConfig {
  /** API key for authentication */
  apiKey?: string;
  /** Custom API URL (default: https://shadow.radr.fun) */
  apiUrl?: string;
  /** Network: 'mainnet-beta' or 'devnet' */
  network?: 'mainnet-beta' | 'devnet';
  /** Request timeout in ms */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * ShadowPay SDK initialization options
 */
export interface ShadowPayInitOptions extends ShadowPayClientConfig {
  /** Preload ZK circuits for faster proof generation */
  preloadCircuits?: boolean;
  /** Custom circuit URLs */
  circuitUrls?: Partial<CircuitUrls>;
}
