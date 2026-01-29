import { PrivacyProvider, type SupportedToken } from './index';

/**
 * Registry of supported tokens across all providers
 * This maps token symbols to their mint addresses and supported providers
 */
export const SUPPORTED_TOKENS: Record<string, SupportedToken> = {
  SOL: {
    symbol: 'SOL',
    mint: 'So11111111111111111111111111111111111111112',
    decimals: 9,
    providers: [
      PrivacyProvider.SHADOWWIRE,
      PrivacyProvider.ARCIUM,
      PrivacyProvider.PRIVACY_CASH,
    ],
  },
  USDC: {
    symbol: 'USDC',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    providers: [
      PrivacyProvider.SHADOWWIRE,
      PrivacyProvider.ARCIUM,
      PrivacyProvider.PRIVACY_CASH,
    ],
  },
  USDT: {
    symbol: 'USDT',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
    providers: [PrivacyProvider.SHADOWWIRE, PrivacyProvider.ARCIUM],
  },
  BONK: {
    symbol: 'BONK',
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    decimals: 5,
    providers: [PrivacyProvider.SHADOWWIRE],
  },
  RADR: {
    symbol: 'RADR',
    mint: '5FGULyTir641wnz7gr2p2kiYYpWboVYE83Ps3e8Lxcxq',
    decimals: 9,
    providers: [PrivacyProvider.SHADOWWIRE],
  },
  ORE: {
    symbol: 'ORE',
    mint: 'oreoN2tQbHXVaZsr3pf66A48miqcBXCDJozganhEJgz',
    decimals: 11,
    providers: [PrivacyProvider.SHADOWWIRE],
  },
  JIM: {
    symbol: 'JIM',
    mint: 'J1mKZiHLYgvYYDmPmHN99GpVaAfQPYixfCKi3sqeC9y',
    decimals: 9,
    providers: [PrivacyProvider.SHADOWWIRE],
  },
  ANON: {
    symbol: 'ANON',
    mint: 'ANoNvP3T4rR9j5Rs1VKiVS3ggGpAR3MqWqkPJZP8pump',
    decimals: 9,
    providers: [PrivacyProvider.SHADOWWIRE],
  },
};

/**
 * Fee percentages by provider and token
 */
export const PROVIDER_FEES: Record<PrivacyProvider, Record<string, number>> = {
  [PrivacyProvider.SHADOWWIRE]: {
    SOL: 0.005, // 0.5%
    USDC: 0.01, // 1%
    USDT: 0.01,
    BONK: 0.01,
    RADR: 0.003, // 0.3%
    ORE: 0.003,
    JIM: 0.01,
    ANON: 0.01,
    DEFAULT: 0.01,
  },
  [PrivacyProvider.ARCIUM]: {
    SOL: 0.002,
    USDC: 0.002,
    USDT: 0.002,
    DEFAULT: 0.002,
  },
  [PrivacyProvider.NOIR]: {
    DEFAULT: 0.001, // Base fee for ZK proof verification
  },
  [PrivacyProvider.PRIVACY_CASH]: {
    SOL: 0.005,
    USDC: 0.005,
    DEFAULT: 0.005,
  },
  [PrivacyProvider.INCO]: {
    SOL: 0.003,
    USDC: 0.003,
    DEFAULT: 0.003,
  },
};

/**
 * Minimum amounts by provider and token
 */
export const MINIMUM_AMOUNTS: Record<PrivacyProvider, Record<string, number>> = {
  [PrivacyProvider.SHADOWWIRE]: {
    SOL: 0.01,
    USDC: 1,
    USDT: 1,
    BONK: 100000,
    DEFAULT: 0.01,
  },
  [PrivacyProvider.ARCIUM]: {
    SOL: 0.001,
    USDC: 0.1,
    DEFAULT: 0.001,
  },
  [PrivacyProvider.NOIR]: {
    DEFAULT: 0,
  },
  [PrivacyProvider.PRIVACY_CASH]: {
    SOL: 0.1,
    USDC: 10,
    DEFAULT: 0.1,
  },
  [PrivacyProvider.INCO]: {
    SOL: 0.01,
    USDC: 1,
    DEFAULT: 0.01,
  },
};

/**
 * Get token info by symbol
 */
export function getTokenInfo(symbol: string): SupportedToken | undefined {
  return SUPPORTED_TOKENS[symbol.toUpperCase()];
}

/**
 * Get fee for a provider and token
 */
export function getProviderFee(provider: PrivacyProvider, token: string): number {
  const fees = PROVIDER_FEES[provider];
  return fees[token.toUpperCase()] ?? fees.DEFAULT ?? 0.01;
}

/**
 * Get minimum amount for a provider and token
 */
export function getMinimumAmount(provider: PrivacyProvider, token: string): number {
  const mins = MINIMUM_AMOUNTS[provider];
  return mins[token.toUpperCase()] ?? mins.DEFAULT ?? 0;
}

/**
 * Check if a token is supported by a provider
 */
export function isTokenSupported(token: string, provider: PrivacyProvider): boolean {
  const info = getTokenInfo(token);
  if (!info) return false;
  return info.providers.includes(provider);
}

/**
 * Get all providers that support a token
 */
export function getProvidersForToken(token: string): PrivacyProvider[] {
  const info = getTokenInfo(token);
  return info?.providers ?? [];
}

/**
 * Convert amount to smallest units (lamports for SOL, etc.)
 */
export function toSmallestUnit(amount: number, token: string): bigint {
  const info = getTokenInfo(token);
  if (!info) throw new Error(`Unknown token: ${token}`);
  return BigInt(Math.floor(amount * Math.pow(10, info.decimals)));
}

/**
 * Convert from smallest units to token amount
 */
export function fromSmallestUnit(amount: bigint, token: string): number {
  const info = getTokenInfo(token);
  if (!info) throw new Error(`Unknown token: ${token}`);
  return Number(amount) / Math.pow(10, info.decimals);
}
