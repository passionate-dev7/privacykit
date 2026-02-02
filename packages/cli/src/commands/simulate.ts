import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Connection } from '@solana/web3.js';
import {
  PrivacyLevel,
  PrivacyProvider,
  PrivacyRouter,
  getAllAdapters,
  type TransferRequest,
  type WalletAdapter,
} from '@privacykit/sdk';
import { loadConfig, getRpcUrl } from '../utils/config.js';
import { loadWallet, isValidAddress, truncateAddress } from '../utils/wallet.js';

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
 * Provider display names and descriptions
 */
const PROVIDER_INFO: Record<string, { description: string; features: string[] }> = {
  shadowwire: {
    description: 'Bulletproof-based privacy using ZK proofs',
    features: ['Hidden amounts', 'Anonymous sender', 'Fast confirmations', '22+ tokens'],
  },
  arcium: {
    description: 'Multi-party computation for full encryption',
    features: ['Full encryption', 'On-chain verification', 'High security'],
  },
  noir: {
    description: 'Zero-knowledge proofs with custom circuits',
    features: ['Custom proofs', 'Flexible circuits', 'On-chain verification'],
  },
  privacycash: {
    description: 'Compliant privacy with proof of innocence',
    features: ['Compliance support', 'Larger pools', 'Regulatory friendly'],
  },
};

/**
 * Simulate a transfer and show provider selection details
 */
