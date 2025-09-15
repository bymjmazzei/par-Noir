import { cryptoWorkerManager } from '../../cryptoWorkerManager';
// import { IdentityError, IdentityErrorCodes } from '../../../types';

// Add missing CryptoKeyPair interface
export interface CryptoKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface CryptoConfig {
  algorithm: '' | 'ChaCha20-Poly1305' | 'AES-256-CCM';
  keyLength: 256 | 384 | 512;
  hashAlgorithm: 'SHA-384' | 'SHA-512' | 'SHAKE256' | 'Keccak-256';
  ellipticCurve: 'P-384' | 'P-521' | 'BLS12-381';
  quantumResistant: boolean;
  keyRotationInterval: number; // in milliseconds
  postQuantumEnabled: boolean;
  securityLevel: 'standard' | 'military' | 'top-secret';
}

export interface EncryptedData {
  data: string;
  iv: string;
  tag: string;
  algorithm: string;
  keyId: string;
  timestamp: string;
  securityLevel: string;
  quantumResistant: boolean;
  hardwareBacked: boolean;
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
  hardwareBacked: boolean;
}

export interface HardwareConfig {
  enabled: boolean;
  useSecureEnclave: boolean;
  useTPM: boolean;
  useWebAuthn: boolean;
}

export interface HSMConfig {
  enabled: boolean;
  type: 'aws-kms' | 'azure-keyvault' | 'gcp-kms' | 'local-hsm';
  endpoint?: string;
  region?: string;
  credentials?: any;
  keyVault?: string;
  projectId?: string;
  location?: string;
}

export interface SignatureResult {
  signature: string;
  publicKey: string;
  algorithm: string;
  timestamp: string;
  keyId: string;
}

export interface SecurityEvent {
  timestamp: string;
  event: string;
  details: any;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
}

export interface KeyStoreInfo {
  totalKeys: number;
  hardwareBackedKeys: number;
  quantumResistantKeys: number;
  expiredKeys: number;
  lastRotation: string;
  nextRotation: string;
  securityLevel: string;
}

export interface ComplianceReport {
  fips140Level: string;
  quantumResistance: string;
  hardwareBacking: string;
  keyRotation: string;
  auditLogging: string;
  recommendations: string[];
}

export interface QuantumResistanceStatus {
  enabled: boolean;
  algorithms: string[];
  keySizes: number[];
  securityLevel: string;
  lastUpdated: string;
}

export interface HSMStatus {
  enabled: boolean;
  type: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastHealthCheck: string;
  errorCount: number;
  lastError?: string;
}

export interface FailedAttempt {
  userId: string;
  count: number;
  lastAttempt: number;
  lockedUntil?: number;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  riskScore: number;
}
