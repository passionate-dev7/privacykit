import type {
  PrivacyProvider,
  PrivacyLevel,
  PrivacyProviderAdapter,
  TransferRequest,
  EstimateResult,
} from '../types';
import { PrivacyLevel as PL, PrivacyProvider as PP } from '../types';
import { Logger, defaultLogger } from '../utils/logger';
import { UnsupportedPrivacyLevelError, UnsupportedTokenError } from '../utils/errors';

/**
 * Selection criteria for choosing a provider
 */
export interface SelectionCriteria {
  /** Desired privacy level */
  privacyLevel: PrivacyLevel;
  /** Token being transferred */
  token: string;
  /** Amount being transferred */
  amount?: number;
  /** Maximum acceptable fee (in token units) */
  maxFee?: number;
  /** Maximum acceptable latency (in ms) */
  maxLatency?: number;
  /** Prefer specific provider if available */
  preferredProvider?: PrivacyProvider;
  /** Require on-chain verification */
  requireOnChainVerification?: boolean;
  /** Require compliance features */
  requireCompliance?: boolean;
}

/**
 * Selection result from the router
 */
export interface SelectionResult {
  /** Selected provider */
  provider: PrivacyProvider;
  /** Adapter instance */
  adapter: PrivacyProviderAdapter;
  /** Estimated result */
  estimate: EstimateResult;
  /** Score (higher is better) */
  score: number;
  /** Reasons for selection */
  reasons: string[];
}

/**
 * Provider capabilities for routing decisions
 */
interface ProviderCapabilities {
  provider: PrivacyProvider;
  levels: PrivacyLevel[];
  tokens: string[];
  hasOnChainVerification: boolean;
  hasCompliance: boolean;
  avgLatencyMs: number;
  avgFeePercent: number;
}

/**
 * Known provider capabilities
 */
const PROVIDER_CAPABILITIES: ProviderCapabilities[] = [
  {
    provider: PP.SHADOWWIRE,
    levels: [PL.AMOUNT_HIDDEN, PL.SENDER_HIDDEN],
    tokens: ['SOL', 'USDC', 'USDT', 'BONK', 'RADR', 'ORE', 'ANON'],
    hasOnChainVerification: false,
    hasCompliance: false,
    avgLatencyMs: 4000,
    avgFeePercent: 0.75,
  },
  {
    provider: PP.ARCIUM,
    levels: [PL.FULL_ENCRYPTED, PL.AMOUNT_HIDDEN, PL.SENDER_HIDDEN],
    tokens: ['SOL', 'USDC'],
    hasOnChainVerification: true,
    hasCompliance: false,
    avgLatencyMs: 8000,
    avgFeePercent: 0.2,
  },
  {
    provider: PP.NOIR,
    levels: [PL.ZK_PROVEN],
    tokens: ['*'], // Supports any token via proofs
    hasOnChainVerification: true,
    hasCompliance: false,
    avgLatencyMs: 6000,
    avgFeePercent: 0.1,
  },
  {
    provider: PP.PRIVACY_CASH,
    levels: [PL.COMPLIANT_POOL, PL.SENDER_HIDDEN],
    tokens: ['SOL', 'USDC'],
    hasOnChainVerification: true,
    hasCompliance: true,
    avgLatencyMs: 12000,
    avgFeePercent: 1.0,
  },
];

/**
 * Privacy Router
 *
 * Intelligent routing engine that selects the optimal privacy provider
 * based on the requested privacy level, token, and other constraints.
 */
