import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private level: LogLevel;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.level];
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const levelText = level.toUpperCase().padEnd(5);
    
    let coloredLevel: string;
    switch (level) {
      case 'debug':
        coloredLevel = chalk.gray(levelText);
        break;
      case 'info':
        coloredLevel = chalk.blue(levelText);
        break;
      case 'warn':
        coloredLevel = chalk.yellow(levelText);
        break;
      case 'error':
        coloredLevel = chalk.red(levelText);
        break;
    }

    const formattedMessage = args.length > 0 ? 
      `${message} ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')}` : 
      message;

    return `${chalk.gray(timestamp)} ${coloredLevel} ${formattedMessage}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, ...args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, ...args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, ...args));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, ...args));
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}