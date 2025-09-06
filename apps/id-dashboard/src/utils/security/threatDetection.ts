import { cryptoWorkerManager } from '../crypto/cryptoWorkerManager';

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
        pattern: /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)/i,
        description: 'Potential path traversal attempt detected',
        mitigation: 'Path validation and sanitization required'
      },
      {
        id: 'command-injection',
        name: 'Command Injection Attempt',
        severity: 'critical',
        pattern: /(\||&|;|`|\$\(|\$\{)/g,
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
    
    // Advanced threat detection monitoring started
  }

  stopMonitoring() {
    this.isMonitoring = false;
    // Advanced threat detection monitoring stopped
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
    // Critical threat blocked - security event logged
    // Input: [sanitized for security]
    // Mitigation: [security measure applied]
    
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
    
    // Create warning container safely
    const warningContainer = document.createElement('div');
    warningContainer.className = 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded';
    
    // Create title element
    const title = document.createElement('strong');
    title.textContent = 'Security Warning: ';
    
    // Create description element
    const description = document.createElement('span');
    description.textContent = pattern.description;
    
    // Create line break
    const lineBreak = document.createElement('br');
    
    // Create mitigation element
    const mitigation = document.createElement('small');
    mitigation.textContent = pattern.mitigation;
    
    // Assemble elements safely
    warningContainer.appendChild(title);
    warningContainer.appendChild(description);
    warningContainer.appendChild(lineBreak);
    warningContainer.appendChild(mitigation);
    warning.appendChild(warningContainer);
    
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
      id: `${Date.now()}-${Array.from(crypto.getRandomValues(new Uint8Array(1)))[0] / 255.toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type,
      severity,
      description,
      metadata,
      resolved: false
    };
    
    this.securityEvents.push(event);
    
    // Log security event
    // Security event logged - severity: [severity], description: [sanitized]
    
    // Store in localStorage for persistence
    this.persistSecurityEvents();
    
    // Emit event for other components
    window.dispatchEvent(new CustomEvent('security-event', { detail: event }));
  }

  private persistSecurityEvents() {
    try {
      localStorage.setItem('security-events', JSON.stringify(this.securityEvents));
    } catch (error) {
      // Failed to persist security events - error handled gracefully
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

export const threatDetector = AdvancedThreatDetector.getInstance();