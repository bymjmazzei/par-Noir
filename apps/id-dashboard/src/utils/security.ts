export interface SecurityEvent {
  type: 'threat_detected' | 'rate_limit_exceeded' | 'suspicious_activity' | 'authentication_failure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  userId?: string;
  sessionId: string;
  metadata?: any;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator: (userId?: string) => string;
}

export interface ThreatPattern {
  pattern: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export class AdvancedSecurity {
  private static instance: AdvancedSecurity;
  private events: SecurityEvent[] = [];
  private rateLimits: Map<string, { count: number; resetTime: number }> = new Map();
  private threatPatterns: ThreatPattern[] = [];
  private sessionId: string;

  static getInstance(): AdvancedSecurity {
    if (!AdvancedSecurity.instance) {
      AdvancedSecurity.instance = new AdvancedSecurity();
    }
    return AdvancedSecurity.instance;
  }

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeThreatPatterns();
    this.startSecurityMonitoring();
  }

  /**
   * Initialize threat detection patterns
   */
  private initializeThreatPatterns(): void {
    this.threatPatterns = [
      {
        pattern: 'script',
        severity: 'high',
        description: 'Potential XSS attempt'
      },
      {
        pattern: 'javascript:',
        severity: 'critical',
        description: 'JavaScript injection attempt'
      },
      {
        pattern: 'eval(',
        severity: 'critical',
        description: 'Code injection attempt'
      },
      {
        pattern: 'document.cookie',
        severity: 'medium',
        description: 'Cookie manipulation attempt'
      },
      {
        pattern: 'localStorage',
        severity: 'low',
        description: 'Storage access attempt'
      }
    ];
  }

  /**
   * Check for threats in input data
   */
  checkForThreats(input: string, context: string = 'user_input'): SecurityEvent[] {
    const threats: SecurityEvent[] = [];

    for (const pattern of this.threatPatterns) {
      if (input.toLowerCase().includes(pattern.pattern.toLowerCase())) {
        const event: SecurityEvent = {
          type: 'threat_detected',
          severity: pattern.severity,
          message: `${pattern.description} detected in ${context}`,
          timestamp: Date.now(),
          sessionId: this.sessionId,
          metadata: {
            pattern: pattern.pattern,
            context,
            input: input.substring(0, 100) // Truncate for privacy
          }
        };

        threats.push(event);
        this.logSecurityEvent(event);
      }
    }

    return threats;
  }

  /**
   * Rate limiting for API calls
   */
  checkRateLimit(config: RateLimitConfig, userId?: string): boolean {
    const key = config.keyGenerator(userId);
    const now = Date.now();
    const current = this.rateLimits.get(key);

    if (!current || now > current.resetTime) {
      // Reset or create new rate limit
      this.rateLimits.set(key, {
        count: 1,
        resetTime: now + config.windowMs
      });
      return true;
    }

    if (current.count >= config.maxRequests) {
      // Rate limit exceeded
      const event: SecurityEvent = {
        type: 'rate_limit_exceeded',
        severity: 'medium',
        message: `Rate limit exceeded for key: ${key}`,
        timestamp: now,
        sessionId: this.sessionId,
        userId,
        metadata: {
          key,
          maxRequests: config.maxRequests,
          windowMs: config.windowMs
        }
      };

      this.logSecurityEvent(event);
      return false;
    }

    // Increment count
    current.count++;
    return true;
  }

  /**
   * Certificate pinning validation (simulated)
   */
  validateCertificate(domain: string, expectedFingerprint: string): boolean {
    // In a real implementation, this would validate SSL certificates
    // For now, we'll simulate the validation
    const isValid = Math.random() > 0.1; // 90% success rate for demo

    if (!isValid) {
      const event: SecurityEvent = {
        type: 'suspicious_activity',
        severity: 'high',
        message: `Certificate validation failed for domain: ${domain}`,
        timestamp: Date.now(),
        sessionId: this.sessionId,
        metadata: {
          domain,
          expectedFingerprint,
          actualFingerprint: 'unknown'
        }
      };

      this.logSecurityEvent(event);
    }

    return isValid;
  }

  /**
   * Monitor authentication attempts
   */
  monitorAuthentication(success: boolean, userId?: string, context?: string): void {
    if (!success) {
      const event: SecurityEvent = {
        type: 'authentication_failure',
        severity: 'medium',
        message: `Authentication failure for user: ${userId || 'unknown'}`,
        timestamp: Date.now(),
        sessionId: this.sessionId,
        userId,
        metadata: {
          context,
          attemptCount: this.getAuthenticationAttempts(userId)
        }
      };

      this.logSecurityEvent(event);
    }
  }

