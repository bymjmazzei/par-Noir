import { cryptoWorkerManager } from './cryptoWorkerManager';
export interface SecureSession {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  data: any;
}

export interface TimestampedZKProof {
  proof: any;
  timestamp: string;
  signature: string;
}

export interface LicenseInfo {
  licenseKey: string;
  type: 'commercial' | 'enterprise';
  companyName: string;
  expiryDate: string;
  features: string[];
  maxUsers?: number;
  maxDataPoints?: number;
}

export interface StorageInterface {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  length(): Promise<number>;
}

export interface ZKPProofData {
  R: string;
  c: string;
  s: string;
}

export interface PedersenProofData {
  commitment: string;
  proof: string;
}

export interface AuthState {
  state: string;
  nonce: string;
  timestamp: number;
}

export interface TokenExchangeData {
  code: string;
  state: string;
  redirectUri: string;
}

export interface UserInfoData {
  id: string;
  email: string;
  displayName: string;
  [key: string]: any;
}
