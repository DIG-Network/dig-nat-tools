import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
  level: LogLevel;
  logToFile?: boolean;
  logFilePath?: string;
  maxLogSize?: number; // in bytes
  keepOldLogs?: number; // number of old log files to keep
}

export class Logger {
  private level: LogLevel;
  private logToFile: boolean;
  private logFilePath?: string;
  private maxLogSize: number;
  private keepOldLogs: number;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(config: LogLevel | LoggerConfig = 'info') {
    if (typeof config === 'string') {
      // Backward compatibility
      this.level = config;
      this.logToFile = false;
      this.maxLogSize = 10 * 1024 * 1024; // 10MB
      this.keepOldLogs = 5;
    } else {
      this.level = config.level;
      this.logToFile = config.logToFile || false;
      this.logFilePath = config.logFilePath;
      this.maxLogSize = config.maxLogSize || 10 * 1024 * 1024; // 10MB
      this.keepOldLogs = config.keepOldLogs || 5;
      
      if (this.logToFile && this.logFilePath) {
        this.ensureLogDirectory();
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.level];
  }

  private ensureLogDirectory(): void {
    if (this.logFilePath) {
      const logDir = path.dirname(this.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }

  private rotateLogFile(): void {
    if (!this.logFilePath || !fs.existsSync(this.logFilePath)) {
      return;
    }

    const stats = fs.statSync(this.logFilePath);
    if (stats.size >= this.maxLogSize) {
      // Rotate existing log files
      for (let i = this.keepOldLogs - 1; i >= 1; i--) {
        const oldFile = `${this.logFilePath}.${i}`;
        const newFile = `${this.logFilePath}.${i + 1}`;
        
        if (fs.existsSync(oldFile)) {
          if (i === this.keepOldLogs - 1) {
            fs.unlinkSync(oldFile); // Delete the oldest
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }
      
      // Move current log to .1
      fs.renameSync(this.logFilePath, `${this.logFilePath}.1`);
    }
  }

  private writeToFile(message: string): void {
    if (this.logToFile && this.logFilePath) {
      try {
        this.rotateLogFile();
        // Remove ANSI color codes for file output
        // eslint-disable-next-line no-control-regex
        const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, '');
        fs.appendFileSync(this.logFilePath, cleanMessage + '\n', 'utf8');
      } catch (error) {
        // If file logging fails, fall back to console
        console.error('Failed to write to log file:', error);
      }
    }
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

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (this.shouldLog(level)) {
      const formattedMessage = this.formatMessage(level, message, ...args);
      
      // Always write to file if configured
      if (this.logToFile) {
        this.writeToFile(formattedMessage);
      }
      
      // Also write to console unless we're only logging to file
      if (!this.logToFile || process.env.NODE_ENV !== 'production') {
        switch (level) {
          case 'debug':
          case 'info':
            console.log(formattedMessage);
            break;
          case 'warn':
            console.warn(formattedMessage);
            break;
          case 'error':
            console.error(formattedMessage);
            break;
        }
      }
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLogFilePath(): string | undefined {
    return this.logFilePath;
  }
}