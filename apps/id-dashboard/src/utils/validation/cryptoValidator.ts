import { cryptoWorkerManager } from './cryptoWorkerManager';
// Crypto Validator - Handles cryptographic data validation
import { ValidationResult } from '../types/validation';
import { ValidationPatterns } from './validationPatterns';

export class CryptoValidator {
  /**
   * Validate public key
   */
  static validatePublicKey(publicKey: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!publicKey || typeof publicKey !== 'string') {
      errors.push('Public key must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    if (publicKey.length < 100) {
      errors.push('Public key appears to be too short');
    }

    if (publicKey.length > 1000) {
      errors.push('Public key appears to be too long');
    }

    if (!ValidationPatterns.PUBLIC_KEY_PATTERN.test(publicKey)) {
      errors.push('Invalid public key format');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: publicKey // Don't sanitize cryptographic data
    };
  }

  /**
   * Validate signature
   */
  static validateSignature(signature: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!signature || typeof signature !== 'string') {
      errors.push('Signature must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    if (signature.length < 50) {
      errors.push('Signature appears to be too short');
    }

    if (signature.length > 500) {
      errors.push('Signature appears to be too long');
    }

    if (!ValidationPatterns.SIGNATURE_PATTERN.test(signature)) {
      errors.push('Invalid signature format');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: signature // Don't sanitize cryptographic data
    };
  }

  /**
   * Validate challenge
   */
  static validateChallenge(challenge: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!challenge || typeof challenge !== 'string') {
      errors.push('Challenge must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    if (challenge.length < 20) {
      errors.push('Challenge appears to be too short');
    }

    if (challenge.length > 200) {
      errors.push('Challenge appears to be too long');
    }

    if (!ValidationPatterns.CHALLENGE_PATTERN.test(challenge)) {
      errors.push('Invalid challenge format');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: challenge // Don't sanitize cryptographic data
    };
  }
}
