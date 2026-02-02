import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
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
 * Provider mapping from CLI strings to SDK enums
 */
const PROVIDER_MAP: Record<string, PrivacyProvider> = {
  'shadowwire': PrivacyProvider.SHADOWWIRE,
  'arcium': PrivacyProvider.ARCIUM,
  'noir': PrivacyProvider.NOIR,
  'privacycash': PrivacyProvider.PRIVACY_CASH,
};

/**
 * Execute a private transfer
 */
export function createTransferCommand(): Command {
  const command = new Command('transfer')
    .description('Execute a private transfer')
    .requiredOption('-a, --amount <amount>', 'Amount to transfer', parseFloat)
    .requiredOption('-t, --token <symbol>', 'Token symbol (e.g., SOL, USDC)')
    .requiredOption('--to <address>', 'Recipient address')
    .option('-p, --privacy <level>', 'Privacy level (amount-hidden, sender-hidden, full-encrypted, zk-proven, compliant-pool)', 'amount-hidden')
    .option('--provider <provider>', 'Force specific provider (shadowwire, arcium, noir, privacycash)')
    .option('-k, --keypair <path>', 'Path to wallet keypair file')
    .option('-n, --network <network>', 'Solana network')
    .option('-r, --rpc <url>', 'Custom RPC endpoint URL')
    .option('--max-fee <fee>', 'Maximum fee willing to pay (in token units)', parseFloat)
    .option('--memo <memo>', 'Optional memo for the transfer')
    .option('--dry-run', 'Simulate the transfer without executing')
    .option('--no-confirm', 'Skip confirmation prompt')
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

        if (!isValidAddress(options.to)) {
          console.error(chalk.red('\n  Error: Invalid recipient address\n'));
          process.exit(1);
        }

        const privacyLevel = PRIVACY_LEVEL_MAP[options.privacy];
        if (!privacyLevel) {
          console.error(chalk.red(`\n  Error: Invalid privacy level: ${options.privacy}`));
          console.error(chalk.gray(`  Valid options: ${Object.keys(PRIVACY_LEVEL_MAP).join(', ')}\n`));
          process.exit(1);
        }

        let forcedProvider: PrivacyProvider | undefined;
        if (options.provider) {
          forcedProvider = PROVIDER_MAP[options.provider];
          if (!forcedProvider) {
            console.error(chalk.red(`\n  Error: Invalid provider: ${options.provider}`));
            console.error(chalk.gray(`  Valid options: ${Object.keys(PROVIDER_MAP).join(', ')}\n`));
            process.exit(1);
          }
        }

        // Load wallet
        spinner.start('Loading wallet...');
        if (!keypairPath) {
          spinner.fail('No keypair path configured');
          console.error(chalk.gray('  Run `privacykit init` or specify --keypair\n'));
          process.exit(1);
        }

        const wallet = loadWallet(keypairPath);
        spinner.succeed(`Wallet loaded: ${truncateAddress(wallet.publicKey.toBase58())}`);

        // Connect to network
        spinner.start(`Connecting to ${network}...`);
        const connection = new Connection(rpcUrl, 'confirmed');
        const version = await connection.getVersion();
        spinner.succeed(`Connected to ${network} (Solana ${version['solana-core']})`);

        // Initialize router and adapters
        spinner.start('Initializing privacy providers...');
        const router = new PrivacyRouter();
        const adapters = getAllAdapters();

        for (const adapter of adapters) {
          try {
            await adapter.initialize(connection, wallet as unknown as WalletAdapter);
            router.registerAdapter(adapter);
          } catch (error) {
            // Some adapters may fail to initialize, continue with others
          }
        }
        spinner.succeed('Privacy providers initialized');

        // Build transfer request
        const request: TransferRequest = {
          recipient: options.to,
          amount: options.amount,
          token: options.token.toUpperCase(),
          privacy: privacyLevel,
          provider: forcedProvider,
          options: {
            maxFee: options.maxFee,
            memo: options.memo,
          },
        };

        // Get routing recommendation
        spinner.start('Analyzing optimal route...');
        const recommendation = await router.getRecommendation(request);
        spinner.succeed('Route determined');

        // Display transfer details
        console.log(chalk.bold('\n  Transfer Details:\n'));
        console.log(chalk.gray('  From:         ') + chalk.cyan(truncateAddress(wallet.publicKey.toBase58())));
        console.log(chalk.gray('  To:           ') + chalk.cyan(truncateAddress(options.to)));
        console.log(chalk.gray('  Amount:       ') + chalk.cyan(`${options.amount} ${options.token.toUpperCase()}`));
        console.log(chalk.gray('  Privacy:      ') + chalk.cyan(options.privacy));
        console.log(chalk.gray('  Provider:     ') + chalk.cyan(recommendation.recommended.adapter.name));
        console.log(chalk.gray('  Est. Fee:     ') + chalk.yellow(`${recommendation.recommended.estimate.fee.toFixed(6)} ${options.token.toUpperCase()}`));
        console.log(chalk.gray('  Est. Latency: ') + chalk.yellow(`${(recommendation.recommended.estimate.latencyMs / 1000).toFixed(1)}s`));

        if (recommendation.recommended.estimate.anonymitySet) {
          console.log(chalk.gray('  Anonymity:    ') + chalk.cyan(`~${recommendation.recommended.estimate.anonymitySet} users`));
        }

        if (recommendation.recommended.estimate.warnings.length > 0) {
          console.log(chalk.yellow('\n  Warnings:'));
          for (const warning of recommendation.recommended.estimate.warnings) {
            console.log(chalk.yellow(`  - ${warning}`));
          }
        }

        console.log();

        // Dry run - stop here
        if (options.dryRun) {
          console.log(chalk.blue('  [Dry run] Transfer not executed\n'));
          return;
        }

        // Execute transfer
        spinner.start('Executing transfer...');
        const adapter = recommendation.recommended.adapter;
        const result = await adapter.transfer(request);
        spinner.succeed('Transfer complete');

        // Display result
        console.log(chalk.bold('\n  Transfer Result:\n'));
        console.log(chalk.gray('  Signature:    ') + chalk.green(result.signature));
        console.log(chalk.gray('  Provider:     ') + chalk.cyan(result.provider));
        console.log(chalk.gray('  Privacy:      ') + chalk.cyan(result.privacyLevel));
        console.log(chalk.gray('  Fee:          ') + chalk.yellow(`${result.fee.toFixed(6)} ${options.token.toUpperCase()}`));

        if (result.anonymitySet) {
          console.log(chalk.gray('  Anonymity:    ') + chalk.cyan(`${result.anonymitySet} users`));
        }

        console.log();
        console.log(chalk.green('  Transfer successful!'));
        console.log();

        // Show explorer link for mainnet
        if (network === 'mainnet-beta') {
          console.log(chalk.gray(`  View on Solscan: https://solscan.io/tx/${result.signature}`));
          console.log();
        } else if (network === 'devnet') {
          console.log(chalk.gray(`  View on Solscan: https://solscan.io/tx/${result.signature}?cluster=devnet`));
          console.log();
        }
      } catch (error) {
        spinner.fail('Transfer failed');

        if (error instanceof Error) {
          console.error(chalk.red(`\n  Error: ${error.message}`));

          // Provide helpful error messages
          if (error.message.includes('insufficient')) {
            console.error(chalk.gray('  Make sure you have enough balance for the transfer and fees'));
          } else if (error.message.includes('not found')) {
            console.error(chalk.gray('  The recipient address may not exist or the provider may be unavailable'));
          } else if (error.message.includes('minimum')) {
            console.error(chalk.gray('  The amount may be below the minimum for this provider'));
          }
        } else {
          console.error(chalk.red('\n  An unexpected error occurred'));
        }

        console.log();
        process.exit(1);
      }
    });

  return command;
}
