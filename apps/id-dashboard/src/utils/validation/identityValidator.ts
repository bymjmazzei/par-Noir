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
   * Validate Key 1 (internal: pnName) — same strength rules as Key 2.
   */
  static validatePNName(pnName: string): ValidationResult {
    const errors = keyStrengthErrors(pnName, KEY_1_LABEL);
    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      sanitizedValue: pnName
    };
  }

  /**
   * Validate Key 2 (internal: passcode) strength
   */
  static validatePasscode(passcode: string): ValidationResult {
    const errors = keyStrengthErrors(passcode, KEY_2_LABEL);
    const warnings: string[] = [];

    if (
      passcode &&
      ValidationPatterns.WEAK_PASSCODE_PATTERNS.some((pattern) =>
        passcode.toLowerCase().includes(pattern)
      )
    ) {
      warnings.push('Key 2 contains common weak patterns');
    }

    if (
      passcode &&
      ValidationPatterns.KEYBOARD_PATTERNS.some((pattern) =>
        passcode.toLowerCase().includes(pattern)
      )
    ) {
      warnings.push('Key 2 contains keyboard patterns');
    }

    if (passcode && /(.)\1{3,}/.test(passcode)) {
      warnings.push('Key 2 contains repeated characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: passcode
    };
  }
}
