/**
 * Identity Protocol Types
 * Common types used across the dashboard application
 */

export enum IdentityErrorCodes {
  STORAGE_ERROR = 'STORAGE_ERROR',
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_INPUT = 'INVALID_INPUT',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export class IdentityError extends Error {
  public code: string;
  public details?: any;

  constructor(
    message: string,
    code: string = IdentityErrorCodes.UNKNOWN_ERROR,
    details?: any
  ) {
    super(message);
    this.name = 'IdentityError';
    this.code = code;
    this.details = details;
  }
}

export interface IdentityResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface IdentityConfig {
  apiUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  debug?: boolean;
}
