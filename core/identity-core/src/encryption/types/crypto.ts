// import { cryptoWorkerManager } from '../cryptoWorkerManager';
// Crypto Types and Interfaces
export interface CryptoConfig {
  algorithm: string;
  keyLength: number;
  hashAlgorithm: string;
  ellipticCurve: string;
  quantumResistant: boolean;
  hsmEnabled: boolean;
  keyRotationInterval: number;
  postQuantumEnabled: boolean;
  securityLevel: string;
}

export interface HSMConfig {
  enabled: boolean;
  provider: string;
  accessKey?: string;
  secretKey?: string;
  region?: string;
  keyId?: string;
  vaultName?: string;
}

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  keyId: string;
  algorithm: string;
  securityLevel: string;
  createdAt: string;
  expiresAt: string;
  quantumResistant: boolean;
  hsmProtected: boolean;
}

export interface EncryptedData {
  data: string;
  iv: string;
  tag: string;
  salt: string;
  keyId?: string;
  algorithm?: string;
  securityLevel?: string;
  quantumResistant?: boolean;
  hsmProtected?: boolean;
}

export interface SignatureResult {
  signature: string;
  publicKey: string;
  algorithm: string;
}

export interface SecurityEvent {
  timestamp: string;
  event: string;
  details: any;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface KeyStoreInfo {
  totalKeys: number;
  encryptionKeys: number;
  signingKeys: number;
  keyExchangeKeys: number;
  expiredKeys: number;
  quantumResistantKeys: number;
  hsmProtectedKeys: number;
}

export interface ComplianceReport {
  overallCompliance: boolean;
  issues: string[];
  recommendations: string[];
  lastAudit: string;
  quantumResistantStatus: string;
  hsmStatus: string;
}

export interface QuantumResistanceStatus {
  enabled: boolean;
  algorithms: string[];
  coverage: number;
  recommendations: string[];
}

export interface HSMStatus {
  enabled: boolean;
  provider: string;
  status: string;
  recommendations: string[];
}

export interface FailedAttempt {
  count: number;
  lastAttempt: number;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
}
