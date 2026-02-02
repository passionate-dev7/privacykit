import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import {
  PrivacyProvider,
  getAllAdapters,
  SUPPORTED_TOKENS,
  type WalletAdapter,
} from '@privacykit/sdk';
import { loadConfig, getRpcUrl } from '../utils/config.js';
import { loadWallet, truncateAddress } from '../utils/wallet.js';

/**
 * Token mint addresses for common tokens
 */
const TOKEN_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  RADR: '5FGULyTir641wnz7gr2p2kiYYpWboVYE83Ps3e8Lxcxq',
  ORE: 'oreoN2tQbHXVaZsr3pf66A48miqcBXCDJozganhEJgz',
};

/**
 * Token decimals
 */
const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
  BONK: 5,
  RADR: 9,
  ORE: 11,
};

/**
 * Check shielded and public balances
 */
export function createBalanceCommand(): Command {
  const command = new Command('balance')
    .description('Check your shielded and public balances')
    .option('-t, --token <symbol>', 'Token symbol (e.g., SOL, USDC)', 'SOL')
    .option('-k, --keypair <path>', 'Path to wallet keypair file')
    .option('-n, --network <network>', 'Solana network')
    .option('-r, --rpc <url>', 'Custom RPC endpoint URL')
    .option('--all', 'Show balances for all supported tokens')
    .option('--public-only', 'Only show public balances')
    .option('--shielded-only', 'Only show shielded balances')
    .action(async (options) => {
      const spinner = ora();

      try {
        // Load configuration
        const config = loadConfig();
        const network = options.network || config.network;
        const rpcUrl = getRpcUrl(network, options.rpc || config.rpcUrl);
        const keypairPath = options.keypair || config.keypairPath;

        // Load wallet
        spinner.start('Loading wallet...');
        if (!keypairPath) {
          spinner.fail('No keypair path configured');
          console.error(chalk.gray('  Run `privacykit init` or specify --keypair\n'));
          process.exit(1);
        }

        const wallet = loadWallet(keypairPath);
        spinner.succeed(`Wallet: ${wallet.publicKey.toBase58()}`);

        // Connect to network
        spinner.start(`Connecting to ${network}...`);
        const connection = new Connection(rpcUrl, 'confirmed');
        await connection.getVersion();
        spinner.succeed(`Connected to ${network}`);

        // Determine which tokens to check
        const tokensToCheck = options.all
          ? Object.keys(TOKEN_MINTS)
          : [options.token.toUpperCase()];

        // Initialize adapters for shielded balance queries
        let adapters: ReturnType<typeof getAllAdapters> = [];
        if (!options.publicOnly) {
          spinner.start('Initializing privacy providers...');
          adapters = getAllAdapters();

          const initializedAdapters: typeof adapters = [];
          for (const adapter of adapters) {
            try {
              await adapter.initialize(connection, wallet as unknown as WalletAdapter);
              initializedAdapters.push(adapter);
            } catch {
              // Skip adapters that fail to initialize
            }
          }
          adapters = initializedAdapters;
          spinner.succeed(`${adapters.length} privacy providers available`);
        }

        console.log(chalk.bold('\n  Balance Summary\n'));
        console.log(chalk.gray(`  Wallet: ${wallet.publicKey.toBase58()}`));
        console.log(chalk.gray(`  Network: ${network}\n`));

        // Check balances for each token
        for (const token of tokensToCheck) {
          console.log(chalk.bold.cyan(`  ${token}`));
          console.log(chalk.gray('  ' + '-'.repeat(50)));

          // Get public balance
          if (!options.shieldedOnly) {
            spinner.start(`Fetching public ${token} balance...`);
            try {
              let publicBalance = 0;

              if (token === 'SOL') {
                // Native SOL balance
                const lamports = await connection.getBalance(wallet.publicKey);
                publicBalance = lamports / LAMPORTS_PER_SOL;
              } else {
                // SPL token balance
                const mintAddress = TOKEN_MINTS[token];
                if (mintAddress) {
                  try {
                    const tokenAccount = await getAssociatedTokenAddress(
                      new PublicKey(mintAddress),
                      wallet.publicKey
                    );
                    const accountInfo = await getAccount(connection, tokenAccount);
                    const decimals = TOKEN_DECIMALS[token] || 9;
                    publicBalance = Number(accountInfo.amount) / Math.pow(10, decimals);
                  } catch {
                    // Token account doesn't exist
                    publicBalance = 0;
                  }
                }
              }

              spinner.stop();
              const decimals = TOKEN_DECIMALS[token] || 9;
              console.log(chalk.gray('  Public:     ') + chalk.white(`${publicBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals })} ${token}`));
            } catch (error) {
              spinner.stop();
              console.log(chalk.gray('  Public:     ') + chalk.red('Error fetching balance'));
            }
          }

          // Get shielded balances from each provider
          if (!options.publicOnly && adapters.length > 0) {
            for (const adapter of adapters) {
              if (!adapter.supportedTokens.includes(token) && !adapter.supportedTokens.includes('*')) {
                continue;
              }

              try {
                const balance = await adapter.getBalance(token);
                const decimals = TOKEN_DECIMALS[token] || 9;
                const providerName = adapter.name.padEnd(12);
                console.log(
                  chalk.gray(`  ${providerName}`) +
                  chalk.green(`${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals })} ${token}`) +
                  chalk.gray(' (shielded)')
                );
              } catch {
                // Skip if provider doesn't support this token or balance fetch fails
              }
            }
          }

          console.log();
        }

        // Show provider status
        if (!options.publicOnly && adapters.length > 0) {
          console.log(chalk.bold('  Provider Status\n'));
          for (const adapter of adapters) {
            const status = adapter.isReady() ? chalk.green('Ready') : chalk.red('Unavailable');
            console.log(chalk.gray(`  ${adapter.name.padEnd(15)}`) + status);
          }
          console.log();
        }
      } catch (error) {
        spinner.fail('Failed to fetch balances');

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
