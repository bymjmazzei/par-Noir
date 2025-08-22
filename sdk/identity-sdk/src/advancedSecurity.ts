// Advanced Security Types
export interface CertificateInfo {
  fingerprint: string;
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
}

export interface PinnedCertificate {
  domain: string;
  fingerprints: string[];
  lastVerified: Date;
  expiresAt: Date;
}

export interface ThreatDetectionEvent {
  timestamp: string;
  eventType: string;
  details: any;
  riskScore: number;
  sourceIp?: string;
  userAgent?: string;
}

export interface RateLimitStatus {
  key: string;
  count: number;
  limit: number;
  resetTime: number;
  blocked: boolean;
}

// --- Certificate Pinning ---
export class CertificatePinning {
  private pinnedCertificates: Map<string, PinnedCertificate> = new Map();
  private trustedCAs: Set<string> = new Set([
    'DigiCert Inc', 'Let\'s Encrypt', 'GlobalSign', 'Comodo CA Limited', 'Sectigo Limited',
    'Entrust, Inc.', 'GoDaddy.com, Inc.', 'Network Solutions L.L.C.', 'Amazon', 'Google Trust Services', 'Microsoft Corporation'
  ]);
  private verificationCache: Map<string, { isValid: boolean; timestamp: number }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  async validateCertificate(url: string): Promise<boolean> {
    try {
      const domain = this.extractDomain(url);
      const cached = this.verificationCache.get(domain);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) return cached.isValid;
      const certificate = await this.fetchCertificate(url);
      const isValid = await this.verifyCertificate(certificate, domain);
      this.verificationCache.set(domain, { isValid, timestamp: Date.now() });
      return isValid;
    } catch {
      return false;
    }
  }
  private extractDomain(url: string): string { return new URL(url).hostname; }
  private async fetchCertificate(url: string): Promise<CertificateInfo> {
    // Simulate certificate fetch (real implementation would use TLS APIs)
    const domain = this.extractDomain(url);
    return {
      fingerprint: this.generateFingerprint(domain),
      issuer: 'Let\'s Encrypt',
      subject: `CN=${domain}`,
      validFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      validTo: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      serialNumber: this.generateSerialNumber()
    };
  }
  private generateFingerprint(domain: string): string {
    const hash = new TextEncoder().encode(domain);
    return Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
  }
  private generateSerialNumber(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
  }
  private async verifyCertificate(cert: CertificateInfo, domain: string): Promise<boolean> {
    const now = new Date();
    if (now < cert.validFrom || now > cert.validTo) return false;
    if (!this.trustedCAs.has(cert.issuer)) return false;
    const pinned = this.pinnedCertificates.get(domain);
    if (pinned) {
      if (!pinned.fingerprints.includes(cert.fingerprint)) return false;
      if (now > pinned.expiresAt) return false;
    }
    return this.isValidCertificateFormat(cert);
  }
  private isValidCertificateFormat(cert: CertificateInfo): boolean {
    if (!cert.fingerprint || !cert.issuer || !cert.subject) return false;
    const fingerprintRegex = /^[0-9A-F]{2}(:[0-9A-F]{2}){15}$/;
    if (!fingerprintRegex.test(cert.fingerprint)) return false;
    if (cert.validFrom >= cert.validTo) return false;
    return true;
  }
  pinCertificate(domain: string, fingerprints: string[], expiresAt: Date): void {
    this.pinnedCertificates.set(domain, { domain, fingerprints, lastVerified: new Date(), expiresAt });
  }
  unpinCertificate(domain: string): void { this.pinnedCertificates.delete(domain); }
  getPinnedCertificates(): Map<string, PinnedCertificate> { return new Map(this.pinnedCertificates); }
  clearCache(): void { this.verificationCache.clear(); }
}

// --- Threat Detection ---
export class ThreatDetectionEngine {
  private events: ThreatDetectionEvent[] = [];
  private riskThreshold = 7;
  logEvent(event: ThreatDetectionEvent): void {
    this.events.push(event);
    if (event.riskScore >= this.riskThreshold) {
      this.triggerAlert(event);
    }
  }
  analyzeBehavior(events: ThreatDetectionEvent[]): number {
    // Simple risk scoring: more failed logins, higher risk
    let score = 0;
    for (const e of events) {
      if (e.eventType === 'auth_failed') score += 3;
      if (e.eventType === 'rate_limit') score += 2;
      if (e.eventType === 'suspicious_pattern') score += 5;
    }
    return score;
  }
  triggerAlert(event: ThreatDetectionEvent): void {
    // Integrate with SIEM or alerting system
    // Silently handle security alerts in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
  }
  getRecentEvents(limit = 100): ThreatDetectionEvent[] {
    return this.events.slice(-limit);
  }
  clearEvents(): void { this.events = []; }
}

// --- Distributed Rate Limiting ---
export class DistributedRateLimiter {
  private limits: Map<string, RateLimitStatus> = new Map();
  private defaultLimit = 10;
  private windowMs = 60 * 1000; // 1 minute
  check(key: string): RateLimitStatus {
    const now = Date.now();
    let status = this.limits.get(key);
    if (!status || now > status.resetTime) {
      status = { key, count: 1, limit: this.defaultLimit, resetTime: now + this.windowMs, blocked: false };
    } else {
      status.count++;
      if (status.count > status.limit) status.blocked = true;
    }
    this.limits.set(key, status);
    return status;
  }
  setLimit(key: string, limit: number): void {
    const status = this.limits.get(key) || { key, count: 0, limit, resetTime: Date.now() + this.windowMs, blocked: false };
    status.limit = limit;
    this.limits.set(key, status);
  }
  reset(key: string): void { this.limits.delete(key); }
  clearAll(): void { this.limits.clear(); }
}