import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Connection } from '@solana/web3.js';
import {
  PrivacyLevel,
  PrivacyProvider,
  getAllAdapters,
  type EstimateRequest,
  type WalletAdapter,
} from '@privacykit/sdk';
import { loadConfig, getRpcUrl } from '../utils/config.js';
import { loadWallet, truncateAddress } from '../utils/wallet.js';

/**
 * Privacy level mapping from CLI strings to SDK enums
 */
const PRIVACY_LEVEL_MAP: Record<string, PrivacyLevel> = {
  'amount-hidden': PrivacyLevel.AMOUNT_HIDDEN,
  'sender-hidden': PrivacyLevel.SENDER_HIDDEN,
  'full-encrypted': PrivacyLevel.FULL_ENCRYPTED,
  'zk-proven': PrivacyLevel.ZK_PROVEN,
  'compliant-pool': PrivacyLevel.COMPLIANT_POOL,
  'none': PrivacyLevel.NONE,
};

/**
 * Provider mapping from CLI strings to SDK enums
 */
const PROVIDER_MAP: Record<string, PrivacyProvider> = {
  'shadowwire': PrivacyProvider.SHADOWWIRE,
  'arcium': PrivacyProvider.ARCIUM,
  'noir': PrivacyProvider.NOIR,
  'privacycash': PrivacyProvider.PRIVACY_CASH,
};

/**
 * Estimate costs for privacy operations
 */
