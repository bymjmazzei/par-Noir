#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('=== PHASE 3.6: ADVANCED SECURITY FEATURES ===\n');

// Create advanced security utilities
const createAdvancedSecurityUtils = () => {
  const securityDir = './apps/id-dashboard/src/utils/security';
  if (!fs.existsSync(securityDir)) {
    fs.mkdirSync(securityDir, { recursive: true });
  }

  // Advanced threat detection
  const threatDetection = `import { cryptoWorkerManager } from '../crypto/cryptoWorkerManager';

export interface ThreatPattern {
  id: string;
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern: RegExp;
  description: string;
  mitigation: string;
}

export interface SecurityEvent {
  id: string;
  timestamp: string;
  type: string;
  severity: string;
  description: string;
  metadata: any;
  resolved: boolean;
}

export class AdvancedThreatDetector {
  private static instance: AdvancedThreatDetector;
  private threatPatterns: ThreatPattern[] = [];
  private securityEvents: SecurityEvent[] = [];
  private isMonitoring: boolean = false;

  private constructor() {
    this.initializeThreatPatterns();
  }

  static getInstance(): AdvancedThreatDetector {
    if (!AdvancedThreatDetector.instance) {
      AdvancedThreatDetector.instance = new AdvancedThreatDetector();
    }
    return AdvancedThreatDetector.instance;
  }

  private initializeThreatPatterns() {
    this.threatPatterns = [
      {
        id: 'sql-injection',
        name: 'SQL Injection Attempt',
        severity: 'critical',
        pattern: /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/i,
        description: 'Potential SQL injection attempt detected',
        mitigation: 'Input validation and parameterized queries required'
      },
      {
        id: 'xss-attack',
        name: 'XSS Attack Attempt',
        severity: 'high',
        pattern: /(<script|javascript:|vbscript:|onload=|onerror=)/i,
        description: 'Potential XSS attack attempt detected',
        mitigation: 'Input sanitization and CSP headers required'
      },
      {
        id: 'path-traversal',
        name: 'Path Traversal Attempt',
        severity: 'high',
        pattern: /(\\.\\.\\/|\\.\\.\\\\|%2e%2e%2f|%2e%2e%5c)/i,
        description: 'Potential path traversal attempt detected',
        mitigation: 'Path validation and sanitization required'
      },
      {
        id: 'command-injection',
        name: 'Command Injection Attempt',
        severity: 'critical',
        pattern: /(\\||&|;|`|\\$\\(|\\$\\{)/g,
        description: 'Potential command injection attempt detected',
        mitigation: 'Command validation and sanitization required'
      }
    ];
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.monitorUserInput();
    this.monitorNetworkActivity();
    this.monitorCryptoWorker();
    
    console.log('Advanced threat detection monitoring started');
  }

  stopMonitoring() {
    this.isMonitoring = false;
    console.log('Advanced threat detection monitoring stopped');
  }

  private monitorUserInput() {
    // Monitor form inputs for malicious patterns
    document.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      if (target && target.value) {
        this.analyzeInput(target.value, 'user-input');
      }
    });

    // Monitor form submissions
    document.addEventListener('submit', (event) => {
      const form = event.target as HTMLFormElement;
      if (form) {
        const formData = new FormData(form);
        for (const [key, value] of formData.entries()) {
          if (typeof value === 'string') {
            this.analyzeInput(value, 'form-submission');
          }
        }
      }
    });
  }

  private monitorNetworkActivity() {
    // Monitor fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = args[0];
      if (typeof url === 'string') {
        this.analyzeInput(url, 'network-request');
      }
      
      try {
        const response = await originalFetch(...args);
        this.analyzeResponse(response);
        return response;
      } catch (error) {
        this.recordSecurityEvent('network-error', 'medium', 'Network request failed', { error: error.message });
        throw error;
      }
    };
  }

  private monitorCryptoWorker() {
    // Monitor crypto worker health
    setInterval(() => {
      const isHealthy = cryptoWorkerManager.isHealthy();
      if (!isHealthy) {
        this.recordSecurityEvent('crypto-worker-unhealthy', 'high', 'Cryptographic operations may be compromised', {});
      }
    }, 30000);
  }

  private analyzeInput(input: string, source: string) {
    for (const pattern of this.threatPatterns) {
      if (pattern.pattern.test(input)) {
        this.recordSecurityEvent(
          pattern.id,
          pattern.severity,
          pattern.description,
          { input: input.substring(0, 100), source, pattern: pattern.name }
        );
        
        // Block critical threats
        if (pattern.severity === 'critical') {
          this.blockThreat(pattern, input);
        }
      }
    }
  }

  private analyzeResponse(response: Response) {
    // Analyze response headers for security issues
    const cspHeader = response.headers.get('content-security-policy');
    if (!cspHeader) {
      this.recordSecurityEvent('missing-csp', 'medium', 'Missing Content Security Policy header', {});
    }
    
    const hstsHeader = response.headers.get('strict-transport-security');
    if (!hstsHeader) {
      this.recordSecurityEvent('missing-hsts', 'medium', 'Missing HSTS header', {});
    }
  }

  private blockThreat(pattern: ThreatPattern, input: string) {
    console.warn(\`🚨 CRITICAL THREAT BLOCKED: \${pattern.name}\`);
    console.warn(\`Input: \${input.substring(0, 100)}...\`);
    console.warn(\`Mitigation: \${pattern.mitigation}\`);
    
    // Clear the input field
    const activeElement = document.activeElement as HTMLInputElement;
    if (activeElement && activeElement.value === input) {
      activeElement.value = '';
    }
    
    // Show security warning to user
    this.showSecurityWarning(pattern);
  }

  private showSecurityWarning(pattern: ThreatPattern) {
    const warning = document.createElement('div');
    warning.className = 'security-warning';
    warning.innerHTML = \`
      <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <strong>Security Warning:</strong> \${pattern.description}
        <br><small>\${pattern.mitigation}</small>
      </div>
    \`;
    
    document.body.appendChild(warning);
    
    // Remove warning after 5 seconds
    setTimeout(() => {
      if (warning.parentNode) {
        warning.parentNode.removeChild(warning);
      }
    }, 5000);
  }

  private recordSecurityEvent(type: string, severity: string, description: string, metadata: any) {
    const event: SecurityEvent = {
      id: \`\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`,
      timestamp: new Date().toISOString(),
      type,
      severity,
      description,
      metadata,
      resolved: false
    };
    
    this.securityEvents.push(event);
    
    // Log security event
    console.warn(\`🔒 Security Event: \${severity.toUpperCase()} - \${description}\`);
    
    // Store in localStorage for persistence
    this.persistSecurityEvents();
    
    // Emit event for other components
    window.dispatchEvent(new CustomEvent('security-event', { detail: event }));
  }

  private persistSecurityEvents() {
    try {
      localStorage.setItem('security-events', JSON.stringify(this.securityEvents));
    } catch (error) {
      console.error('Failed to persist security events:', error);
    }
  }

  getSecurityEvents(): SecurityEvent[] {
    return [...this.securityEvents];
  }

  getThreatPatterns(): ThreatPattern[] {
    return [...this.threatPatterns];
  }

  addThreatPattern(pattern: ThreatPattern) {
    this.threatPatterns.push(pattern);
  }

  clearSecurityEvents() {
    this.securityEvents = [];
    this.persistSecurityEvents();
  }
}

export const threatDetector = AdvancedThreatDetector.getInstance();`;

  // Advanced input validation
  const inputValidation = `export class AdvancedInputValidator {
  private static readonly sanitizationRules = {
    html: /<[^>]*>/g,
    script: /<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>/gi,
    sql: /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\\b)/gi,
    path: /(\\.\\.\\/|\\.\\.\\\\|%2e%2e%2f|%2e%2e%5c)/gi,
    command: /(\\||&|;|\`|\\$\\(|\\$\\{)/g
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
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/;
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
}`;

  // Rate limiting utility
  const rateLimiting = `export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  blockDuration?: number;
}

export interface RateLimitInfo {
  requests: number;
  resetTime: number;
  blocked: boolean;
  blockExpiry?: number;
}

export class RateLimiter {
  private static instance: RateLimiter;
  private limits: Map<string, RateLimitInfo> = new Map();
  private config: RateLimitConfig;

  private constructor(config: RateLimitConfig) {
    this.config = config;
    this.cleanupExpired();
  }

  static getInstance(config?: RateLimitConfig): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter(config || {
        maxRequests: 100,
        windowMs: 15 * 60 * 1000, // 15 minutes
        blockDuration: 5 * 60 * 1000 // 5 minutes
      });
    }
    return RateLimiter.instance;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const limit = this.limits.get(identifier);
    
    if (!limit) {
      this.limits.set(identifier, {
        requests: 1,
        resetTime: now + this.config.windowMs
      });
      return true;
    }
    
    // Check if blocked
    if (limit.blocked && limit.blockExpiry && now < limit.blockExpiry) {
      return false;
    }
    
    // Reset if window expired
    if (now > limit.resetTime) {
      limit.requests = 1;
      limit.resetTime = now + this.config.windowMs;
      limit.blocked = false;
      this.limits.set(identifier, limit);
      return true;
    }
    
    // Check if limit exceeded
    if (limit.requests >= this.config.maxRequests) {
      limit.blocked = true;
      limit.blockExpiry = now + (this.config.blockDuration || 0);
      this.limits.set(identifier, limit);
      return false;
    }
    
    // Increment request count
    limit.requests++;
    this.limits.set(identifier, limit);
    return true;
  }

  getLimitInfo(identifier: string): RateLimitInfo | null {
    return this.limits.get(identifier) || null;
  }

  resetLimit(identifier: string): void {
    this.limits.delete(identifier);
  }

  private cleanupExpired(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [identifier, limit] of this.limits.entries()) {
        if (now > limit.resetTime && (!limit.blockExpiry || now > limit.blockExpiry)) {
          this.limits.delete(identifier);
        }
      }
    }, 60000); // Clean up every minute
  }
}`;

  // Write security utilities
  fs.writeFileSync(path.join(securityDir, 'threatDetection.ts'), threatDetection);
  fs.writeFileSync(path.join(securityDir, 'inputValidation.ts'), inputValidation);
  fs.writeFileSync(path.join(securityDir, 'rateLimiting.ts'), rateLimiting);

  // Create security index
  const securityIndex = `export { threatDetector, AdvancedThreatDetector, type ThreatPattern, type SecurityEvent } from './threatDetection';
export { AdvancedInputValidator } from './inputValidation';
export { RateLimiter, type RateLimitConfig, type RateLimitInfo } from './rateLimiting';`;

  fs.writeFileSync(path.join(securityDir, 'index.ts'), securityIndex);
};

// Create advanced security components
const createAdvancedSecurityComponents = () => {
  const securityComponentsDir = './apps/id-dashboard/src/components/security-advanced';
  if (!fs.existsSync(securityComponentsDir)) {
    fs.mkdirSync(securityComponentsDir, { recursive: true });
  }

  // Security dashboard component
  const securityDashboard = `import React, { useState, useEffect } from 'react';
import { threatDetector, type SecurityEvent } from '../../utils/security';

export const AdvancedSecurityDashboard: React.FC = React.memo(() => {
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    // Load existing security events
    setSecurityEvents(threatDetector.getSecurityEvents());
    
    // Listen for new security events
    const handleSecurityEvent = (event: CustomEvent) => {
      setSecurityEvents(prev => [event.detail, ...prev]);
    };
    
    window.addEventListener('security-event', handleSecurityEvent);
    
    return () => {
      window.removeEventListener('security-event', handleSecurityEvent);
    };
  }, []);

  const startMonitoring = () => {
    threatDetector.startMonitoring();
    setIsMonitoring(true);
  };

  const stopMonitoring = () => {
    threatDetector.stopMonitoring();
    setIsMonitoring(false);
  };

  const clearEvents = () => {
    threatDetector.clearSecurityEvents();
    setSecurityEvents([]);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Advanced Security Dashboard
        </h2>
        <div className="flex space-x-3">
          {!isMonitoring ? (
            <button
              onClick={startMonitoring}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Start Monitoring
            </button>
          ) : (
            <button
              onClick={stopMonitoring}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Stop Monitoring
            </button>
          )}
          <button
            onClick={clearEvents}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Clear Events
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Security Status
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Monitoring:</span>
              <span className={isMonitoring ? 'text-green-600' : 'text-red-600'}>
                {isMonitoring ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Total Events:</span>
              <span className="text-gray-900 dark:text-white font-semibold">
                {securityEvents.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Critical Events:</span>
              <span className="text-red-600 font-semibold">
                {securityEvents.filter(e => e.severity === 'critical').length}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Threat Patterns
          </h3>
          <div className="space-y-2">
            {threatDetector.getThreatPatterns().map(pattern => (
              <div key={pattern.id} className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">{pattern.name}:</span>
                <span className={\`px-2 py-1 rounded text-xs font-medium \${getSeverityColor(pattern.severity)}\`}>
                  {pattern.severity}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Recent Activity
          </h3>
          <div className="space-y-2">
            {securityEvents.slice(0, 5).map(event => (
              <div key={event.id} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className={\`px-2 py-1 rounded text-xs font-medium \${getSeverityColor(event.severity)}\`}>
                    {event.severity}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-gray-700 dark:text-gray-300 mt-1">{event.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {securityEvents.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Security Event Log
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Severity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {securityEvents.map(event => (
                  <tr key={event.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {event.type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={\`px-2 py-1 rounded text-xs font-medium \${getSeverityColor(event.severity)}\`}>
                        {event.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {event.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={\`px-2 py-1 rounded text-xs font-medium \${event.resolved ? 'text-green-600 bg-green-100' : 'text-yellow-600 bg-yellow-100'}\`}>
                        {event.resolved ? 'Resolved' : 'Open'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});

AdvancedSecurityDashboard.displayName = 'AdvancedSecurityDashboard';`;

  fs.writeFileSync(path.join(securityComponentsDir, 'AdvancedSecurityDashboard.tsx'), securityDashboard);
};

// Run security implementations
createAdvancedSecurityUtils();
createAdvancedSecurityComponents();

console.log('✅ Advanced threat detection system created');
console.log('✅ Enhanced input validation utilities created');
console.log('✅ Rate limiting system implemented');
console.log('✅ Advanced security dashboard component created');
console.log('✅ Advanced security features implementation completed');

console.log('\n=== PHASE 3.6 COMPLETED ===');
console.log('Advanced security features implementation completed!');
console.log('- Real-time threat detection and monitoring');
console.log('- Advanced input validation and sanitization');
console.log('- Rate limiting and abuse prevention');
console.log('- Comprehensive security event logging');
console.log('- Security dashboard for monitoring and management');
