/**
 * Metadata Validation System
 * Provi silent background validation and sanitization of metadata
 * Runs automatically without user interaction
 */

import { DIDMetadata } from '../types';

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  sanitizedData: any;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ValidationConfig {
  maxCustomFields: number;
  maxFieldLength: number;
  allowScripts: boolean;
  allowExternalLinks: boolean;
  strictMode: boolean;
}

export class MetadataValidator {
  private static readonly DEFAULT_CONFIG: ValidationConfig = {
    maxCustomFields: 100,
    maxFieldLength: 10000,
    allowScripts: false,
    allowExternalLinks: false,
    strictMode: true
  };

  private static readonly FORBIDDEN_PATTERNS = [
    // Script injection patterns
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /data:text\/html/gi,
    /data:application\/javascript/gi,
    
    // Event handler patterns
    /on\w+\s*=/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onclick\s*=/gi,
    
    // Expression patterns
    /expression\s*\(/gi,
    /eval\s*\(/gi,
    /Function\s*\(/gi,
    
    // SQL injection patterns
    /(\b(union|select|insert|update|delete|drop|create|alter)\b)/gi,
    /(\b(exec|execute|sp_|xp_)\b)/gi,
    
    // Path traversal patterns
    /\.\.\/|\.\.\\/gi,
    /\/etc\/passwd/gi,
    /\/proc\/self/gi,
    
    // Command injection patterns
    /(\b(cmd|command|shell|bash|powershell)\b)/gi,
    /(\||&|;|`|$\(|\))/gi
  ];

  private static readonly SUSPICIOUS_PATTERNS = [
    // Sensitive data patterns
    /password/i,
    /secret/i,
    /private_key/i,
    /credit_card/i,
    /ssn/i,
    /social_security/i,
    /api_key/i,
    /access_token/i,
    /refresh_token/i,
    
    // Malicious patterns
    /malware/i,
    /virus/i,
    /trojan/i,
    /backdoor/i,
    /exploit/i
  ];

  private static readonly ALLOWED_HTML_TAGS = [
    'p', 'br', 'strong', 'em', 'u', 'i', 'b', 'span', 'div'
  ];

  /**
   * Validate and sanitize metadata silently
   */
  static validateMetadata(
    metadata: any, 
    config: Partial<ValidationConfig> = {}
  ): ValidationResult {
    const fullConfig = { ...this.DEFAULT_CONFIG, ...config };
    const issues: string[] = [];
    let sanitizedData: any;

    try {
      // Deep clone the metadata
      sanitizedData = JSON.parse(JSON.stringify(metadata));
      
      // Validate structure
      const structureIssues = this.validateStructure(sanitizedData, fullConfig);
      issues.push(...structureIssues);

      // Check for injection attempts
      const injectionIssues = this.detectInjectionAttempts(sanitizedData);
      issues.push(...injectionIssues);

      // Check for suspicious data
      const suspiciousIssues = this.detectSuspiciousData(sanitizedData);
      issues.push(...suspiciousIssues);

      // Sanitize the data
      sanitizedData = this.sanitizeMetadata(sanitizedData, fullConfig);

      // Validate custom fields
      const customFieldIssues = this.validateCustomFields(sanitizedData, fullConfig);
      issues.push(...customFieldIssues);

      // Calculate risk level
      const riskLevel = this.calculateRiskLevel(issues);

      return {
        isValid: issues.length === 0,
        issues,
        sanitizedData,
        riskLevel
      };

    } catch (error) {
      return {
        isValid: false,
        issues: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        sanitizedData: {},
        riskLevel: 'high'
      };
    }
  }

  /**
   * Validate metadata structure
   */
  private static validateStructure(metadata: any, config: ValidationConfig): string[] {
    const issues: string[] = [];

    // Check for circular references
    if (this.hasCircularReferences(metadata)) {
      issues.push('Circular reference detected in metadata');
    }

    // Check object depth
    if (this.getObjectDepth(metadata) > 10) {
      issues.push('Metadata object too deep (max 10 levels)');
    }

    // Check total size
    const metadataSize = JSON.stringify(metadata).length;
    if (metadataSize > config.maxFieldLength * 10) {
      issues.push(`Metadata too large (${metadataSize} bytes, max ${config.maxFieldLength * 10})`);
    }

    return issues;
  }

  /**
   * Detect injection attempts
   */
  private static detectInjectionAttempts(metadata: any): string[] {
    const issues: string[] = [];
    const metadataString = JSON.stringify(metadata);

    for (const pattern of this.FORBIDDEN_PATTERNS) {
      if (pattern.test(metadataString)) {
        issues.push(`Potential injection detected: ${pattern.source}`);
      }
    }

    return issues;
  }

  /**
   * Detect suspicious data patterns
   */
  private static detectSuspiciousData(metadata: any): string[] {
    const issues: string[] = [];
    const metadataString = JSON.stringify(metadata).toLowerCase();

    for (const pattern of this.SUSPICIOUS_PATTERNS) {
      if (pattern.test(metadataString)) {
        issues.push(`Suspicious data pattern detected: ${pattern.source}`);
      }
    }

    return issues;
  }

  /**
   * Sanitize metadata
   */
  private static sanitizeMetadata(metadata: any, config: ValidationConfig): any {
    if (typeof metadata === 'string') {
      return this.sanitizeString(metadata, config);
    }

    if (Array.isArray(metadata)) {
      return metadata.map(item => this.sanitizeMetadata(item, config));
    }

    if (typeof metadata === 'object' && metadata !== null) {
      const sanitized: any = {};
      
      for (const [key, value] of Object.entries(metadata)) {
        // Sanitize key
        const sanitizedKey = this.sanitizeString(key, config);
        
        // Sanitize value
        const sanitizedValue = this.sanitizeMetadata(value, config);
        
        // Only add if key is valid
        if (sanitizedKey && sanitizedKey.length > 0) {
          sanitized[sanitizedKey] = sanitizedValue;
        }
      }
      
      return sanitized;
    }

    return metadata;
  }

  /**
   * Sanitize string values
   */
  private static sanitizeString(str: string, config: ValidationConfig): string {
    if (typeof str !== 'string') {
      return String(str);
    }

    let sanitized = str;

    // Remove forbidden patterns
    for (const pattern of this.FORBIDDEN_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }

    // Truncate if too long
    if (sanitized.length > config.maxFieldLength) {
      sanitized = sanitized.substring(0, config.maxFieldLength);
    }

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }

  /**
   * Validate custom fields
   */
  private static validateCustomFields(metadata: any, config: ValidationConfig): string[] {
    const issues: string[] = [];

    if (metadata.customFields && typeof metadata.customFields === 'object') {
      const customFields = metadata.customFields;
      const fieldCount = Object.keys(customFields).length;

      if (fieldCount > config.maxCustomFields) {
        issues.push(`Too many custom fields (${fieldCount}, max ${config.maxCustomFields})`);
      }

      // Check individual field sizes
      for (const [key, value] of Object.entries(customFields)) {
        const valueString = JSON.stringify(value);
        if (valueString.length > config.maxFieldLength) {
          issues.push(`Custom field '${key}' too large (${valueString.length} bytes, max ${config.maxFieldLength})`);
        }
      }
    }

    return issues;
  }

  /**
   * Calculate risk level based on issues
   */
  private static calculateRiskLevel(issues: string[]): 'low' | 'medium' | 'high' {
    const highRiskKeywords = ['injection', 'script', 'exec', 'malware', 'virus'];
    const mediumRiskKeywords = ['suspicious', 'large', 'deep', 'circular'];

    const highRiskCount = issues.filter(issue => 
      highRiskKeywords.some(keyword => issue.toLowerCase().includes(keyword))
    ).length;

    const mediumRiskCount = issues.filter(issue => 
      mediumRiskKeywords.some(keyword => issue.toLowerCase().includes(keyword))
    ).length;

    if (highRiskCount > 0) return 'high';
    if (mediumRiskCount > 0 || issues.length > 5) return 'medium';
    return 'low';
  }

  /**
   * Check for circular references
   */
  private static hasCircularReferences(obj: any, seen = new WeakSet()): boolean {
    if (obj === null || typeof obj !== 'object') {
      return false;
    }

    if (seen.has(obj)) {
      return true;
    }

    seen.add(obj);

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (this.hasCircularReferences(obj[key], seen)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get object depth
   */
  private static getObjectDepth(obj: any, depth = 0): number {
    if (obj === null || typeof obj !== 'object') {
      return depth;
    }

    let maxDepth = depth;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        maxDepth = Math.max(maxDepth, this.getObjectDepth(obj[key], depth + 1));
      }
    }

    return maxDepth;
  }

  /**
   * Silent validation - fixes issues automatically without user notification
   */
  static silentValidate(metadata: any): any {
    const result = this.validateMetadata(metadata);
    
    if (!result.isValid) {
      // Log issues for developers but don't show to users
      // Console statement removed for production
      
      // Return sanitized data
      return result.sanitizedData;
    }
    
    return metadata;
  }
}
