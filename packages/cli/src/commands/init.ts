import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { Connection } from '@solana/web3.js';
import {
  saveConfig,
  loadConfig,
  getRpcUrl,
  getConfigPath,
  validateConfig,
  type CLIConfig,
} from '../utils/config.js';
import {
  loadWallet,
  defaultKeypairExists,
  getDefaultKeypairPath,
  getWalletInfo,
} from '../utils/wallet.js';

/**
 * Initialize PrivacyKit configuration in the current project
 */
export function createInitCommand(): Command {
  const command = new Command('init')
    .description('Initialize PrivacyKit configuration in your project')
    .option('-n, --network <network>', 'Solana network (mainnet-beta, devnet, testnet, localnet)', 'devnet')
    .option('-r, --rpc <url>', 'Custom RPC endpoint URL')
    .option('-k, --keypair <path>', 'Path to wallet keypair file')
    .option('-g, --global', 'Save configuration globally (~/.privacykitrc)')
    .option('-f, --force', 'Overwrite existing configuration')
    .option('--skip-validation', 'Skip validation checks')
    .action(async (options) => {
      const spinner = ora();

      try {
        console.log(chalk.bold('\n  PrivacyKit Initialization\n'));

        // Check if config already exists
        const configPath = getConfigPath(options.global);
        if (fs.existsSync(configPath) && !options.force) {
          console.log(chalk.yellow(`  Configuration already exists at ${configPath}`));
          console.log(chalk.gray(`  Use --force to overwrite\n`));
          process.exit(1);
        }

        // Build configuration
        const config: Partial<CLIConfig> = {
          network: options.network as CLIConfig['network'],
        };

        if (options.rpc) {
          config.rpcUrl = options.rpc;
        }

        // Determine keypair path
        let keypairPath = options.keypair;
        if (!keypairPath) {
          if (defaultKeypairExists()) {
            keypairPath = getDefaultKeypairPath();
            console.log(chalk.gray(`  Using default Solana keypair: ${keypairPath}`));
          } else {
            console.log(chalk.yellow('  No keypair specified and default Solana keypair not found'));
            console.log(chalk.gray(`  You can specify one with: privacykit init --keypair <path>\n`));
          }
        }

        if (keypairPath) {
          config.keypairPath = keypairPath;
        }

        // Set defaults
        config.defaultPrivacy = 'amount-hidden';
        config.enabledProviders = ['shadowwire', 'arcium', 'noir', 'privacycash'];
        config.debug = false;

        // Validate configuration
        if (!options.skipValidation) {
          spinner.start('Validating configuration...');

          const fullConfig = { ...loadConfig(), ...config } as CLIConfig;
          const validation = validateConfig(fullConfig);

          if (!validation.valid) {
            spinner.fail('Configuration validation failed');
            for (const error of validation.errors) {
              console.log(chalk.red(`  - ${error}`));
            }
            console.log();
            process.exit(1);
          }

          spinner.succeed('Configuration validated');

          // Test RPC connection
          spinner.start('Testing RPC connection...');
          const rpcUrl = getRpcUrl(fullConfig.network, fullConfig.rpcUrl);

          try {
            const connection = new Connection(rpcUrl, 'confirmed');
            const version = await connection.getVersion();
            spinner.succeed(`Connected to ${fullConfig.network} (Solana ${version['solana-core']})`);
          } catch (error) {
            spinner.warn(`Could not connect to RPC: ${rpcUrl}`);
            console.log(chalk.gray('  The RPC might be unreachable or rate-limited'));
          }

          // Test wallet loading
          if (fullConfig.keypairPath) {
            spinner.start('Loading wallet...');
            try {
              const wallet = loadWallet(fullConfig.keypairPath);
              const info = getWalletInfo(wallet);
              spinner.succeed(`Wallet loaded: ${info.address}`);
            } catch (error) {
              spinner.fail(`Failed to load wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
              console.log(chalk.gray('  Make sure the keypair file exists and is valid\n'));
              process.exit(1);
            }
          }
        }

        // Save configuration
        spinner.start('Saving configuration...');
        saveConfig(config, options.global);
        spinner.succeed(`Configuration saved to ${configPath}`);

        // Print summary
        console.log(chalk.bold('\n  Configuration Summary:\n'));
        console.log(chalk.gray('  Network:      ') + chalk.cyan(config.network));
        console.log(chalk.gray('  RPC URL:      ') + chalk.cyan(config.rpcUrl || getRpcUrl(config.network as CLIConfig['network'])));
        if (config.keypairPath) {
          console.log(chalk.gray('  Keypair:      ') + chalk.cyan(config.keypairPath));
        }
        console.log(chalk.gray('  Privacy:      ') + chalk.cyan(config.defaultPrivacy));
        console.log(chalk.gray('  Providers:    ') + chalk.cyan(config.enabledProviders?.join(', ')));
        console.log();

        console.log(chalk.green('  PrivacyKit initialized successfully!'));
        console.log();
        console.log(chalk.gray('  Next steps:'));
        console.log(chalk.gray('  - Check your balance:    ') + chalk.white('privacykit balance --token SOL'));
        console.log(chalk.gray('  - Make a transfer:       ') + chalk.white('privacykit transfer --amount 1 --token SOL --to <address>'));
        console.log(chalk.gray('  - Estimate costs:        ') + chalk.white('privacykit estimate --amount 1 --token SOL'));
        console.log();
      } catch (error) {
        spinner.fail('Initialization failed');
        console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`));
        process.exit(1);
      }
    });

  return command;
}
