import { cryptoWorkerManager } from './cryptoWorkerManager';
export interface DIDInfo {
  id: string;
  pnName: string;
  createdAt: string;
  status: string;
  displayName?: string;
  email?: string;
  nickname?: string;
  phone?: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
  custodiansRequired: boolean;
  custodiansSetup: boolean;
  profilePicture?: string; // URL or base64 data URI
  isEncrypted?: boolean; // Flag to indicate if this identity is encrypted
  fileContent?: string; // Store file content for encrypted identities
  publicKey?: string; // Public key for encrypted identities
  filePath?: string; // File path for PWA identity references
  fileName?: string; // File name for PWA identity references
  idFile?: any; // Complete ID file for PWA stored identities
}

export interface RecoveryCustodian {
  id: string;
  identityId: string;
  name: string;
  type: 'person' | 'service' | 'self';
  status: 'active' | 'pending' | 'inactive';
  addedAt: string;
  lastVerified?: string;
  canApprove: boolean;
  contactType: 'email' | 'phone';
  contactValue: string;
  publicKey: string; // Public key for ZK proof verification
  recoveryKeyShare?: string; // Encrypted share of the recovery key (custodian doesn't know the full key)
  trustLevel: 'high' | 'medium' | 'low';
  passcode?: string; // 6-digit numeric passcode for custodian acceptance
}

export interface RecoveryRequest {
  id: string;
  requestingDid: string;
  requestingUser: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  approvals: string[];
  denials: string[];
  signatures: string[]; // ZK proof signatures from custodians
  claimantContactType?: 'email' | 'phone';
  claimantContactValue?: string;
  expiresAt?: string;
  requiredApprovals?: number;
  currentApprovals?: number;
  oldIdentityHash?: string; // Hash of the old identity for license transfer
}

export interface RecoveryKey {
  id: string;
  identityId: string;
  keyData: string;
  createdAt: string;
  lastUsed?: string;
  purpose: 'personal' | 'legal' | 'insurance' | 'will';
  description?: string;
}

export interface SyncedDevice {
  id: string;
  name: string;
  type: 'mobile' | 'ktop' | 'tablet' | 'other';
  lastSync: string;
  status: 'active' | 'inactive';
  location?: string;
  ipAddress?: string;
  isPrimary: boolean; // New: marks the primary device
  deviceFingerprint: string; // New: unique device identifier
  syncKey: string; // New: encrypted key for device-to-device sync
  pairedAt: string; // New: when device was paired
}

export interface CustodianInvitationForm {
  name: string;
  contactType: 'email' | 'phone';
  contactValue: string;
  type: 'person' | 'service' | 'self';
  passcode: string;
}

export interface DeviceSyncData {
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'ktop' | 'tablet' | 'other';
  syncKey: string;
  identityId: string;
  expiresAt: string;
  qrCodeDataURL: string;
}

export interface ExportAuthData {
  passcode: string;
  pnName: string;
}

export interface TransferSetupData {
  passcode: string;
  deviceName: string;
}

export interface RecoveryData {
  pnName: string;
  nickname: string;
  emailOrPhone: string;
  passcode: string;
}

export interface CustodianInvitationData {
  invitationId: string;
  invitationCode: string;
  custodianName: string;
  custodianType: string;
  contactType: 'email' | 'phone';
  contactValue: string;
  expiresAt: number;
  identityName: string;
  identityUsername: string;
}

export interface DeepLinkData {
  invitationId: string;
  custodianName: string;
  custodianType: string;
  contactType: 'email' | 'phone';
  contactValue: string;
  identityName: string;
  identityUsername: string;
}

export interface OfflineSyncStatus {
  hasPending: boolean;
  pendingCount: number;
  lastSync: string;
}

export interface PWAState {
  isInstalled: boolean;
  isUpdateAvailable: boolean;
  isOffline: boolean;
  canInstall: boolean;
}

export interface PWAHandlers {
  install: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
}

export interface IdentityData {
  pnName: string;
  nickname?: string;
  email?: string;
  phone?: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
  custodiansRequired?: boolean;
}

export interface AuthSession {
  id: string;
  pnName: string;
  nickname: string;
  accessToken: string;
  expiresIn: number;
  authenticatedAt: string;
  publicKey: string;
}
