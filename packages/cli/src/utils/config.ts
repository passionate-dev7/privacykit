import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Configuration file locations
 */
const CONFIG_FILENAME = '.privacykitrc';
const LOCAL_CONFIG_PATH = path.join(process.cwd(), CONFIG_FILENAME);
const GLOBAL_CONFIG_PATH = path.join(os.homedir(), CONFIG_FILENAME);

/**
 * CLI Configuration interface
 */
export interface CLIConfig {
  /** Solana network cluster */
  network: 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet';
  /** RPC endpoint URL */
  rpcUrl?: string;
  /** Path to wallet keypair file */
  keypairPath?: string;
  /** Default privacy level */
  defaultPrivacy?: string;
  /** Enabled providers */
  enabledProviders?: string[];
  /** Debug mode */
  debug?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CLIConfig = {
  network: 'devnet',
  rpcUrl: undefined,
  keypairPath: path.join(os.homedir(), '.config', 'solana', 'id.json'),
  defaultPrivacy: 'amount-hidden',
  enabledProviders: ['shadowwire', 'arcium', 'noir', 'privacycash'],
  debug: false,
};

/**
 * Load configuration from file
 * Priority: local .privacykitrc > global ~/.privacykitrc > defaults
 */
export function loadConfig(): CLIConfig {
  let config: CLIConfig = { ...DEFAULT_CONFIG };

  // Try to load global config first
  if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
    try {
      const globalConfig = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
      config = { ...config, ...globalConfig };
    } catch (error) {
      // Ignore invalid global config
    }
  }

  // Try to load local config (overrides global)
  if (fs.existsSync(LOCAL_CONFIG_PATH)) {
    try {
      const localConfig = JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf-8'));
      config = { ...config, ...localConfig };
    } catch (error) {
      // Ignore invalid local config
    }
  }

  // Override with environment variables
  if (process.env.PRIVACYKIT_NETWORK) {
    config.network = process.env.PRIVACYKIT_NETWORK as CLIConfig['network'];
  }
  if (process.env.PRIVACYKIT_RPC_URL) {
    config.rpcUrl = process.env.PRIVACYKIT_RPC_URL;
  }
  if (process.env.PRIVACYKIT_KEYPAIR) {
    config.keypairPath = process.env.PRIVACYKIT_KEYPAIR;
  }
  if (process.env.PRIVACYKIT_DEBUG === 'true') {
    config.debug = true;
  }

  return config;
}

/**
 * Save configuration to file
 */
export function saveConfig(config: Partial<CLIConfig>, global: boolean = false): void {
  const configPath = global ? GLOBAL_CONFIG_PATH : LOCAL_CONFIG_PATH;

  // Load existing config
  let existingConfig: CLIConfig = { ...DEFAULT_CONFIG };
  if (fs.existsSync(configPath)) {
    try {
      existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // Start fresh
    }
  }

  // Merge configs
  const newConfig = { ...existingConfig, ...config };

  // Write config file
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n');
}

/**
 * Get the RPC URL for a network
 */
export function getRpcUrl(network: CLIConfig['network'], customUrl?: string): string {
  if (customUrl) {
    return customUrl;
  }

  switch (network) {
    case 'mainnet-beta':
      return 'https://api.mainnet-beta.solana.com';
    case 'devnet':
      return 'https://api.devnet.solana.com';
    case 'testnet':
      return 'https://api.testnet.solana.com';
    case 'localnet':
      return 'http://localhost:8899';
    default:
      return 'https://api.devnet.solana.com';
  }
}

/**
 * Check if config file exists
 */
export function configExists(): boolean {
  return fs.existsSync(LOCAL_CONFIG_PATH) || fs.existsSync(GLOBAL_CONFIG_PATH);
}

/**
 * Get config file path
 */
export function getConfigPath(global: boolean = false): string {
  return global ? GLOBAL_CONFIG_PATH : LOCAL_CONFIG_PATH;
}

/**
 * Delete config file
 */
export function deleteConfig(global: boolean = false): boolean {
  const configPath = global ? GLOBAL_CONFIG_PATH : LOCAL_CONFIG_PATH;
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
    return true;
  }
  return false;
}

/**
 * Validate configuration
 */
export function validateConfig(config: CLIConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate network
  const validNetworks = ['mainnet-beta', 'devnet', 'testnet', 'localnet'];
  if (!validNetworks.includes(config.network)) {
    errors.push(`Invalid network: ${config.network}. Must be one of: ${validNetworks.join(', ')}`);
  }

  // Validate RPC URL if provided
  if (config.rpcUrl) {
    try {
      new URL(config.rpcUrl);
    } catch {
      errors.push(`Invalid RPC URL: ${config.rpcUrl}`);
    }
  }

  // Validate keypair path if provided
  if (config.keypairPath && !fs.existsSync(config.keypairPath)) {
    errors.push(`Keypair file not found: ${config.keypairPath}`);
  }

  // Validate privacy level
  const validPrivacyLevels = ['amount-hidden', 'sender-hidden', 'full-encrypted', 'zk-proven', 'compliant-pool', 'none'];
  if (config.defaultPrivacy && !validPrivacyLevels.includes(config.defaultPrivacy)) {
    errors.push(`Invalid privacy level: ${config.defaultPrivacy}. Must be one of: ${validPrivacyLevels.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
