/**
 * Centralized logging utility for the API server
 */

import winston from 'winston';

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'identity-protocol-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Add security-specific logging methods
export const securityLogger = {
  info: (message: string, meta?: any) => {
    logger.info(message, { ...meta, category: 'security' });
  },
  
  warn: (message: string, meta?: any) => {
    logger.warn(message, { ...meta, category: 'security' });
  },
  
  error: (message: string, meta?: any) => {
    logger.error(message, { ...meta, category: 'security' });
  },
  
  // Log security events with structured data
  securityEvent: (event: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    ip?: string;
    userAgent?: string;
    userId?: string;
    details?: any;
  }) => {
    logger.log(event.severity === 'critical' ? 'error' : event.severity, 
      `SECURITY EVENT: ${event.message}`, {
        ...event,
        category: 'security',
        timestamp: new Date().toISOString()
      });
  }
};

export default logger;
