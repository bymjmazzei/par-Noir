// Data Validator - Handles data validation (file uploads, JSON data, identity creation)
import { ValidationResult } from '../types/validation';
import { ValidationPatterns } from './validationPatterns';
import { SecurityValidator } from './securityValidator';
import { IdentityValidator } from './identityValidator';
import { ContactValidator } from './contactValidator';
import { DisplayValidator } from './displayValidator';

export class DataValidator {
  /**
   * Validate file upload
   */
  static validateFileUpload(file: File): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!file) {
      errors.push('File is required');
      return { isValid: false, errors, warnings };
    }

    // Check file size
    if (file.size > ValidationPatterns.MAX_FILE_SIZE) {
      errors.push('File size exceeds maximum limit of 10MB');
    }

    // Check file type
    const allowedTypes = ValidationPatterns.ALLOWED_FILE_TYPES;
    const allowedExtensions = ValidationPatterns.ALLOWED_FILE_EXTENSIONS;
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      errors.push('Invalid file type. Only Par-Noir identity files (.pn, .id, .json, .identity) are allowed');
    }

    // Check filename
    if (file.name.length > 255) {
      errors.push('Filename is too long');
    }

    if (SecurityValidator.containsPathTraversal(file.name)) {
      errors.push('Filename contains potentially malicious patterns');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate JSON data
   */
  static validateJSON(data: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data) {
      errors.push('Data is required');
      return { isValid: false, errors, warnings };
    }

    // Check if it's a valid object
    if (typeof data !== 'object' || Array.isArray(data)) {
      errors.push('Data must be a valid object');
    }

    // Check for circular references
    try {
      JSON.stringify(data);
    } catch (error) {
      errors.push('Data contains circular references');
    }

    // Check object size
    const jsonString = JSON.stringify(data);
    if (jsonString.length > ValidationPatterns.MAX_JSON_SIZE) {
      errors.push('Data size exceeds maximum limit of 1MB');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
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
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    const pnNameValidation = IdentityValidator.validatePNName(data.pnName);
    if (!pnNameValidation.isValid) {
      errors.push(...pnNameValidation.errors);
    }
    warnings.push(...pnNameValidation.warnings);

    const nicknameValidation = DisplayValidator.validateNickname(data.nickname);
    if (!nicknameValidation.isValid) {
      errors.push(...nicknameValidation.errors);
    }
    warnings.push(...nicknameValidation.warnings);

    const passcodeValidation = IdentityValidator.validatePasscode(data.passcode);
    if (!passcodeValidation.isValid) {
      errors.push(...passcodeValidation.errors);
    }
    warnings.push(...passcodeValidation.warnings);

    // Validate optional fields
    if (data.email) {
      const emailValidation = ContactValidator.validateEmail(data.email);
      if (!emailValidation.isValid) {
        errors.push(...emailValidation.errors);
      }
      warnings.push(...emailValidation.warnings);
    }

    if (data.phone) {
      const phoneValidation = ContactValidator.validatePhone(data.phone);
      if (!phoneValidation.isValid) {
        errors.push(...phoneValidation.errors);
      }
      warnings.push(...phoneValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
