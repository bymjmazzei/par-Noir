import { Identity } from '../../../types';
import { SyncResult } from '../../IdentitySync';
import { ZKProof } from '../../../encryption/zk-proofs';

export interface DistributedIdentityConfig {
  syncPassword?: string;
  deviceId?: string;
  enableIPFS?: boolean;
  enableBlockchain?: boolean;
  enableZKProofs?: boolean;
}

export interface IdentityOperation {
  type: 'create' | 'sync' | 'authenticate' | 'resolve' | 'zk_proof';
  did: string;
  timestamp: string;
  success: boolean;
  error?: string;
}

export interface SystemStatus {
  encryptionInitialized: boolean;
  deviceId: string;
  operationCount: number;
  lastOperation?: IdentityOperation;
  zkProofStats: ZKProofStats;
}

export interface ZKProofStats {
  totalProofs: number;
  activeProofs: number;
  expiredProofs: number;
}

export interface ExportData {
  identity: Identity;
  deviceId: string;
  exportedAt: string;
  version: string;
}

export interface DIDDocument {
  '@context': string[];
  id: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
  keyAgreement: string[];
  capabilityInvocation: string[];
  capabilityDelegation: string[];
  service: Service[];
  created: string;
  updated: string;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: any;
}

export interface Service {
  id: string;
  type: string;
  serviceEndpoint: string;
}
