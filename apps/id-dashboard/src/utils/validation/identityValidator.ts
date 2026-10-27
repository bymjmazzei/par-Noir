// Identity Validator - Handles identity-related validation
import { ValidationResult } from '../../types/validation';
import { ValidationPatterns } from './validationPatterns';
import { SecurityValidator } from './securityValidator';
import {
  KEY_1_LABEL,
  KEY_2_LABEL,
  keyStrengthErrors,
} from '../../constants/credentialLabels';

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
   * Validate Key 1 (internal: Key 1) — same strength rules as Key 2.
   */
  static validateKey1(key1: string): ValidationResult {
    const errors = keyStrengthErrors(key1, KEY_1_LABEL);
    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      sanitizedValue: key1
    };
  }

  /**
   * Validate Key 2 (internal: Key 2) strength
   */
  static validateKey2(key2: string): ValidationResult {
    const errors = keyStrengthErrors(key2, KEY_2_LABEL);
    const warnings: string[] = [];

    if (
      key2 &&
      ValidationPatterns.WEAK_KEY2_PATTERNS.some((pattern) =>
        key2.toLowerCase().includes(pattern)
      )
    ) {
      warnings.push('Key 2 contains common weak patterns');
    }

    if (
      key2 &&
      ValidationPatterns.KEYBOARD_PATTERNS.some((pattern) =>
        key2.toLowerCase().includes(pattern)
      )
    ) {
      warnings.push('Key 2 contains keyboard patterns');
    }

    if (key2 && /(.)\1{3,}/.test(key2)) {
      warnings.push('Key 2 contains repeated characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: key2
    };
  }
}
