import type {
  PrivacyProvider,
  PrivacyLevel,
  TransferRequest,
  TransferResult,
  DepositRequest,
  DepositResult,
  WithdrawRequest,
  WithdrawResult,
  ProveRequest,
  ProveResult,
  PipelineStep,
  PipelineResult,
  PrivacyProviderAdapter,
} from '../types';
import { Logger, defaultLogger } from '../utils/logger';
import { TransactionError, wrapError } from '../utils/errors';
import { sleep } from '../utils';

/**
 * Pipeline step types
 */
type StepType = 'deposit' | 'transfer' | 'withdraw' | 'prove' | 'wait' | 'custom';

/**
 * Step execution result
 */
interface StepResult {
  type: StepType;
  provider?: PrivacyProvider;
  result: TransferResult | DepositResult | WithdrawResult | ProveResult | void;
  success: boolean;
  error?: Error;
}

/**
 * Pipeline step configuration
 */
interface PipelineStepConfig {
  type: StepType;
  provider?: PrivacyProvider;
  params: Record<string, unknown>;
  onSuccess?: (result: unknown) => void;
  onError?: (error: Error) => void;
}

/**
 * Pipeline Builder
 *
 * Fluent API for building complex privacy workflows that chain
 * multiple operations across different providers.
 *
 * Example:
 * ```typescript
 * const result = await kit.pipeline()
 *   .deposit({ amount: 100, token: 'SOL', provider: 'privacycash' })
 *   .prove({ circuit: 'not-sanctioned', provider: 'noir' })
 *   .withdraw({ recipient: 'address', provider: 'shadowwire' })
 *   .execute();
 * ```
 */
export class PipelineBuilder {
  private steps: PipelineStepConfig[] = [];
  private logger: Logger;
  private getAdapter: (provider: PrivacyProvider) => PrivacyProviderAdapter | undefined;
  private context: Record<string, unknown> = {};

  constructor(
    getAdapter: (provider: PrivacyProvider) => PrivacyProviderAdapter | undefined,
    logger?: Logger
  ) {
    this.getAdapter = getAdapter;
    this.logger = logger || defaultLogger.child('Pipeline');
  }

  /**
   * Add a deposit step
   */
  deposit(params: {
    amount: number;
    token: string;
    provider?: PrivacyProvider;
  }): PipelineBuilder {
    this.steps.push({
      type: 'deposit',
      provider: params.provider,
      params,
    });
    return this;
  }

  /**
   * Add a transfer step
   */
  transfer(params: {
    recipient: string;
    amount: number;
    token: string;
    privacy: PrivacyLevel;
    provider?: PrivacyProvider;
  }): PipelineBuilder {
    this.steps.push({
      type: 'transfer',
      provider: params.provider,
      params,
    });
    return this;
  }

  /**
   * Add a withdrawal step
   */
  withdraw(params: {
    recipient: string;
    amount?: number;
    token?: string;
    provider?: PrivacyProvider;
    commitment?: string;
  }): PipelineBuilder {
    this.steps.push({
      type: 'withdraw',
      provider: params.provider,
      params,
    });
    return this;
  }

  /**
   * Add a prove step
   */
  prove(params: {
    circuit: string;
    publicInputs?: Record<string, unknown>;
    privateInputs?: Record<string, unknown>;
    provider?: PrivacyProvider;
  }): PipelineBuilder {
    this.steps.push({
      type: 'prove',
      provider: params.provider,
      params,
    });
    return this;
  }

  /**
   * Add a wait step (delay between operations)
   */
  wait(ms: number): PipelineBuilder {
    this.steps.push({
      type: 'wait',
      params: { ms },
    });
    return this;
  }

  /**
   * Add a custom step
   */
  custom(
    name: string,
    executor: (context: Record<string, unknown>) => Promise<unknown>
  ): PipelineBuilder {
    this.steps.push({
      type: 'custom',
      params: { name, executor },
    });
    return this;
  }

  /**
   * Set context value for use in later steps
   */
  setContext(key: string, value: unknown): PipelineBuilder {
    this.context[key] = value;
    return this;
  }

  /**
   * Execute the pipeline
   */
  async execute(): Promise<PipelineResult> {
    this.logger.info(`Executing pipeline with ${this.steps.length} steps`);

    const results: StepResult[] = [];
    let totalFee = 0;
    let success = true;

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      this.logger.info(`Step ${i + 1}/${this.steps.length}: ${step.type}`);

      try {
        const result = await this.executeStep(step);
        results.push({
          type: step.type,
          provider: step.provider,
          result,
          success: true,
        });

        // Extract fee from result if present
        if (result && typeof result === 'object' && 'fee' in result) {
          totalFee += (result as { fee: number }).fee;
        }

        // Store commitment in context if present (for deposit -> withdraw chains)
        if (result && typeof result === 'object' && 'commitment' in result) {
          this.context.lastCommitment = (result as { commitment: string }).commitment;
        }

        // Store signature in context
        if (result && typeof result === 'object' && 'signature' in result) {
          this.context.lastSignature = (result as { signature: string }).signature;
        }

        step.onSuccess?.(result);
      } catch (error) {
        this.logger.error(`Step ${i + 1} failed`, error);
        results.push({
          type: step.type,
          provider: step.provider,
          result: undefined,
          success: false,
          error: error as Error,
        });
        success = false;
        step.onError?.(error as Error);
        break; // Stop pipeline on error
      }
    }

