/**
 * Centralized logging utility for the API server
 */

import winston from 'winston';
import crypto from 'crypto';

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'par-noir-api' },
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

const SENSITIVE_KEY_PATTERN =
  /(authorization|access[_-]?token|refresh[_-]?token|token|secret|api[_-]?key|client[_-]?secret|cookie|passcode|pnname|email)/i;

/** Keys whose string values are hashed (routing metadata minimization). */
const PN_IDENTIFIER_KEY_PATTERN =
  /pnidentifier|pn_identifier|participantpn|targetpn|actorpn|otheruserpn|frompn|topn|userpn|memberpn|ownerpn|creatorpn/i;

function looksLikePnIdentifier(value: string): boolean {
  return /^pn-[a-f0-9]{8,}$/i.test(value) || value.startsWith('did:key:');
}

function hashPnFieldValue(key: string, value: string): string {
  const normalizedKey = key.replace(/_/g, '').toLowerCase();
  if (PN_IDENTIFIER_KEY_PATTERN.test(normalizedKey) || looksLikePnIdentifier(value)) {
    return hashIdentifier(value) ?? '[REDACTED]';
  }
  return value;
}

function redactString(value: string): string {
  if (!value) return value;
  if (value.length <= 8) return '[REDACTED]';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function hashIdentifier(value?: string): string | undefined {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function sanitizeForLogs(input: unknown, depth: number = 0): unknown {
  if (input == null) return input;
  if (depth > 4) return '[TRUNCATED]';
  if (typeof input === 'string') {
    if (input.length > 4096) return `${input.slice(0, 256)}...[TRUNCATED]`;
    if (looksLikePnIdentifier(input)) return hashIdentifier(input) ?? '[REDACTED]';
    return input;
  }
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.slice(0, 50).map((v) => sanitizeForLogs(v, depth + 1));

  const obj = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    if (typeof value === 'string') {
      out[key] = hashPnFieldValue(key, value);
      if (out[key] !== value) continue;
    }
    if (typeof value === 'string' && /(bearer\s+|^pn_[a-f0-9]{64}$|^eyJ)/i.test(value)) {
      out[key] = redactString(value);
      continue;
    }
    if (value instanceof Error) {
      out[key] = {
        name: value.name,
        message: value.message,
      };
      continue;
    }
    out[key] = sanitizeForLogs(value, depth + 1);
  }
  return out;
}

/** Verbose console.log paths (MetadataIndex tracing, cache hits, messaging sheet traces, etc.). */
export function isDevVerbose(): boolean {
  return process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV !== 'production';
}

/** Messaging sheet/folder debug traces (see messagingLog.debug). */
export function isMessagingDebugLogs(): boolean {
  return process.env.MESSAGING_DEBUG_LOGS === '1' || process.env.MESSAGING_DEBUG_LOGS === 'true';
}

export const safeLogger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    logger.info(message, sanitizeForLogs(meta));
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    logger.warn(message, sanitizeForLogs(meta));
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    logger.error(message, sanitizeForLogs(meta));
  },
};

// Add security-specific logging methods
export const securityLogger = {
  info: (message: string, meta?: any) => {
    safeLogger.info(message, { ...(meta || {}), category: 'security' });
  },
  
  warn: (message: string, meta?: any) => {
    safeLogger.warn(message, { ...(meta || {}), category: 'security' });
  },
  
  error: (message: string, meta?: any) => {
    safeLogger.error(message, { ...(meta || {}), category: 'security' });
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
      `SECURITY EVENT: ${event.message}`, sanitizeForLogs({
        ...event as Record<string, unknown>,
        category: 'security',
        timestamp: new Date().toISOString()
      }));
  }
};

export default logger;
