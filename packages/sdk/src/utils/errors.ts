import { PrivacyProvider, PrivacyLevel } from '../types';

/**
 * Base error class for PrivacyKit
 */
export class PrivacyKitError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'PrivacyKitError';
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * Error thrown when a provider is not initialized or unavailable
 */
export class ProviderNotAvailableError extends PrivacyKitError {
  constructor(public readonly provider: PrivacyProvider, cause?: Error) {
    super(
      `Provider ${provider} is not available or not initialized`,
      'PROVIDER_NOT_AVAILABLE',
      cause
    );
    this.name = 'ProviderNotAvailableError';
  }
}

/**
 * Error thrown when a token is not supported
 */
export class UnsupportedTokenError extends PrivacyKitError {
  constructor(
    public readonly token: string,
    public readonly provider?: PrivacyProvider
  ) {
    const msg = provider
      ? `Token ${token} is not supported by provider ${provider}`
      : `Token ${token} is not supported`;
    super(msg, 'UNSUPPORTED_TOKEN');
    this.name = 'UnsupportedTokenError';
  }
}

/**
 * Error thrown when privacy level is not supported
 */
export class UnsupportedPrivacyLevelError extends PrivacyKitError {
  constructor(
    public readonly level: PrivacyLevel,
    public readonly provider?: PrivacyProvider
  ) {
    const msg = provider
      ? `Privacy level ${level} is not supported by provider ${provider}`
      : `Privacy level ${level} is not supported by any available provider`;
    super(msg, 'UNSUPPORTED_PRIVACY_LEVEL');
    this.name = 'UnsupportedPrivacyLevelError';
  }
}

/**
 * Error thrown when balance is insufficient
 */
export class InsufficientBalanceError extends PrivacyKitError {
  constructor(
    public readonly required: number,
    public readonly available: number,
    public readonly token: string
  ) {
    super(
      `Insufficient ${token} balance: required ${required}, available ${available}`,
      'INSUFFICIENT_BALANCE'
    );
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * Error thrown when recipient is not found or invalid
 */
export class RecipientNotFoundError extends PrivacyKitError {
  constructor(public readonly recipient: string) {
    super(`Recipient ${recipient} not found or invalid`, 'RECIPIENT_NOT_FOUND');
    this.name = 'RecipientNotFoundError';
  }
}

/**
 * Error thrown when a transaction fails
 */
export class TransactionError extends PrivacyKitError {
  constructor(
    message: string,
    public readonly signature?: string,
    cause?: Error
  ) {
    super(message, 'TRANSACTION_FAILED', cause);
    this.name = 'TransactionError';
  }
}

/**
 * Error thrown when wallet is not connected
 */
export class WalletNotConnectedError extends PrivacyKitError {
  constructor() {
    super('Wallet is not connected', 'WALLET_NOT_CONNECTED');
    this.name = 'WalletNotConnectedError';
  }
}

/**
 * Error thrown when ZK proof generation fails
 */
export class ProofGenerationError extends PrivacyKitError {
  constructor(
    public readonly circuit: string,
    cause?: Error
  ) {
    super(`Failed to generate proof for circuit ${circuit}`, 'PROOF_GENERATION_FAILED', cause);
    this.name = 'ProofGenerationError';
  }
}

/**
 * Error thrown when ZK proof verification fails
 */
export class ProofVerificationError extends PrivacyKitError {
  constructor(cause?: Error) {
    super('Proof verification failed', 'PROOF_VERIFICATION_FAILED', cause);
    this.name = 'ProofVerificationError';
  }
}

/**
 * Error thrown when amount is below minimum
 */
export class AmountBelowMinimumError extends PrivacyKitError {
  constructor(
    public readonly amount: number,
    public readonly minimum: number,
    public readonly token: string,
    public readonly provider: PrivacyProvider
  ) {
    super(
      `Amount ${amount} ${token} is below minimum ${minimum} for provider ${provider}`,
      'AMOUNT_BELOW_MINIMUM'
    );
    this.name = 'AmountBelowMinimumError';
  }
}

/**
 * Error thrown when network/RPC connection fails
 */
export class NetworkError extends PrivacyKitError {
  constructor(message: string, cause?: Error) {
    super(message, 'NETWORK_ERROR', cause);
    this.name = 'NetworkError';
  }
}

/**
 * Type guard to check if error is a PrivacyKitError
 */
export function isPrivacyKitError(error: unknown): error is PrivacyKitError {
  return error instanceof PrivacyKitError;
}

/**
 * Wrap unknown errors in PrivacyKitError
 */
export function wrapError(error: unknown, defaultMessage: string): PrivacyKitError {
  if (isPrivacyKitError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return new PrivacyKitError(error.message || defaultMessage, 'UNKNOWN_ERROR', error);
  }
  return new PrivacyKitError(defaultMessage, 'UNKNOWN_ERROR');
}
