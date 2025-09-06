import { cryptoWorkerManager } from './cryptoWorkerManager';
// Main InputValidator Class - Maintains backward compatibility while using modular components
import { ValidationResult } from '../types/validation';
import { IdentityValidator } from './identityValidator';
import { ContactValidator } from './contactValidator';
import { CryptoValidator } from './cryptoValidator';
import { DisplayValidator } from './displayValidator';
import { DataValidator } from './dataValidator';

/**
 * Comprehensive Input Validation Framework
 * Provi military-grade input validation for the Identity Protocol
 */
export class InputValidator {
  /**
   * Validate DID format
   */
  static validateDID(did: string): ValidationResult {
    return IdentityValidator.validateDID(did);
  }

  /**
   * Validate pN Name
   */
  static validatePNName(pnName: string): ValidationResult {
    return IdentityValidator.validatePNName(pnName);
  }

  /**
   * Validate passcode strength
   */
  static validatePasscode(passcode: string): ValidationResult {
    return IdentityValidator.validatePasscode(passcode);
  }

  /**
   * Validate email address
   */
  static validateEmail(email: string): ValidationResult {
    return ContactValidator.validateEmail(email);
  }

  /**
   * Validate phone number
   */
  static validatePhone(phone: string): ValidationResult {
    return ContactValidator.validatePhone(phone);
  }

  /**
   * Validate public key
   */
  static validatePublicKey(publicKey: string): ValidationResult {
    return CryptoValidator.validatePublicKey(publicKey);
  }

  /**
   * Validate signature
   */
  static validateSignature(signature: string): ValidationResult {
    return CryptoValidator.validateSignature(signature);
  }

  /**
   * Validate challenge
   */
  static validateChallenge(challenge: string): ValidationResult {
    return CryptoValidator.validateChallenge(challenge);
  }

  /**
   * Validate display name
   */
  static validateDisplayName(displayName: string): ValidationResult {
    return DisplayValidator.validateDisplayName(displayName);
  }

  /**
   * Validate nickname
   */
  static validateNickname(nickname: string): ValidationResult {
    return DisplayValidator.validateNickname(nickname);
  }

  /**
   * Validate file upload
   */
  static validateFileUpload(file: File): ValidationResult {
    return DataValidator.validateFileUpload(file);
  }

  /**
   * Validate JSON data
   */
  static validateJSON(data: any): ValidationResult {
    return DataValidator.validateJSON(data);
  }

  /**
   * Comprehensive validation for identity creation
   */
  static validateIdentityCreation(data: {
    pnName: string;
    nickname: string;
    passcode: string;
    email?: string;
    phone?: string;
  }): ValidationResult {
    return DataValidator.validateIdentityCreation(data);
  }
}
