// Display Validator - Handles display-related validation
import { ValidationResult } from '../types/validation';
import { SecurityValidator } from './securityValidator';

export class DisplayValidator {
  /**
   * Validate display name
   */
  static validateDisplayName(displayName: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!displayName || typeof displayName !== 'string') {
      errors.push('Display name must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    if (displayName.length < 1) {
      errors.push('Display name must be at least 1 character long');
    }

    if (displayName.length > 50) {
      errors.push('Display name must be no more than 50 characters long');
    }

    // Check for suspicious patterns
    if (SecurityValidator.containsXSS(displayName)) {
      errors.push('Display name contains potentially malicious content');
    }

    if (SecurityValidator.containsSQLInjection(displayName)) {
      errors.push('Display name contains potentially malicious SQL patterns');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: SecurityValidator.sanitizeString(displayName)
    };
  }

  /**
   * Validate nickname
   */
  static validateNickname(nickname: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!nickname || typeof nickname !== 'string') {
      errors.push('Nickname must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    if (nickname.length < 1) {
      errors.push('Nickname must be at least 1 character long');
    }

    if (nickname.length > 30) {
      errors.push('Nickname must be no more than 30 characters long');
    }

    // Check for suspicious patterns
    if (SecurityValidator.containsXSS(nickname)) {
      errors.push('Nickname contains potentially malicious content');
    }

    if (SecurityValidator.containsSQLInjection(nickname)) {
      errors.push('Nickname contains potentially malicious SQL patterns');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: SecurityValidator.sanitizeString(nickname)
    };
  }
}
