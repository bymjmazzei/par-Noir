// DID Resolver Types and Interfaces
import { DIDDocument } from '../../types';

export interface DIDResolutionResult {
  didDocument: DIDDocument;
  metadata: {
    created: string;
    updated: string;
    deactivated?: boolean;
  };
}

export interface DIDValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface AuditLogEntry {
  timestamp: string;
  event: string;
  details: any;
  userAgent: string;
}
