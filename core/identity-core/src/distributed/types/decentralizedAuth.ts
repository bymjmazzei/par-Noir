// Decentralized Auth Types and Interfaces
export interface AuthChallenge {
  did: string;
  challenge: string;
  timestamp: string;
  expiresAt: string;
}

export interface AuthSignature {
  challenge: string;
  signature: string;
  publicKey: string;
  timestamp: string;
}

export interface AuthSession {
  did: string;
  authenticatedAt: string;
  expiresAt: string;
  deviceId: string;
  permissions: string[];
}

export interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface AuditLogEntry {
  timestamp: string;
  event: string;
  details: any;
  userAgent: string;
}

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface EncryptedData {
  data: number[];
  iv: number[];
}
