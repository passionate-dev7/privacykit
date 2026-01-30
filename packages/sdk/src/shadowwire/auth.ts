/**
 * ShadowPay Authentication Module
 *
 * Handles API key authentication, message signing, and access token verification
 * for the ShadowPay API at https://shadow.radr.fun
 */

import type { WalletAdapter } from '../types';
import type { PaymentRequirement, PaymentVerification, ShadowPayApiError } from './types';
import { ShadowPayErrorCode } from './types';

/**
 * Default API URL for ShadowPay
 */
export const SHADOWPAY_API_URL = 'https://shadow.radr.fun';

/**
 * API version prefix
 */
export const API_VERSION = 'shadowpay/v1';

/**
 * Authentication headers required by the API
 */
export interface AuthHeaders {
  'Content-Type': string;
  'X-API-Key'?: string;
  'X-Access-Token'?: string;
  Authorization?: string;
  [key: string]: string | undefined;
}

/**
 * Create authentication headers for API requests
 */
export function createAuthHeaders(options: {
  apiKey?: string;
  accessToken?: string;
}): AuthHeaders {
  const headers: AuthHeaders = {
    'Content-Type': 'application/json',
  };

  if (options.apiKey) {
    headers['X-API-Key'] = options.apiKey;
  }

  if (options.accessToken) {
    headers['X-Access-Token'] = options.accessToken;
  }

  return headers;
}

/**
 * Create a signed message for authentication
 * This follows the ShadowPay signing scheme
 */
export async function createSignedMessage(
  wallet: WalletAdapter,
  payload: Record<string, unknown>
): Promise<{ message: string; signature: string }> {
  const message = JSON.stringify(payload);
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = await wallet.signMessage(messageBytes);

  return {
    message,
    signature: Buffer.from(signatureBytes).toString('base64'),
  };
}

/**
 * Create a transfer authentication payload
 */
export function createTransferPayload(params: {
  action: 'transfer' | 'deposit' | 'withdraw';
  sender: string;
  recipient?: string;
  amount: number;
  token: string;
  type?: 'internal' | 'external';
  timestamp?: number;
}): Record<string, unknown> {
  return {
    action: params.action,
    sender: params.sender,
    ...(params.recipient && { recipient: params.recipient }),
    amount: params.amount,
    token: params.token,
    ...(params.type && { type: params.type }),
    timestamp: params.timestamp ?? Date.now(),
  };
}

/**
 * Verify an access token against the ShadowPay API
 */
export async function verifyAccessToken(
  accessToken: string,
  apiUrl = SHADOWPAY_API_URL,
  requirement?: PaymentRequirement
): Promise<PaymentVerification> {
  const url = `${apiUrl}/${API_VERSION}/payment/verify-access`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': accessToken,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as ShadowPayApiError;

      if (response.status === 401) {
        return {
          authorized: false,
          status: 'invalid',
        };
      }

      if (response.status === 402) {
        return {
          authorized: false,
          status: 'unpaid',
        };
      }

      return {
        authorized: false,
        status: 'invalid',
      };
    }

    const data = await response.json() as PaymentVerification;

    // Additional validation against requirement if provided
    if (requirement && data.authorized) {
      if (data.amount && data.amount < requirement.amount) {
        return {
          ...data,
          authorized: false,
          status: 'unpaid',
        };
      }

      if (data.token && data.token !== requirement.token) {
        return {
          ...data,
          authorized: false,
          status: 'invalid',
        };
      }
    }

    return data;
  } catch (error) {
    // Network error - return as invalid
    return {
      authorized: false,
      status: 'invalid',
    };
  }
}

/**
 * Create payment requirement header for 402 responses
 */
export function createPaymentRequirementHeader(requirement: PaymentRequirement): string {
  const parts = [
    `amount=${requirement.amount}`,
    `token=${requirement.token}`,
  ];

  if (requirement.memo) {
    parts.push(`memo=${encodeURIComponent(requirement.memo)}`);
  }

  if (requirement.expiresIn) {
    parts.push(`expires_in=${requirement.expiresIn}`);
  }

  return parts.join('; ');
}

/**
 * Parse payment requirement from header
 */
export function parsePaymentRequirementHeader(header: string): PaymentRequirement | null {
  try {
    const parts = header.split(';').map((p) => p.trim());
    const params: Record<string, string> = {};

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key && value) {
        params[key.trim()] = value.trim();
      }
    }

    if (!params.amount || !params.token) {
      return null;
    }

    return {
      amount: parseFloat(params.amount),
      token: params.token,
      memo: params.memo ? decodeURIComponent(params.memo) : undefined,
      expiresIn: params.expires_in ? parseInt(params.expires_in, 10) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Webhook signature verification using HMAC-SHA256
 *
 * ShadowPay webhooks are signed with HMAC-SHA256.
 * The signature header format is: sha256=<hex_signature>
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret || !payload) {
    return false;
  }

  try {
    // Import crypto dynamically for browser/node compatibility
    const crypto = require('crypto');

    // Parse signature - format is "sha256=<hex>"
    const parts = signature.split('=');
    const algorithm = parts[0];
    const receivedSignature = parts[1];

    if (algorithm !== 'sha256' || !receivedSignature) {
      // Try treating the whole string as the signature (no prefix)
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex');

      // Use constant-time comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    }

    // Generate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(receivedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    // Fallback for browser environments without crypto
    console.warn('Webhook signature verification failed:', error);
    return false;
  }
}

/**
 * Error code to HTTP status mapping
 */
export function errorCodeToStatus(code: ShadowPayErrorCode): number {
  switch (code) {
    case ShadowPayErrorCode.MISSING_API_KEY:
    case ShadowPayErrorCode.INVALID_API_KEY:
    case ShadowPayErrorCode.MISSING_ACCESS_TOKEN:
    case ShadowPayErrorCode.INVALID_ACCESS_TOKEN:
    case ShadowPayErrorCode.EXPIRED_ACCESS_TOKEN:
      return 401;

    case ShadowPayErrorCode.PAYMENT_REQUIRED:
      return 402;

    case ShadowPayErrorCode.INSUFFICIENT_BALANCE:
    case ShadowPayErrorCode.AMOUNT_BELOW_MINIMUM:
    case ShadowPayErrorCode.INVALID_AMOUNT:
    case ShadowPayErrorCode.INVALID_RECIPIENT:
    case ShadowPayErrorCode.UNSUPPORTED_TOKEN:
    case ShadowPayErrorCode.INVALID_TOKEN:
      return 400;

    case ShadowPayErrorCode.RATE_LIMITED:
      return 429;

    case ShadowPayErrorCode.INTERNAL_ERROR:
    case ShadowPayErrorCode.UNKNOWN_ERROR:
    default:
      return 500;
  }
}

/**
 * Check if an error response indicates rate limiting
 */
export function isRateLimited(response: Response): boolean {
  return response.status === 429;
}

/**
 * Get retry-after value from rate limit response
 */
export function getRetryAfter(response: Response): number | null {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000; // Convert to milliseconds
    }
  }
  return null;
}
