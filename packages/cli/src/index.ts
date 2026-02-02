import { Command } from 'commander';
import chalk from 'chalk';
import { createInitCommand } from './commands/init.js';
import { createTransferCommand } from './commands/transfer.js';
import { createBalanceCommand } from './commands/balance.js';
import { createEstimateCommand } from './commands/estimate.js';
import { createSimulateCommand } from './commands/simulate.js';

const VERSION = '0.1.0';

/**
 * PrivacyKit CLI
 *
 * A command-line interface for private transfers on Solana using
 * multiple privacy providers (ShadowWire, Arcium, Noir, Privacy Cash).
 */
const program = new Command();

program
  .name('privacykit')
  .description('PrivacyKit CLI - Private transfers on Solana')
  .version(VERSION, '-v, --version', 'Output the current version')
  .option('-d, --debug', 'Enable debug output')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().debug) {
      process.env.PRIVACYKIT_DEBUG = 'true';
    }
  });

// Register commands
program.addCommand(createInitCommand());
program.addCommand(createTransferCommand());
program.addCommand(createBalanceCommand());
program.addCommand(createEstimateCommand());
program.addCommand(createSimulateCommand());

// Add help text
program.addHelpText('before', `
${chalk.bold.cyan('PrivacyKit')} - Unified Privacy SDK for Solana

`);

program.addHelpText('after', `

${chalk.bold('Examples:')}

  ${chalk.gray('# Initialize PrivacyKit in your project')}
  $ privacykit init

  ${chalk.gray('# Check your balances')}
  $ privacykit balance --token SOL

  ${chalk.gray('# Make a private transfer')}
  $ privacykit transfer --amount 1 --token SOL --to <address> --privacy amount-hidden

  ${chalk.gray('# Estimate transfer costs')}
  $ privacykit estimate --amount 1 --token SOL --privacy full-encrypted

  ${chalk.gray('# Simulate a transfer and see provider selection')}
  $ privacykit simulate --amount 1 --token SOL --privacy amount-hidden

${chalk.bold('Privacy Levels:')}

  ${chalk.cyan('amount-hidden')}    - Amount is hidden using ZK proofs (ShadowWire)
  ${chalk.cyan('sender-hidden')}    - Sender identity is anonymous
  ${chalk.cyan('full-encrypted')}   - Full encryption of transaction data (Arcium)
  ${chalk.cyan('zk-proven')}        - Custom zero-knowledge proofs (Noir)
  ${chalk.cyan('compliant-pool')}   - Compliant privacy with proof of innocence (Privacy Cash)

${chalk.bold('Configuration:')}

  PrivacyKit reads configuration from:
  - ${chalk.gray('.privacykitrc')} in current directory (local)
  - ${chalk.gray('~/.privacykitrc')} in home directory (global)
  - Environment variables: ${chalk.gray('PRIVACYKIT_NETWORK')}, ${chalk.gray('PRIVACYKIT_RPC_URL')}, ${chalk.gray('PRIVACYKIT_KEYPAIR')}

${chalk.bold('Documentation:')}

  ${chalk.gray('https://github.com/privacykit/privacykit')}

`);

// Error handling for unknown commands
program.on('command:*', (operands) => {
  console.error(chalk.red(`\n  Error: Unknown command '${operands[0]}'`));
  console.error(chalk.gray(`  Run 'privacykit --help' for a list of available commands\n`));
  process.exit(1);
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (process.argv.length === 2) {
  program.outputHelp();
}
