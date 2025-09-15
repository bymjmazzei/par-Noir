export class AdvancedInputValidator {
  private static readonly sanitizationRules = {
    html: /<[^>]*>/g,
    script: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    sql: /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
    path: /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)/gi,
    command: /(\||&|;|`|\$\(|\$\{)/g
  };

  static sanitizeInput(input: string, rules: string[] = ['html', 'script']): string {
    let sanitized = input;
    
    rules.forEach(rule => {
      if (this.sanitizationRules[rule]) {
        sanitized = sanitized.replace(this.sanitizationRules[rule], '');
      }
    });
    
    return sanitized.trim();
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  static validatePassword(password: string): { isValid: boolean; strength: string; suggestions: string[] } {
    const suggestions: string[] = [];
    let score = 0;
    
    if (password.length >= 8) score += 1;
    else suggestions.push('Password should be at least 8 characters long');
    
    if (/[a-z]/.test(password)) score += 1;
    else suggestions.push('Password should contain at least one lowercase letter');
    
    if (/[A-Z]/.test(password)) score += 1;
    else suggestions.push('Password should contain at least one uppercase letter');
    
    if (/[0-9]/.test(password)) score += 1;
    else suggestions.push('Password should contain at least one number');
    
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    else suggestions.push('Password should contain at least one special character');
    
    let strength: string;
    if (score <= 2) strength = 'weak';
    else if (score <= 4) strength = 'medium';
    else strength = 'strong';
    
    return {
      isValid: score >= 4,
      strength,
      suggestions
    };
  }

  static validateURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static validateJSON(jsonString: string): boolean {
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  }
}