export class PrivacyRouter {
  private adapters: Map<PrivacyProvider, PrivacyProviderAdapter> = new Map();
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger.child('Router');
  }

  /**
   * Register an adapter with the router
   */
  registerAdapter(adapter: PrivacyProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter);
    this.logger.debug(`Registered adapter: ${adapter.name}`);
  }

  /**
   * Get a registered adapter
   */
  getAdapter(provider: PrivacyProvider): PrivacyProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  /**
   * Get all registered adapters
   */
  getAdapters(): PrivacyProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Select the best provider for given criteria
   */
  async selectProvider(criteria: SelectionCriteria): Promise<SelectionResult> {
    this.logger.debug('Selecting provider', criteria);

    // Get candidate providers
    const candidates = await this.getCandidates(criteria);

    if (candidates.length === 0) {
      throw new UnsupportedPrivacyLevelError(criteria.privacyLevel);
    }

    // Score and rank candidates
    const scored = await Promise.all(
      candidates.map(async (candidate) => {
        const score = await this.scoreCandidate(candidate, criteria);
        return { ...candidate, score };
      })
    );

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    this.logger.info(
      `Selected provider: ${best.provider} (score: ${best.score.toFixed(2)})`
    );

    return best;
  }

  /**
   * Get all providers that could handle the request
   */
  private async getCandidates(
    criteria: SelectionCriteria
  ): Promise<Omit<SelectionResult, 'score'>[]> {
    const candidates: Omit<SelectionResult, 'score'>[] = [];

    for (const capabilities of PROVIDER_CAPABILITIES) {
      const adapter = this.adapters.get(capabilities.provider);
      if (!adapter || !adapter.isReady()) {
        continue;
      }

      // Check privacy level support
      if (!capabilities.levels.includes(criteria.privacyLevel)) {
        continue;
      }

      // Check token support
      const tokenSupported =
        capabilities.tokens.includes('*') ||
        capabilities.tokens.includes(criteria.token.toUpperCase());
      if (!tokenSupported) {
        continue;
      }

      // Check compliance requirement
      if (criteria.requireCompliance && !capabilities.hasCompliance) {
        continue;
      }

      // Check on-chain verification requirement
      if (criteria.requireOnChainVerification && !capabilities.hasOnChainVerification) {
        continue;
      }

      // Get estimate
      const estimate = await adapter.estimate({
        operation: 'transfer',
        amount: criteria.amount,
        token: criteria.token,
        privacy: criteria.privacyLevel,
      });

      // Check constraints
      if (criteria.maxFee !== undefined && estimate.fee > criteria.maxFee) {
        continue;
      }

      if (criteria.maxLatency !== undefined && estimate.latencyMs > criteria.maxLatency) {
        continue;
      }

      const reasons: string[] = [];
      reasons.push(`Supports ${criteria.privacyLevel} privacy`);
      reasons.push(`Supports ${criteria.token} token`);
      if (capabilities.hasCompliance) {
        reasons.push('Includes compliance features');
      }
      if (capabilities.hasOnChainVerification) {
        reasons.push('On-chain verification available');
      }

      candidates.push({
        provider: capabilities.provider,
        adapter,
        estimate,
        reasons,
      });
    }

    return candidates;
  }

  /**
   * Score a candidate provider
   */
  private async scoreCandidate(
    candidate: Omit<SelectionResult, 'score'>,
    criteria: SelectionCriteria
  ): Promise<number> {
    let score = 100; // Base score

    // Preferred provider bonus
    if (criteria.preferredProvider === candidate.provider) {
      score += 50;
      candidate.reasons.push('Preferred provider');
    }

    // Fee scoring (lower is better)
    const capabilities = PROVIDER_CAPABILITIES.find(
      (c) => c.provider === candidate.provider
    );
    if (capabilities) {
      // Normalize fee to 0-20 points (lower fee = higher score)
      const feeScore = Math.max(0, 20 - capabilities.avgFeePercent * 10);
      score += feeScore;

      // Latency scoring (lower is better)
      // Normalize to 0-20 points
      const latencyScore = Math.max(0, 20 - capabilities.avgLatencyMs / 1000);
      score += latencyScore;
    }

    // Privacy level matching bonus
    const levelScores: Record<PrivacyLevel, number> = {
      [PL.FULL_ENCRYPTED]: 25,
      [PL.ZK_PROVEN]: 20,
      [PL.COMPLIANT_POOL]: 20,
      [PL.AMOUNT_HIDDEN]: 15,
      [PL.SENDER_HIDDEN]: 10,
      [PL.NONE]: 0,
    };
    score += levelScores[criteria.privacyLevel] || 0;

    // Anonymity set bonus
    if (candidate.estimate.anonymitySet) {
      // Log scale for anonymity set
      const anonScore = Math.min(15, Math.log10(candidate.estimate.anonymitySet) * 5);
      score += anonScore;
    }

    // Warning penalty
    score -= candidate.estimate.warnings.length * 5;

    return Math.max(0, score);
  }

  /**
   * Get routing recommendation for a transfer
   */
  async getRecommendation(request: TransferRequest): Promise<{
    recommended: SelectionResult;
    alternatives: SelectionResult[];
    explanation: string;
  }> {
    const criteria: SelectionCriteria = {
      privacyLevel: request.privacy,
      token: request.token,
      amount: request.amount,
      maxFee: request.options?.maxFee,
      preferredProvider: request.provider,
    };

    // Get all candidates
    const allCandidates = await this.getCandidates(criteria);

    if (allCandidates.length === 0) {
      throw new UnsupportedPrivacyLevelError(request.privacy);
    }

    // Score all
    const scored = await Promise.all(
      allCandidates.map(async (c) => ({
        ...c,
        score: await this.scoreCandidate(c, criteria),
      }))
    );

    scored.sort((a, b) => b.score - a.score);

    const recommended = scored[0];
    const alternatives = scored.slice(1);

    const explanation = this.generateExplanation(recommended, alternatives, criteria);

    return {
      recommended,
      alternatives,
      explanation,
    };
  }

  /**
   * Generate human-readable explanation for selection
   */
  private generateExplanation(
    recommended: SelectionResult,
    alternatives: SelectionResult[],
    criteria: SelectionCriteria
  ): string {
    const lines: string[] = [];

    lines.push(`Recommended: ${recommended.adapter.name}`);
    lines.push(`Reasons:`);
    for (const reason of recommended.reasons) {
      lines.push(`  - ${reason}`);
    }

    lines.push(`Estimated fee: ${recommended.estimate.fee.toFixed(4)} ${criteria.token}`);
    lines.push(`Estimated latency: ${(recommended.estimate.latencyMs / 1000).toFixed(1)}s`);

    if (recommended.estimate.anonymitySet) {
      lines.push(`Anonymity set: ~${recommended.estimate.anonymitySet} users`);
    }

    if (alternatives.length > 0) {
      lines.push(`\nAlternatives:`);
      for (const alt of alternatives.slice(0, 2)) {
        lines.push(`  - ${alt.adapter.name} (score: ${alt.score.toFixed(0)})`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Map privacy level to best default provider
   */
  getDefaultProvider(privacyLevel: PrivacyLevel): PrivacyProvider {
    switch (privacyLevel) {
      case PL.AMOUNT_HIDDEN:
        return PP.SHADOWWIRE;
      case PL.FULL_ENCRYPTED:
        return PP.ARCIUM;
      case PL.ZK_PROVEN:
        return PP.NOIR;
      case PL.COMPLIANT_POOL:
        return PP.PRIVACY_CASH;
      case PL.SENDER_HIDDEN:
        return PP.SHADOWWIRE;
      default:
        return PP.SHADOWWIRE;
    }
  }
}