export function createSimulateCommand(): Command {
  const command = new Command('simulate')
    .description('Simulate a transfer and show provider selection details')
    .requiredOption('-a, --amount <amount>', 'Amount to transfer', parseFloat)
    .option('-t, --token <symbol>', 'Token symbol (e.g., SOL, USDC)', 'SOL')
    .option('-p, --privacy <level>', 'Privacy level (amount-hidden, sender-hidden, full-encrypted, zk-proven, compliant-pool)', 'amount-hidden')
    .option('--to <address>', 'Recipient address (optional for simulation)')
    .option('-k, --keypair <path>', 'Path to wallet keypair file')
    .option('-n, --network <network>', 'Solana network')
    .option('-r, --rpc <url>', 'Custom RPC endpoint URL')
    .option('--verbose', 'Show detailed provider analysis')
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

        if (options.to && !isValidAddress(options.to)) {
          console.error(chalk.red('\n  Error: Invalid recipient address\n'));
          process.exit(1);
        }

        // Connect to network
        spinner.start(`Connecting to ${network}...`);
        const connection = new Connection(rpcUrl, 'confirmed');
        const version = await connection.getVersion();
        spinner.succeed(`Connected to ${network} (Solana ${version['solana-core']})`);

        // Load wallet (optional)
        let wallet = undefined;
        if (keypairPath) {
          try {
            wallet = loadWallet(keypairPath);
            console.log(chalk.gray(`  Wallet: ${wallet.publicKey.toBase58()}`));
          } catch {
            // Wallet not required for simulation
          }
        }

        // Initialize router and adapters
        spinner.start('Initializing privacy providers...');
        const router = new PrivacyRouter();
        const adapters = getAllAdapters();

        const adapterStatus: { name: string; ready: boolean; error?: string }[] = [];

        for (const adapter of adapters) {
          try {
            await adapter.initialize(connection, wallet as unknown as WalletAdapter | undefined);
            router.registerAdapter(adapter);
            adapterStatus.push({ name: adapter.name, ready: true });
          } catch (error) {
            adapterStatus.push({
              name: adapter.name,
              ready: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
        spinner.succeed('Privacy providers initialized');

        // Display simulation header
        console.log(chalk.bold('\n  Transfer Simulation\n'));
        console.log(chalk.gray('  ' + '='.repeat(60)));

        // Simulation parameters
        console.log(chalk.bold('\n  Parameters\n'));
        console.log(chalk.gray('  Amount:     ') + chalk.cyan(`${options.amount} ${options.token.toUpperCase()}`));
        console.log(chalk.gray('  Privacy:    ') + chalk.cyan(options.privacy));
        console.log(chalk.gray('  Token:      ') + chalk.cyan(options.token.toUpperCase()));
        if (options.to) {
          console.log(chalk.gray('  Recipient:  ') + chalk.cyan(truncateAddress(options.to)));
        }
        console.log(chalk.gray('  Network:    ') + chalk.cyan(network));
        console.log();

        // Provider status
        console.log(chalk.bold('  Provider Status\n'));
        for (const status of adapterStatus) {
          const icon = status.ready ? chalk.green('[Ready]') : chalk.red('[Unavailable]');
          console.log(`  ${icon} ${status.name}`);
          if (!status.ready && status.error && options.verbose) {
            console.log(chalk.gray(`       Error: ${status.error}`));
          }
        }
        console.log();

        // Build transfer request for routing
        const request: TransferRequest = {
          recipient: options.to || '11111111111111111111111111111111', // Dummy if not provided
          amount: options.amount,
          token: options.token.toUpperCase(),
          privacy: privacyLevel,
        };

        // Get routing recommendation
        spinner.start('Analyzing routing options...');
        let recommendation;
        try {
          recommendation = await router.getRecommendation(request);
          spinner.succeed('Routing analysis complete');
        } catch (error) {
          spinner.fail('Routing analysis failed');
          if (error instanceof Error) {
            console.log(chalk.red(`\n  Error: ${error.message}`));
          }
          console.log();
          process.exit(1);
        }

        // Display routing recommendation
        console.log(chalk.bold('\n  Routing Decision\n'));

        // Recommended provider
        const recommended = recommendation.recommended;
        const providerKey = recommended.provider.toLowerCase();
        const providerInfo = PROVIDER_INFO[providerKey];

        console.log(chalk.green.bold(`  Recommended: ${recommended.adapter.name}`));
        if (providerInfo) {
          console.log(chalk.gray(`  ${providerInfo.description}`));
        }
        console.log();

        // Score breakdown
        console.log(chalk.gray('  Score:          ') + chalk.white(recommended.score.toFixed(2)));
        console.log(chalk.gray('  Est. Fee:       ') + chalk.yellow(`${recommended.estimate.fee.toFixed(6)} ${options.token.toUpperCase()}`));
        console.log(chalk.gray('  Est. Latency:   ') + chalk.cyan(`${(recommended.estimate.latencyMs / 1000).toFixed(1)}s`));
        if (recommended.estimate.anonymitySet) {
          console.log(chalk.gray('  Anonymity Set:  ') + chalk.green(`~${recommended.estimate.anonymitySet} users`));
        }

        // Selection reasons
        console.log(chalk.bold('\n  Selection Reasons:\n'));
        for (const reason of recommended.reasons) {
          console.log(chalk.gray('  - ') + chalk.white(reason));
        }

        // Provider features
        if (providerInfo && options.verbose) {
          console.log(chalk.bold('\n  Provider Features:\n'));
          for (const feature of providerInfo.features) {
            console.log(chalk.gray('  - ') + chalk.cyan(feature));
          }
        }

        // Warnings
        if (recommended.estimate.warnings.length > 0) {
          console.log(chalk.yellow('\n  Warnings:\n'));
          for (const warning of recommended.estimate.warnings) {
            console.log(chalk.yellow(`  ! ${warning}`));
          }
        }

        // Alternatives
        if (recommendation.alternatives.length > 0) {
          console.log(chalk.bold('\n  Alternative Providers\n'));
          console.log(chalk.gray('  Provider         Score     Fee                 Latency'));
          console.log(chalk.gray('  ' + '-'.repeat(58)));

          for (const alt of recommendation.alternatives.slice(0, 3)) {
            const scoreStr = alt.score.toFixed(0).padEnd(8);
            const feeStr = `${alt.estimate.fee.toFixed(6)} ${options.token.toUpperCase()}`.padEnd(18);
            const latencyStr = `${(alt.estimate.latencyMs / 1000).toFixed(1)}s`;

            console.log(
              `  ${alt.adapter.name.padEnd(16)} ` +
              chalk.gray(scoreStr) +
              chalk.yellow(feeStr) +
              chalk.cyan(latencyStr)
            );

            if (options.verbose && alt.reasons.length > 0) {
              for (const reason of alt.reasons.slice(0, 2)) {
                console.log(chalk.gray(`                   - ${reason}`));
              }
            }
          }
        }

        // Cost breakdown
        console.log(chalk.bold('\n  Cost Breakdown\n'));
        const fee = recommended.estimate.fee;
        const netAmount = options.amount - fee;
        const feePercent = (fee / options.amount * 100).toFixed(2);

        console.log(chalk.gray('  Gross Amount:   ') + chalk.white(`${options.amount.toFixed(6)} ${options.token.toUpperCase()}`));
        console.log(chalk.gray('  Provider Fee:   ') + chalk.red(`-${fee.toFixed(6)} ${options.token.toUpperCase()} (${feePercent}%)`));
        console.log(chalk.gray('  Net Amount:     ') + chalk.green(`${netAmount.toFixed(6)} ${options.token.toUpperCase()}`));

        // Execution command
        console.log(chalk.bold('\n  To Execute This Transfer:\n'));
        let cmd = `  privacykit transfer --amount ${options.amount} --token ${options.token.toUpperCase()} --privacy ${options.privacy}`;
        if (options.to) {
          cmd += ` --to ${options.to}`;
        } else {
          cmd += ` --to <RECIPIENT_ADDRESS>`;
        }
        console.log(chalk.white(cmd));
        console.log();

        // Summary
        console.log(chalk.gray('  ' + '='.repeat(60)));
        console.log(chalk.bold('\n  Simulation Summary\n'));
        console.log(chalk.gray('  This simulation analyzed the optimal provider for your'));
        console.log(chalk.gray('  transfer based on fees, latency, and privacy requirements.'));
        console.log(chalk.gray('  No actual transaction was executed.\n'));

      } catch (error) {
        spinner.fail('Simulation failed');

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
