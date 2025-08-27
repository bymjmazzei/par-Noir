/**
 * Comprehensive Input Validation Framework
 * Provides military-grade input validation for the Identity Protocol
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedValue?: string;
}

export interface ValidationRule {
  name: string;
  validator: (value: any) => boolean;
  errorMessage: string;
  warningMessage?: string;
}

export class InputValidator {
  // DID format validation
  private static readonly DID_PATTERN = /^did:key:[a-zA-Z0-9]{32,}$/;
  
  // Username validation
  private static readonly USERNAME_PATTERN = /^[a-zA-Z0-9-]{3,20}$/;
  private static readonly RESERVED_USERNAMES = [
    'admin', 'root', 'system', 'test', 'guest', 'anonymous', 'null', 'undefined',
    'api', 'oauth', 'auth', 'login', 'logout', 'register', 'signup', 'signin'
  ];

  // Email validation
  private static readonly EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  // Phone validation (international format)
  private static readonly PHONE_PATTERN = /^\+[1-9]\d{1,14}$/;

  // Public key validation
  private static readonly PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/]{100,}$/;

  // Signature validation
  private static readonly SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{50,}$/;

  // Challenge validation
  private static readonly CHALLENGE_PATTERN = /^[A-Za-z0-9+/]{20,}$/;

  // XSS patterns to detect
  private static readonly XSS_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onclick\s*=/gi,
    /onmouseover\s*=/gi,
    /<iframe\b[^>]*>/gi,
    /<object\b[^>]*>/gi,
    /<embed\b[^>]*>/gi
  ];

  // SQL injection patterns to detect
  private static readonly SQL_INJECTION_PATTERNS = [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
    /(--|\/\*|\*\/|;)/g,
    /(\b(and|or)\b\s+\d+\s*=\s*\d+)/gi,
    /(\b(and|or)\b\s+['"]\w+['"]\s*=\s*['"]\w+['"])/gi
  ];

  // Path traversal patterns to detect
  private static readonly PATH_TRAVERSAL_PATTERNS = [
    /\.\.\//g,
    /\.\.\\/g,
    /\/etc\/passwd/gi,
    /\/proc\/version/gi,
    /\/sys\/class\/net/gi
  ];

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

    if (!this.DID_PATTERN.test(did)) {
      errors.push('Invalid DID format. Must be in format: did:key:<base64-encoded-key>');
    }

    // Check for suspicious patterns
    if (this.containsXSS(did)) {
      errors.push('DID contains potentially malicious content');
    }

    if (this.containsSQLInjection(did)) {
      errors.push('DID contains potentially malicious SQL patterns');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: this.sanitizeString(did)
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

    if (!this.USERNAME_PATTERN.test(pnName)) {
      errors.push('pN Name can only contain letters, numbers, and hyphens');
    }

    if (this.RESERVED_USERNAMES.includes(pnName.toLowerCase())) {
      errors.push('pN Name is reserved and cannot be used');
    }

    // Check for suspicious patterns
    if (this.containsXSS(pnName)) {
      errors.push('pN Name contains potentially malicious content');
    }

    if (this.containsSQLInjection(pnName)) {
      errors.push('pN Name contains potentially malicious SQL patterns');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: this.sanitizeString(pnName)
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
    const weakPatterns = [
      'password', '123456', 'qwerty', 'admin', 'letmein', 'welcome',
      'monkey', 'dragon', 'master', 'football', 'baseball', 'shadow'
    ];

    if (weakPatterns.some(pattern => passcode.toLowerCase().includes(pattern))) {
      warnings.push('Passcode contains common weak patterns');
    }

    // Check for keyboard patterns
    const keyboardPatterns = ['qwerty', 'asdfgh', 'zxcvbn', '1234567890'];
    if (keyboardPatterns.some(pattern => passcode.toLowerCase().includes(pattern))) {
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
      sanitizedValue: passcode // Don't sanitize passcodes
    };
  }

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

    if (!this.EMAIL_PATTERN.test(email)) {
      errors.push('Invalid email format');
    }

    // Check for suspicious patterns
    if (this.containsXSS(email)) {
      errors.push('Email contains potentially malicious content');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: this.sanitizeString(email)
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

    if (!this.PHONE_PATTERN.test(phone)) {
      errors.push('Invalid phone number format. Must be in international format: +1234567890');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: this.sanitizeString(phone)
    };
  }

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

    if (!this.PUBLIC_KEY_PATTERN.test(publicKey)) {
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

    if (!this.SIGNATURE_PATTERN.test(signature)) {
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

    if (!this.CHALLENGE_PATTERN.test(challenge)) {
      errors.push('Invalid challenge format');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: challenge // Don't sanitize cryptographic data
    };
  }

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
    if (this.containsXSS(displayName)) {
      errors.push('Display name contains potentially malicious content');
    }

    if (this.containsSQLInjection(displayName)) {
      errors.push('Display name contains potentially malicious SQL patterns');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: this.sanitizeString(displayName)
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
    if (this.containsXSS(nickname)) {
      errors.push('Nickname contains potentially malicious content');
    }

    if (this.containsSQLInjection(nickname)) {
      errors.push('Nickname contains potentially malicious SQL patterns');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue: this.sanitizeString(nickname)
    };
  }

  /**
   * Check for XSS patterns
   */
  private static containsXSS(value: string): boolean {
    return this.XSS_PATTERNS.some(pattern => pattern.test(value));
  }

  /**
   * Check for SQL injection patterns
   */
  private static containsSQLInjection(value: string): boolean {
    return this.SQL_INJECTION_PATTERNS.some(pattern => pattern.test(value));
  }

  /**
   * Check for path traversal patterns
   */
  private static containsPathTraversal(value: string): boolean {
    return this.PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(value));
  }

  /**
   * Sanitize string input
   */
  private static sanitizeString(value: string): string {
    // Remove null bytes
    let sanitized = value.replace(/\0/g, '');
    
    // Remove control characters except newline and tab
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    return sanitized;
  }

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

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      errors.push('File size exceeds maximum limit of 10MB');
    }

    // Check file type
    const allowedTypes = [
      'application/json',
      'text/plain',
      'application/octet-stream'
    ];

    // Also check file extension for .pn files
    const allowedExtensions = ['.pn', '.id', '.json', '.identity'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      errors.push('Invalid file type. Only Par-Noir identity files (.pn, .id, .json, .identity) are allowed');
    }

    // Check filename
    if (file.name.length > 255) {
      errors.push('Filename is too long');
    }

    if (this.containsPathTraversal(file.name)) {
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

    // Check object size (max 1MB when stringified)
    const jsonString = JSON.stringify(data);
    if (jsonString.length > 1024 * 1024) {
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
    const pnNameValidation = this.validatePNName(data.pnName);
    if (!pnNameValidation.isValid) {
      errors.push(...pnNameValidation.errors);
    }
    warnings.push(...pnNameValidation.warnings);

    const nicknameValidation = this.validateNickname(data.nickname);
    if (!nicknameValidation.isValid) {
      errors.push(...nicknameValidation.errors);
    }
    warnings.push(...nicknameValidation.warnings);

    const passcodeValidation = this.validatePasscode(data.passcode);
    if (!passcodeValidation.isValid) {
      errors.push(...passcodeValidation.errors);
    }
    warnings.push(...passcodeValidation.warnings);

    // Validate optional fields
    if (data.email) {
      const emailValidation = this.validateEmail(data.email);
      if (!emailValidation.isValid) {
        errors.push(...emailValidation.errors);
      }
      warnings.push(...emailValidation.warnings);
    }

    if (data.phone) {
      const phoneValidation = this.validatePhone(data.phone);
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