  /**
   * Validate input data
   */
  validateInput(input: string, type: 'email' | 'phone' | 'username' | 'passcode'): boolean {
    // Check for threats first
    const threats = this.checkForThreats(input, type);
    if (threats.length > 0) {
      return false;
    }

    // Type-specific validation
    switch (type) {
      case 'email':
        return this.validateEmail(input);
      case 'phone':
        return this.validatePhone(input);
      case 'username':
        return this.validateUsername(input);
      case 'passcode':
        return this.validatePasscode(input);
      default:
        return true;
    }
  }

  /**
   * Sanitize input data
   */
  sanitizeInput(input: string): string {
    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, '') // Remove < and >
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  /**
   * Get security events
   */
  getSecurityEvents(): SecurityEvent[] {
    return this.events;
  }

  /**
   * Export security data
   */
  exportSecurityData(): string {
    const data = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      events: this.events,
      rateLimits: Array.from(this.rateLimits.entries()),
      threatPatterns: this.threatPatterns
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Clear security data
   */
  clearSecurityData(): void {
    this.events = [];
    this.rateLimits.clear();
  }

  /**
   * Get security summary
   */
  getSecuritySummary(): {
    totalEvents: number;
    criticalEvents: number;
    highSeverityEvents: number;
    rateLimitViolations: number;
    threatsDetected: number;
  } {
    const critical = this.events.filter(e => e.severity === 'critical').length;
    const high = this.events.filter(e => e.severity === 'high').length;
    const rateLimit = this.events.filter(e => e.type === 'rate_limit_exceeded').length;
    const threats = this.events.filter(e => e.type === 'threat_detected').length;

    return {
      totalEvents: this.events.length,
      criticalEvents: critical,
      highSeverityEvents: high,
      rateLimitViolations: rateLimit,
      threatsDetected: threats
    };
  }

  /**
   * Start security monitoring
   */
  private startSecurityMonitoring(): void {
    // Monitor for suspicious browser behavior
    if (typeof window !== 'undefined') {
      // Monitor for dev tools opening
      let devtools = { open: false, orientation: null };
      setInterval(() => {
        const threshold = window.outerHeight - window.innerHeight > 200 || 
                         window.outerWidth - window.innerWidth > 200;
        
        if (threshold && !devtools.open) {
          devtools.open = true;
          this.logSecurityEvent({
            type: 'suspicious_activity',
            severity: 'low',
            message: 'Developer tools detected',
            timestamp: Date.now(),
            sessionId: this.sessionId
          });
        } else if (!threshold) {
          devtools.open = false;
        }
      }, 1000);

      // Monitor for rapid clicks (potential automation)
      let clickCount = 0;
      let lastClickTime = 0;
      document.addEventListener('click', () => {
        const now = Date.now();
        if (now - lastClickTime < 100) {
          clickCount++;
          if (clickCount > 10) {
            this.logSecurityEvent({
              type: 'suspicious_activity',
              severity: 'medium',
              message: 'Rapid clicking detected - potential automation',
              timestamp: now,
              sessionId: this.sessionId
            });
            clickCount = 0;
          }
        } else {
          clickCount = 0;
        }
        lastClickTime = now;
      });
    }
  }

  /**
   * Log security event
   */
  private logSecurityEvent(event: SecurityEvent): void {
    this.events.push(event);
    this.saveSecurityEvents();
    
    if (event.severity === 'critical' && process.env.NODE_ENV === 'development') {
      console.warn('Critical security event:', event);
    }
  }

  /**
   * Get authentication attempts for user
   */
  private getAuthenticationAttempts(userId?: string): number {
    return this.events.filter(e => 
      e.type === 'authentication_failure' && 
      e.userId === userId
    ).length;
  }

  /**
   * Validate email format
   */
  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone format
   */
  private validatePhone(phone: string): boolean {
    const phoneRegex = /^[+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-()]/g, ''));
  }

  /**
   * Validate username format
   */
  private validateUsername(username: string): boolean {
    return username.length >= 3 && username.length <= 50 && /^[a-zA-Z0-9_]+$/.test(username);
  }

  /**
   * Validate passcode strength
   */
  private validatePasscode(passcode: string): boolean {
    return passcode.length >= 8 && passcode.length <= 128;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `security_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Save security events to localStorage
   */
  private saveSecurityEvents(): void {
    try {
      localStorage.setItem('security_events', JSON.stringify(this.events));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to save security events:', error);
      }
    }
  }
}

// Export singleton instance
export const security = AdvancedSecurity.getInstance(); 