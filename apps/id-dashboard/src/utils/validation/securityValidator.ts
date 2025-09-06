// Security Validator - Handles security pattern detection and sanitization
import { ValidationPatterns } from './validationPatterns';

export class SecurityValidator {
  /**
   * Check for XSS patterns
   */
  static containsXSS(value: string): boolean {
    return ValidationPatterns.XSS_PATTERNS.some(pattern => pattern.test(value));
  }

  /**
   * Check for SQL injection patterns
   */
  static containsSQLInjection(value: string): boolean {
    return ValidationPatterns.SQL_INJECTION_PATTERNS.some(pattern => pattern.test(value));
  }

  /**
   * Check for path traversal patterns
   */
  static containsPathTraversal(value: string): boolean {
    return ValidationPatterns.PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(value));
  }

  /**
   * Sanitize string input
   */
  static sanitizeString(value: string): string {
    // Remove null bytes
    let sanitized = value.replace(/\0/g, '');
    
    // Remove control characters except newline and tab
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    return sanitized;
  }
}
