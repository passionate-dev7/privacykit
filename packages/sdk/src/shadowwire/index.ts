/**
 * ShadowPay/ShadowWire Module
 *
 * Exports for the ShadowPay API integration.
 * ShadowPay is a privacy payment protocol by RADR Labs built on Solana.
 *
 * @see https://radrlabs.io
 * @see https://shadow.radr.fun
 */

// Types
export * from './types';

// Authentication
export {
  SHADOWPAY_API_URL,
  API_VERSION,
  createAuthHeaders,
  createSignedMessage,
  createTransferPayload,
  verifyAccessToken,
  createPaymentRequirementHeader,
  parsePaymentRequirementHeader,
  verifyWebhookSignature,
  errorCodeToStatus,
  isRateLimited,
  getRetryAfter,
} from './auth';
export type { AuthHeaders } from './auth';

// API Client
export {
  ShadowPayApiClient,
  ShadowPayApiErrorClass,
  createShadowPayClient,
  DEFAULT_CIRCUIT_URLS,
  SHADOWPAY_PROGRAM_ID,
  SHADOWPAY_TOKENS,
} from './api';
