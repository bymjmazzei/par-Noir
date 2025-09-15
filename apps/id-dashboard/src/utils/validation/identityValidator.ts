// Identity Validator - Handles identity-related validation
import { ValidationResult } from '../types/validation';
import { ValidationPatterns } from './validationPatterns';
import { SecurityValidator } from './securityValidator';

export class IdentityValidator {
  /**
   * Validate DID format
   */
  static validateDID(did: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!did || typeof did !== 'string') {
      errors.push('DID must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    if (did.length > 100) {
      errors.push('DID length exceeds maximum limit of 100 characters');
    }

    if (!ValidationPatterns.DID_PATTERN.test(did)) {
      errors.push('Invalid DID format. Must be in format: did:key:<base64-encoded-key>');
    }

    // Check for suspicious patterns
    if (SecurityValidator.containsXSS(did)) {
      errors.push('DID contains potentially malicious content');
    }

    if (SecurityValidator.containsSQLInjection(did)) {
      errors.push('DID contains potentially malicious SQL patterns');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: SecurityValidator.sanitizeString(did)
    };
  }

  /**
   * Validate pN Name
   */
  static validatePNName(pnName: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!pnName || typeof pnName !== 'string') {
      errors.push('pN Name must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    if (pnName.length < 3) {
      errors.push('pN Name must be at least 3 characters long');
    }

    if (pnName.length > 20) {
      errors.push('pN Name must be no more than 20 characters long');
    }

    if (!ValidationPatterns.USERNAME_PATTERN.test(pnName)) {
      errors.push('pN Name can only contain letters, numbers, and hyphens');
    }

    if (ValidationPatterns.RESERVED_USERNAMES.includes(pnName.toLowerCase())) {
      errors.push('pN Name is reserved and cannot be used');
    }

    // Check for suspicious patterns
    if (SecurityValidator.containsXSS(pnName)) {
      errors.push('pN Name contains potentially malicious content');
    }

    if (SecurityValidator.containsSQLInjection(pnName)) {
      errors.push('pN Name contains potentially malicious SQL patterns');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: SecurityValidator.sanitizeString(pnName)
    };
  }

  /**
   * Validate passcode strength
   */
  static validatePasscode(passcode: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!passcode || typeof passcode !== 'string') {
      errors.push('Passcode must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    if (passcode.length < 12) {
      errors.push('Passcode must be at least 12 characters long');
    }

    if (passcode.length > 128) {
      errors.push('Passcode must be no more than 128 characters long');
    }

    if (!/[A-Z]/.test(passcode)) {
      errors.push('Passcode must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(passcode)) {
      errors.push('Passcode must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(passcode)) {
      errors.push('Passcode must contain at least one number');
    }

    if (!/[^A-Za-z0-9]/.test(passcode)) {
      errors.push('Passcode must contain at least one special character');
    }

    // Check for common weak patterns
    if (ValidationPatterns.WEAK_PASSCODE_PATTERNS.some(pattern => passcode.toLowerCase().includes(pattern))) {
      warnings.push('Passcode contains common weak patterns');
    }

    // Check for keyboard patterns
    if (ValidationPatterns.KEYBOARD_PATTERNS.some(pattern => passcode.toLowerCase().includes(pattern))) {
      warnings.push('Passcode contains keyboard patterns');
    }

    // Check for repeated characters
    if (/(.)\1{3,}/.test(passcode)) {
      warnings.push('Passcode contains repeated characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: passcode // Don't sanitize passco
    };
  }
}
