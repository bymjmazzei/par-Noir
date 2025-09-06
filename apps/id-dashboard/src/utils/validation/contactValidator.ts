// Contact Validator - Handles contact information validation
import { ValidationResult } from '../types/validation';
import { ValidationPatterns } from './validationPatterns';
import { SecurityValidator } from './securityValidator';

export class ContactValidator {
  /**
   * Validate email address
   */
  static validateEmail(email: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!email || typeof email !== 'string') {
      errors.push('Email must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    if (email.length > 254) {
      errors.push('Email length exceeds maximum limit of 254 characters');
    }

    if (!ValidationPatterns.EMAIL_PATTERN.test(email)) {
      errors.push('Invalid email format');
    }

    // Check for suspicious patterns
    if (SecurityValidator.containsXSS(email)) {
      errors.push('Email contains potentially malicious content');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: SecurityValidator.sanitizeString(email)
    };
  }

  /**
   * Validate phone number
   */
  static validatePhone(phone: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!phone || typeof phone !== 'string') {
      errors.push('Phone number must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    if (phone.length > 20) {
      errors.push('Phone number length exceeds maximum limit of 20 characters');
    }

    if (!ValidationPatterns.PHONE_PATTERN.test(phone)) {
      errors.push('Invalid phone number format. Must be in international format: +1234567890');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: SecurityValidator.sanitizeString(phone)
    };
  }
}
