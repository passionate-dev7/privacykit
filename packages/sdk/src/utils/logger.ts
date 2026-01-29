/**
 * Log levels for the SDK
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  timestamps?: boolean;
}

/**
 * Simple logger for the SDK
 */
export class Logger {
  private level: LogLevel;
  private prefix: string;
  private timestamps: boolean;

  constructor(config: LoggerConfig = { level: LogLevel.INFO }) {
    this.level = config.level;
    this.prefix = config.prefix || '[PrivacyKit]';
    this.timestamps = config.timestamps ?? true;
  }

  private formatMessage(level: string, message: string, ...args: unknown[]): string {
    const timestamp = this.timestamps ? `[${new Date().toISOString()}]` : '';
    const formattedArgs = args.length > 0 ? ' ' + JSON.stringify(args) : '';
    return `${timestamp} ${this.prefix} ${level}: ${message}${formattedArgs}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(this.formatMessage('DEBUG', message, ...args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info(this.formatMessage('INFO', message, ...args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message, ...args));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(this.formatMessage('ERROR', message, ...args));
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Create a child logger with a different prefix
   */
  child(prefix: string): Logger {
    return new Logger({
      level: this.level,
      prefix: `${this.prefix}[${prefix}]`,
      timestamps: this.timestamps,
    });
  }
}

/**
 * Default logger instance
 */
export const defaultLogger = new Logger({ level: LogLevel.INFO });

/**
 * Create a debug-enabled logger
 */
export function createDebugLogger(prefix?: string): Logger {
  return new Logger({
    level: LogLevel.DEBUG,
    prefix: prefix || '[PrivacyKit]',
    timestamps: true,
  });
}