export function createEstimateCommand(): Command {
  const command = new Command('estimate')
    .description('Estimate costs for privacy operations')
    .requiredOption('-a, --amount <amount>', 'Amount for the operation', parseFloat)
    .option('-t, --token <symbol>', 'Token symbol (e.g., SOL, USDC)', 'SOL')
    .option('-p, --privacy <level>', 'Privacy level (amount-hidden, sender-hidden, full-encrypted, zk-proven, compliant-pool)', 'amount-hidden')
    .option('-o, --operation <type>', 'Operation type (transfer, deposit, withdraw)', 'transfer')
    .option('--provider <provider>', 'Specific provider to estimate for')
    .option('--compare', 'Compare estimates across all providers')
    .option('-k, --keypair <path>', 'Path to wallet keypair file')
    .option('-n, --network <network>', 'Solana network')
    .option('-r, --rpc <url>', 'Custom RPC endpoint URL')
    .action(async (options) => {
      const spinner = ora();

      try {
        // Load configuration
        const config = loadConfig();
        const network = options.network || config.network;
        const rpcUrl = getRpcUrl(network, options.rpc || config.rpcUrl);
        const keypairPath = options.keypair || config.keypairPath;

        // Validate inputs
        if (options.amount <= 0) {
          console.error(chalk.red('\n  Error: Amount must be greater than 0\n'));
          process.exit(1);
        }

        const privacyLevel = PRIVACY_LEVEL_MAP[options.privacy];
        if (!privacyLevel) {
          console.error(chalk.red(`\n  Error: Invalid privacy level: ${options.privacy}`));
          console.error(chalk.gray(`  Valid options: ${Object.keys(PRIVACY_LEVEL_MAP).join(', ')}\n`));
          process.exit(1);
        }

        const validOperations = ['transfer', 'deposit', 'withdraw', 'prove'];
        if (!validOperations.includes(options.operation)) {
          console.error(chalk.red(`\n  Error: Invalid operation: ${options.operation}`));
          console.error(chalk.gray(`  Valid options: ${validOperations.join(', ')}\n`));
          process.exit(1);
        }

        let specificProvider: PrivacyProvider | undefined;
        if (options.provider) {
          specificProvider = PROVIDER_MAP[options.provider];
          if (!specificProvider) {
            console.error(chalk.red(`\n  Error: Invalid provider: ${options.provider}`));
            console.error(chalk.gray(`  Valid options: ${Object.keys(PROVIDER_MAP).join(', ')}\n`));
            process.exit(1);
          }
        }

        // Connect to network
        spinner.start(`Connecting to ${network}...`);
        const connection = new Connection(rpcUrl, 'confirmed');
        await connection.getVersion();
        spinner.succeed(`Connected to ${network}`);

        // Load wallet (optional for estimates)
        let wallet = undefined;
        if (keypairPath) {
          try {
            wallet = loadWallet(keypairPath);
          } catch {
            // Wallet not required for estimates
          }
        }

        // Initialize adapters
        spinner.start('Initializing privacy providers...');
        const adapters = getAllAdapters();
        const availableAdapters: typeof adapters = [];

        for (const adapter of adapters) {
          try {
            await adapter.initialize(connection, wallet as unknown as WalletAdapter | undefined);
            availableAdapters.push(adapter);
          } catch {
            // Skip adapters that fail to initialize
          }
        }
        spinner.succeed(`${availableAdapters.length} providers available`);

        // Build estimate request
        const request: EstimateRequest = {
          operation: options.operation as 'transfer' | 'deposit' | 'withdraw' | 'prove',
          amount: options.amount,
          token: options.token.toUpperCase(),
          privacy: privacyLevel,
          provider: specificProvider,
        };

        console.log(chalk.bold('\n  Cost Estimate\n'));
        console.log(chalk.gray('  Operation:  ') + chalk.cyan(options.operation));
        console.log(chalk.gray('  Amount:     ') + chalk.cyan(`${options.amount} ${options.token.toUpperCase()}`));
        console.log(chalk.gray('  Privacy:    ') + chalk.cyan(options.privacy));
        console.log();

        // Get estimates
        interface EstimateWithProvider {
          provider: string;
          estimate: Awaited<ReturnType<typeof adapter.estimate>>;
          supported: boolean;
        }

        const estimates: EstimateWithProvider[] = [];

        for (const adapter of availableAdapters) {
          // Skip if specific provider requested and this isn't it
          if (specificProvider && adapter.provider !== specificProvider) {
            continue;
          }

          // Check if adapter supports this operation and privacy level
          const supportsToken = adapter.supportedTokens.includes(options.token.toUpperCase()) ||
                               adapter.supportedTokens.includes('*');
          const supportsPrivacy = adapter.supportedLevels.includes(privacyLevel);

          if (!supportsToken || !supportsPrivacy) {
            estimates.push({
              provider: adapter.name,
              estimate: {
                fee: 0,
                provider: adapter.provider,
                latencyMs: 0,
                warnings: [`Does not support ${options.token.toUpperCase()} with ${options.privacy} privacy`],
              },
              supported: false,
            });
            continue;
          }

          try {
            const estimate = await adapter.estimate(request);
            estimates.push({
              provider: adapter.name,
              estimate,
              supported: true,
            });
          } catch (error) {
            estimates.push({
              provider: adapter.name,
              estimate: {
                fee: 0,
                provider: adapter.provider,
                latencyMs: 0,
                warnings: [error instanceof Error ? error.message : 'Estimation failed'],
              },
              supported: false,
            });
          }
        }

        // Sort by fee (lowest first)
        estimates.sort((a, b) => {
          if (!a.supported && !b.supported) return 0;
          if (!a.supported) return 1;
          if (!b.supported) return -1;
          return a.estimate.fee - b.estimate.fee;
        });

        // Display estimates
        if (options.compare || !specificProvider) {
          console.log(chalk.bold('  Provider Comparison\n'));
          console.log(chalk.gray('  Provider         Fee                 Latency     Anonymity'));
          console.log(chalk.gray('  ' + '-'.repeat(65)));

          for (const { provider, estimate, supported } of estimates) {
            if (!supported) {
              console.log(
                `  ${provider.padEnd(16)} ` +
                chalk.gray('Not supported')
              );
              continue;
            }

            const feeStr = `${estimate.fee.toFixed(6)} ${options.token.toUpperCase()}`.padEnd(18);
            const latencyStr = `${(estimate.latencyMs / 1000).toFixed(1)}s`.padEnd(10);
            const anonStr = estimate.anonymitySet ? `~${estimate.anonymitySet} users` : 'N/A';

            console.log(
              `  ${provider.padEnd(16)} ` +
              chalk.yellow(feeStr) +
              chalk.cyan(latencyStr) +
              chalk.green(anonStr)
            );

            if (estimate.warnings.length > 0) {
              for (const warning of estimate.warnings) {
                console.log(chalk.gray(`                     `) + chalk.yellow(`Warning: ${warning}`));
              }
            }
          }

          console.log();

          // Recommend best option
          const bestEstimate = estimates.find(e => e.supported);
          if (bestEstimate) {
            console.log(chalk.bold('  Recommendation\n'));
            console.log(chalk.gray('  Best option: ') + chalk.green(bestEstimate.provider));
            console.log(chalk.gray('  Reason:      ') + chalk.white('Lowest fee with required privacy level'));
            console.log();
          }
        } else {
          // Single provider estimate
          const providerEstimate = estimates[0];
          if (providerEstimate && providerEstimate.supported) {
            console.log(chalk.bold(`  ${providerEstimate.provider} Estimate\n`));
            console.log(chalk.gray('  Fee:        ') + chalk.yellow(`${providerEstimate.estimate.fee.toFixed(6)} ${options.token.toUpperCase()}`));
            console.log(chalk.gray('  Latency:    ') + chalk.cyan(`${(providerEstimate.estimate.latencyMs / 1000).toFixed(1)}s`));

            if (providerEstimate.estimate.anonymitySet) {
              console.log(chalk.gray('  Anonymity:  ') + chalk.green(`~${providerEstimate.estimate.anonymitySet} users`));
            }

            if (providerEstimate.estimate.warnings.length > 0) {
              console.log(chalk.yellow('\n  Warnings:'));
              for (const warning of providerEstimate.estimate.warnings) {
                console.log(chalk.yellow(`  - ${warning}`));
              }
            }

            console.log();

            // Calculate net amount
            const netAmount = options.amount - providerEstimate.estimate.fee;
            console.log(chalk.gray('  Gross:      ') + chalk.white(`${options.amount} ${options.token.toUpperCase()}`));
            console.log(chalk.gray('  Fee:        ') + chalk.red(`-${providerEstimate.estimate.fee.toFixed(6)} ${options.token.toUpperCase()}`));
            console.log(chalk.gray('  Net:        ') + chalk.green(`${netAmount.toFixed(6)} ${options.token.toUpperCase()}`));
            console.log();
          } else {
            console.log(chalk.red(`  Provider ${options.provider} does not support this operation\n`));
            process.exit(1);
          }
        }
      } catch (error) {
        spinner.fail('Estimation failed');

        if (error instanceof Error) {
          console.error(chalk.red(`\n  Error: ${error.message}\n`));
        } else {
          console.error(chalk.red('\n  An unexpected error occurred\n'));
        }

        process.exit(1);
      }
    });

  return command;
}