    return {
      steps: results.map((r) => ({
        type: r.type,
        result: r.result as TransferResult | DepositResult | WithdrawResult | ProveResult,
        provider: r.provider!,
      })),
      totalFee,
      success,
    };
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: PipelineStepConfig): Promise<unknown> {
    switch (step.type) {
      case 'deposit':
        return this.executeDeposit(step);
      case 'transfer':
        return this.executeTransfer(step);
      case 'withdraw':
        return this.executeWithdraw(step);
      case 'prove':
        return this.executeProve(step);
      case 'wait':
        return this.executeWait(step);
      case 'custom':
        return this.executeCustom(step);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  private async executeDeposit(step: PipelineStepConfig): Promise<DepositResult> {
    const { amount, token, provider } = step.params as {
      amount: number;
      token: string;
      provider?: PrivacyProvider;
    };

    if (!provider) {
      throw new Error('Provider required for deposit step');
    }

    const adapter = this.getAdapter(provider);
    if (!adapter) {
      throw new Error(`Adapter not found for provider: ${provider}`);
    }

    return adapter.deposit({ amount, token });
  }

  private async executeTransfer(step: PipelineStepConfig): Promise<TransferResult> {
    const { recipient, amount, token, privacy, provider } = step.params as {
      recipient: string;
      amount: number;
      token: string;
      privacy: PrivacyLevel;
      provider?: PrivacyProvider;
    };

    if (!provider) {
      throw new Error('Provider required for transfer step');
    }

    const adapter = this.getAdapter(provider);
    if (!adapter) {
      throw new Error(`Adapter not found for provider: ${provider}`);
    }

    return adapter.transfer({ recipient, amount, token, privacy });
  }

  private async executeWithdraw(step: PipelineStepConfig): Promise<WithdrawResult> {
    const { recipient, amount, token, provider, commitment } = step.params as {
      recipient: string;
      amount?: number;
      token?: string;
      provider?: PrivacyProvider;
      commitment?: string;
    };

    if (!provider) {
      throw new Error('Provider required for withdraw step');
    }

    const adapter = this.getAdapter(provider);
    if (!adapter) {
      throw new Error(`Adapter not found for provider: ${provider}`);
    }

    // Use commitment from context if not provided
    const actualCommitment = commitment || (this.context.lastCommitment as string);

    return adapter.withdraw({
      recipient,
      amount: amount || 0,
      token: token || 'SOL',
      commitment: actualCommitment,
    });
  }

  private async executeProve(step: PipelineStepConfig): Promise<ProveResult> {
    const { circuit, publicInputs, privateInputs, provider } = step.params as {
      circuit: string;
      publicInputs?: Record<string, unknown>;
      privateInputs?: Record<string, unknown>;
      provider?: PrivacyProvider;
    };

    // Use Noir adapter for proving
    const adapter = this.getAdapter(provider || PrivacyProvider.NOIR);
    if (!adapter) {
      throw new Error('Noir adapter not found for prove step');
    }

    // Check if adapter supports prove method
    if (!('prove' in adapter)) {
      throw new Error('Adapter does not support prove method');
    }

    return (adapter as unknown as { prove: (req: ProveRequest) => Promise<ProveResult> }).prove({
      circuit,
      publicInputs: publicInputs || {},
      privateInputs: privateInputs || {},
    });
  }

  private async executeWait(step: PipelineStepConfig): Promise<void> {
    const { ms } = step.params as { ms: number };
    this.logger.debug(`Waiting ${ms}ms`);
    await sleep(ms);
  }

  private async executeCustom(step: PipelineStepConfig): Promise<unknown> {
    const { name, executor } = step.params as {
      name: string;
      executor: (context: Record<string, unknown>) => Promise<unknown>;
    };
    this.logger.debug(`Executing custom step: ${name}`);
    return executor(this.context);
  }

  /**
   * Dry run - estimate costs without executing
   */
  async dryRun(): Promise<{
    estimatedFee: number;
    estimatedLatencyMs: number;
    steps: Array<{ type: string; provider?: PrivacyProvider; estimatedFee: number }>;
  }> {
    let totalFee = 0;
    let totalLatency = 0;
    const stepEstimates: Array<{ type: string; provider?: PrivacyProvider; estimatedFee: number }> = [];

    for (const step of this.steps) {
      if (step.type === 'wait') {
        const ms = (step.params as { ms: number }).ms;
        totalLatency += ms;
        stepEstimates.push({ type: 'wait', estimatedFee: 0 });
        continue;
      }

      if (step.type === 'custom') {
        stepEstimates.push({ type: 'custom', estimatedFee: 0 });
        continue;
      }

      if (!step.provider) {
        stepEstimates.push({ type: step.type, estimatedFee: 0 });
        continue;
      }

      const adapter = this.getAdapter(step.provider);
      if (!adapter) {
        stepEstimates.push({ type: step.type, provider: step.provider, estimatedFee: 0 });
        continue;
      }

      const estimate = await adapter.estimate({
        operation: step.type as 'transfer' | 'deposit' | 'withdraw' | 'prove',
        amount: step.params.amount as number,
        token: step.params.token as string,
      });

      totalFee += estimate.fee;
      totalLatency += estimate.latencyMs;
      stepEstimates.push({
        type: step.type,
        provider: step.provider,
        estimatedFee: estimate.fee,
      });
    }

    return {
      estimatedFee: totalFee,
      estimatedLatencyMs: totalLatency,
      steps: stepEstimates,
    };
  }

  /**
   * Get the number of steps in the pipeline
   */
  get length(): number {
    return this.steps.length;
  }

  /**
   * Clear all steps
   */
  clear(): PipelineBuilder {
    this.steps = [];
    this.context = {};
    return this;
  }
}
