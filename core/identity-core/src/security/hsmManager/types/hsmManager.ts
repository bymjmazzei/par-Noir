// import { cryptoWorkerManager } from '../../../encryption/cryptoWorkerManager';
export interface HSMConfig {
  enabled: boolean;
  provider: 'aws-kms' | 'azure-keyvault' | 'gcp-kms' | 'local-hsm';
  region?: string;
  keyId?: string;
  accessKey?: string;
  secretKey?: string;
  endpoint?: string;
  fallbackToLocal: boolean;
}

export interface HSMKeyPair {
  keyId: string;
  publicKey: string;
  encryptedPrivateKey: string;
  provider: string;
  region: string;
  createdAt: string;
  expiresAt?: string;
  hsmProtected: boolean;
}

export interface HSMOperation {
  operation: 'encrypt' | 'decrypt' | 'sign' | 'verify' | 'generate';
  keyId: string;
  data?: string;
  algorithm?: string;
  timestamp: string;
  success: boolean;
  error?: string;
}

export interface HSMProvider {
  name: string;
  initialize(): Promise<boolean>;
  generateKeyPair(algorithm: string): Promise<HSMKeyPair>;
  sign(keyId: string, data: string, algorithm: string): Promise<string>;
  verify(keyId: string, data: string, signature: string, algorithm: string): Promise<boolean>;
  encrypt(keyId: string, data: string, algorithm: string): Promise<string>;
  decrypt(keyId: string, encryptedData: string, algorithm: string): Promise<string>;
  isConnected(): boolean;
}

export interface HSMConnectionStatus {
  provider: string;
  isConnected: boolean;
  lastConnected?: string;
  connectionErrors: string[];
  fallbackActive: boolean;
}

export interface HSMKeyInfo {
  keyId: string;
  algorithm: string;
  keySize: number;
  provider: string;
  region: string;
  createdAt: string;
  expiresAt?: string;
  usage: string[];
  status: 'active' | 'expired' | 'revoked' | 'pending';
}

export interface HSMOperationResult {
  success: boolean;
  result?: any;
  error?: string;
  operation: HSMOperation;
  timestamp: string;
  duration: number;
}

export interface HSMFallbackConfig {
  enabled: boolean;
  algorithms: string[];
  keyStorage: 'memory' | 'localStorage' | 'indexedDB';
  encryptionKey?: string;
}

export interface HSMHealthCheck {
  provider: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  lastCheck: string;
  errors: string[];
  warnings: string[];
}
