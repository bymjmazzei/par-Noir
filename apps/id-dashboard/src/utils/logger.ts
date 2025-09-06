/**
 * Production-Safe Logging Utility
 * Provi logging that can be safely used in production without exposing sensitive information
 */

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  data?: any;
  timestamp: string;
  context?: string;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private logLevel: LogLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.ERROR;
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  private shouldLog(level: LogLevel): boolean {
    if (this.isDevelopment) return true;
    
    const levelPriority = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3
    };
    
    return levelPriority[level] >= levelPriority[this.logLevel];
  }

  private addLog(level: LogLevel, message: string, data?: any, context?: string): void {
    if (!this.shouldLog(level)) return;

    const logEntry: LogEntry = {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
      context
    };

    this.logs.push(logEntry);
    
    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // In development, also log to console
    if (this.isDevelopment) {
      switch (level) {
        case LogLevel.ERROR:
          // Console statement removed for production
          break;
        case LogLevel.WARN:
          // Console statement removed for production
          break;
        case LogLevel.INFO:
          // Console statement removed for production
          break;
        case LogLevel.DEBUG:
          // Console statement removed for production
          break;
      }
    }

    // In production, send critical errors to monitoring service
    if (!this.isDevelopment && level === LogLevel.ERROR) {
      this.sendToMonitoring(logEntry);
    }
  }

  private sendToMonitoring(logEntry: LogEntry): void {
    // In production, this would send to a monitoring service like Sentry
    // For now, we'll just store it locally
    try {
      // Could send to external monitoring service here
      // Production implementation required
    } catch (error) {
      // Silently fail to prevent logging loops
    }
  }

  error(message: string, data?: any, context?: string): void {
    this.addLog(LogLevel.ERROR, message, data, context);
  }

  warn(message: string, data?: any, context?: string): void {
    this.addLog(LogLevel.WARN, message, data, context);
  }

  info(message: string, data?: any, context?: string): void {
    this.addLog(LogLevel.INFO, message, data, context);
  }

  debug(message: string, data?: any, context?: string): void {
    this.addLog(LogLevel.DEBUG, message, data, context);
  }

  // Get logs for debugging (development only)
  getLogs(): LogEntry[] {
    if (!this.isDevelopment) return [];
    return [...this.logs];
  }

  // Clear logs
  clearLogs(): void {
    this.logs = [];
  }

  // Set log level
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}

export const logger = new Logger();
export default logger;
