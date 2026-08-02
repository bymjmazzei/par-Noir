import React, { useState, useEffect, lazy, useRef, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import Header from './components/Header';
import { QRCodeManager } from './utils/qrCode';
import { SecureStorage } from './utils/storage';
import { UnifiedAuth } from './components/UnifiedAuth';
import QRCode from 'qrcode';

import { IdentityCrypto, AuthSession, EncryptedIdentity } from '@par-noir/identity-crypto';

import { analytics } from './utils/analytics';
import { security } from './utils/security';
import usePWA from './hooks/usePWA';
import { GlobalPrivacySettings } from './types/privacy';
import { STANDARD_DATA_POINTS } from './types/standardDataPoints';
import { completeRecoveryWithShares, setPendingRecoveryShares } from './services/recoveryService';
import {
  initializeRecoveryVaultOnDrive,
  setPendingRecoverySharesBuffer,
} from './services/recoveryVaultService';
import { revokeRecoveryCustodian, acceptRecoveryCustodianship } from './services/recoveryApiService';
import { useRecoveryVaultState } from './hooks/useRecoveryVaultState';
import { useDeviceAuthState } from './hooks/useDeviceAuthState';
import { DEVICE_CAPABILITIES } from '@par-noir/device-auth';
import {
  authenticateDeviceBoundPn,
  checkDeviceBoundPnUnlockAvailable,
  createDeviceBoundPnExport,
  DEVICE_BOUND_PN_ERROR,
  isDeviceBoundPnEnvelope,
} from './services/deviceBoundPnService';
import { ownerFetch, ownerGet } from './services/ownerApiService';
import {
  getRecoveryAuthSession,
  recoveryAuthRequiredMessage,
} from './services/recoveryAuthSession';
import { storeCustodianshipCredential } from './services/recoveryCredentialStorage';
import type { RecoveryEnvelope } from '@par-noir/recovery-crypto';

import { MigrationManager, WebIdentityData, MigrationResult } from './utils/migration';

import * as BiometricAdapter from './utils/biometricAdapter';

import { cloudSyncManager } from './utils/cloudSync';
import { SecureMetadataStorage } from './utils/secureMetadataStorage';
import { notificationsService } from './utils/notificationsService';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { SessionDataMigration } from './utils/sessionDataMigration';
import { IntegrationCredentialManager } from './utils/integrationCredentialManager';
import { LicenseVerification } from './utils/licenseVerification';

import { InputValidator } from './utils/validation';
import { downloadFile } from './utils/helpers';
import { parsePortablePnBackup } from './utils/parsePortablePnBackup';
import { API_ENDPOINT } from './config/api';

import SimpleStorage, { SimpleIdentity } from './utils/simpleStorage';

import {
  listAllDelegations,
  revokeAssetDelegation,
  type AssetDelegation
} from './services/ownedAssetService';
import { ScreenProtection } from './utils/security/screenProtection';
import { ExtensionDetector } from './utils/security/extensionDetector';
import { ExtensionWarningBanner } from './components/security/ExtensionWarningBanner';
import { AuthenticatedShell } from './App/AuthenticatedShell';
import { AppModals } from './App/AppModals';
import { UnlockGate } from './App/UnlockGate';
import { generateRandomNickname } from './utils/randomNickname';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

// Custom hooks for state management
import { useAppState } from './hooks/useAppState';
import type { DIDInfo } from './types/app';
import { useIdentityState } from './hooks/useIdentityState';
import { usePrivacyState } from './hooks/usePrivacyState';
import { useExportState } from './hooks/useExportState';
import { useCustodianState } from './hooks/useCustodianState';
import { useMigrationState } from './hooks/useMigrationState';
import { usePushNotifications } from './hooks/usePushNotifications';
import { useApiToken } from './hooks/useApiToken';

// Lazy load heavy components
const BiometricSetup = lazy(() => import('./components/BiometricSetup').then(module => ({ default: module.BiometricSetup })));
const PWALockScreen = lazy(() => import('./components/PWALockScreen').then(module => ({ default: module.default })));

interface RecoveryCustodian {
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

interface RecoveryRequest {
  id: string;
  requestingDid: string;
  requestingUser: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  approvals: string[];
  denials: string[];
  signatures: string[]; // legacy alias; use proofs for Shamir approvals
  proofs?: string[];
  claimantContactType?: 'email' | 'phone';
  claimantContactValue?: string;
  expiresAt?: string;
  requiredApprovals?: number;
  currentApprovals?: number;
  oldIdentityHash?: string; // Hash of the old identity for license transfer
}

interface RecoveryKey {
  id: string;
  identityId: string;
  keyData: string;
  createdAt: string;
  lastUsed?: string;
  purpose: 'personal' | 'legal' | 'insurance' | 'will';
  description?: string;
}

interface SyncedDevice {
  id: string;
  name: string;
  type: 'mobile' | 'desktop' | 'tablet' | 'other';
  lastSync: string;
  status: 'active' | 'inactive';
  location?: string;
  ipAddress?: string;
  isPrimary: boolean; // New: marks the primary device
  deviceFingerprint: string; // New: unique device identifier
  syncKey: string; // New: encrypted key for device-to-device sync
  pairedAt: string; // New: when device was paired
}



interface CustodianInvitationForm {
  name: string;
  contactType: 'email' | 'phone';
  contactValue: string;
  type: 'person' | 'service' | 'self';
  passcode: string;
  unrevokable?: boolean;
}

interface DeviceSyncData {
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'other';
  syncKey: string;
  identityId: string;
  expiresAt: string;
  qrCodeDataURL: string;
}

// Generate secure access token for authentication
const generateSecureToken = async (identity: any): Promise<string> => {
  try {
    // Use crypto API to generate a secure random token
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const tokenBytes = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    
    // Create a secure token with identity info and timestamp
    const tokenData = {
      identityId: identity.id,
      pnName: identity.pnName,
      timestamp: Date.now(),
      random: tokenBytes
    };
    
    // Encode the token data
    const tokenString = btoa(JSON.stringify(tokenData));
    return `pn_${tokenString}`;
  } catch (error) {
    // Fallback to timestamp-based token if crypto fails
    const randomBytes = crypto.getRandomValues(new Uint8Array(8));
    const randomString = Array.from(randomBytes).map(b => b.toString(36)).join('').substring(0, 8);
    return `pn_${Date.now()}_${randomString}`;
  }
};

function App() {
  // Hide native splash screen when app is ready
  React.useEffect(() => {
    SplashScreen.hide().catch(() => {});
  }, []);

  // SECURITY: Migrate SimpleStorage from localStorage to IndexedDB on app start
  React.useEffect(() => {
    const migrateStorage = async () => {
      try {
        const simpleStorage = SimpleStorage.getInstance();
        await simpleStorage.migrateFromLocalStorage();
      } catch (error) {
        console.warn('[App] Storage migration failed:', error);
      }
    };
    migrateStorage();
  }, []);
  // Production-safe logging utility
  const logDebug = (_message: string, ..._args: unknown[]) => {
    // Silent in production - no logging
  };

  const logError = (message: string, ...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.error(message, ...args);
    }
  };

  // Use custom hooks for state management - MUST be declared before any functions that use these variables
  const appState = useAppState();
  const identityState = useIdentityState();
  const { apiToken, connectError, clearApiToken, ensureApiTokenAfterUnlock } = useApiToken();
  const privacyState = usePrivacyState();
  const exportState = useExportState();
  const custodianState = useCustodianState();
  const migrationState = useMigrationState();

  const [pendingRecoveryCompletion, setPendingRecoveryCompletion] = useState<{
    requestId: string;
    envelope: RecoveryEnvelope;
    existingIdentity: EncryptedIdentity;
    shares: import('@par-noir/recovery-crypto').ShamirShare[];
  } | null>(null);
  const [showRecoveryPasscodeModal, setShowRecoveryPasscodeModal] = useState(false);
  const [recoveredIdentityExport, setRecoveredIdentityExport] = useState<EncryptedIdentity | null>(null);

  // Destructure the most commonly used state for easier access
  const {
    storage,
    dids,
    setDids,
    loading,
    setLoading,
    error,
    setError,
    success,
    setSuccess: setSuccessWithTimeout,
    showSuccessMessage,
    showErrorMessage,
    activeTab,
    setActiveTab,
    showCreateForm,
    setShowCreateForm,
    showImportForm,
    setShowImportForm,
    importForm,
    setImportForm,
    selectedDID,
    setSelectedDID,
    isDemoMode,
    setIsDemoMode,
    globalSettingsExpanded,
    setGlobalSettingsExpanded,
    thirdPartyExpanded,
    setThirdPartyExpanded,
    attestedDataPoints,
    setAttestedDataPoints,
    verifiedDataPoints,
    setVerifiedDataPoints,
    showVerificationModal,
    setShowVerificationModal,
    pwaState,
    pwaHandlers,
    isPWALocked,
    setIsPWALocked,
    successTimeoutRef
  } = appState;

  // Destructure identity state from custom hook
  const {
    authenticatedUser,
    setAuthenticatedUser,
    showRecoveryModal,
    setShowRecoveryModal,
    showAddCustodianModal,
    setShowAddCustodianModal,
    showDataPointInputModal,
    setShowDataPointInputModal,
    currentDataPoint,
    setCurrentDataPoint,
    currentDataPointExistingData,
    setCurrentDataPointExistingData,
    showRecoveryKeyModal,
    setShowRecoveryKeyModal,
    showRecoveryKeyInputModal,
    setShowRecoveryKeyInputModal,
    custodianQRCode,
    setCustodianQRCode,
    custodianContactInfo,
    setCustodianContactInfo,
    recoveryThreshold,
    setRecoveryThreshold,
    custodians,
    setCustodians,
    recoveryRequests,
    setRecoveryRequests,
    recoveryKeys,
    setRecoveryKeys
  } = identityState;

  const [recoveryVaultPnId, setRecoveryVaultPnId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!authenticatedUser?.publicKey) {
      setRecoveryVaultPnId(null);
      return;
    }
    void (async () => {
      const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
      const creds = SecureCredentialManager.getCredentials(authenticatedUser.id);
      if (creds?.pnName && creds.passcode) {
        const pn = await VolumeIdGenerator.generateVolumeId({
          pnName: creds.pnName,
          passcode: creds.passcode,
          publicKey: authenticatedUser.publicKey,
        });
        if (!cancelled) setRecoveryVaultPnId(pn);
      } else {
        const canonical = await VolumeIdGenerator.generateCanonicalVolumeId(authenticatedUser.publicKey);
        if (!cancelled) setRecoveryVaultPnId(canonical);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticatedUser?.id, authenticatedUser?.publicKey]);

  const [recoveryAuthVersion, setRecoveryAuthVersion] = React.useState(0);
  const recoveryMutationAllowed = React.useMemo(
    () => Boolean(getRecoveryAuthSession()),
    [recoveryAuthVersion]
  );
  const bumpRecoveryAuthUi = React.useCallback(() => {
    setRecoveryAuthVersion((v) => v + 1);
  }, []);

  const deviceAuth = useDeviceAuthState({
    apiToken,
    userPnIdentifier: recoveryVaultPnId,
  });

  const canManageCustodians = deviceAuth.can(DEVICE_CAPABILITIES.recoveryCustodianManage);
  const canExportIdentity = deviceAuth.can(DEVICE_CAPABILITIES.identityExport);
  const canRotateIdentity = deviceAuth.can(DEVICE_CAPABILITIES.identityMigrate);
  const canProfileWrite = deviceAuth.can(DEVICE_CAPABILITIES.profileWrite);
  const canProfileRead = deviceAuth.can(DEVICE_CAPABILITIES.profileRead);
  const canDriveRead = deviceAuth.can(DEVICE_CAPABILITIES.driveRead);
  const canDriveUpload = deviceAuth.can(DEVICE_CAPABILITIES.driveUpload);
  const canCustodiansRead = deviceAuth.can(DEVICE_CAPABILITIES.custodiansRead);

  const { summary: recoveryVaultSummary, recoveryReady: vaultRecoveryReady, refresh: refreshRecoveryVault } =
    useRecoveryVaultState({
      apiToken,
      userPnIdentifier: recoveryVaultPnId,
      recoveryThreshold,
      enabled: canCustodiansRead,
    });

  const getEncryptedIdentityForApiToken = React.useCallback(
    async (
      identityPublicKeyOrId: string | undefined
    ): Promise<{ encryptedData: string; iv: string; salt: string } | null> => {
      if (!identityPublicKeyOrId) return null;

      // First try SecureStorage path used by newer dashboard flows.
      const secureIdentity = await storage.getIdentity(identityPublicKeyOrId);
      if (secureIdentity?.encryptedData && secureIdentity.iv && secureIdentity.salt) {
        return {
          encryptedData: secureIdentity.encryptedData,
          iv: secureIdentity.iv,
          salt: secureIdentity.salt
        };
      }

      // Fallback to SimpleStorage path (publicKey/id keyed) used in active unlock/create flows.
      const simpleStorage = SimpleStorage.getInstance();
      const simpleIdentity = await simpleStorage.getIdentity(identityPublicKeyOrId);
      const encrypted = simpleIdentity?.encryptedData as
        | { encryptedData?: string; iv?: string; salt?: string }
        | undefined;

      if (encrypted?.encryptedData && encrypted.iv && encrypted.salt) {
        return {
          encryptedData: encrypted.encryptedData,
          iv: encrypted.iv,
          salt: encrypted.salt
        };
      }

      return null;
    },
    [storage]
  );
  const apiTokenAttemptedForUserRef = React.useRef<string | null>(null);

  const ensureOwnerApiTokenForActiveUser = React.useCallback(async (): Promise<string | null> => {
    if (!authenticatedUser?.id) return null;
    const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
    if (!credentials) return null;

    const identityKey = authenticatedUser.publicKey || authenticatedUser.id;
    let encryptedIdentity = await getEncryptedIdentityForApiToken(identityKey);
    if (!encryptedIdentity && authenticatedUser.publicKey && authenticatedUser.publicKey !== authenticatedUser.id) {
      encryptedIdentity = await getEncryptedIdentityForApiToken(authenticatedUser.id);
    }
    if (!encryptedIdentity) return null;

    return ensureApiTokenAfterUnlock({
      encryptedIdentity,
      publicKey: authenticatedUser.publicKey || identityKey,
      did: authenticatedUser.id,
      pnName: credentials.pnName,
      passcode: credentials.passcode,
    });
  }, [authenticatedUser, ensureApiTokenAfterUnlock, getEncryptedIdentityForApiToken]);

  // Push notifications (native only): register when authenticated
  usePushNotifications({
    getAccessToken: useCallback(async () => authenticatedUser?.accessToken ?? null, [authenticatedUser?.accessToken]),
  });

  React.useEffect(() => {
    if (!authenticatedUser?.id) {
      apiTokenAttemptedForUserRef.current = null;
      return;
    }
    // Re-acquire per active identity: a stale apiToken may belong to a previously unlocked pN.
    // ensureApiTokenAfterUnlock validates the token's pN and re-mints if it differs.
    if (apiTokenAttemptedForUserRef.current === authenticatedUser.id) return;

    const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
    if (!credentials) return;

    apiTokenAttemptedForUserRef.current = authenticatedUser.id;
    let cancelled = false;

    void (async () => {
      try {
        const identityKey = authenticatedUser.publicKey || authenticatedUser.id;
        let encryptedIdentity = await getEncryptedIdentityForApiToken(identityKey);
        if (!encryptedIdentity && authenticatedUser.publicKey && authenticatedUser.publicKey !== authenticatedUser.id) {
          encryptedIdentity = await getEncryptedIdentityForApiToken(authenticatedUser.id);
        }
        if (!encryptedIdentity) return;

        await ensureApiTokenAfterUnlock({
          encryptedIdentity,
          publicKey: authenticatedUser.publicKey || identityKey,
          did: authenticatedUser.id,
          pnName: credentials.pnName,
          passcode: credentials.passcode
        });
      } finally {
        if (cancelled) return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authenticatedUser, apiToken, ensureApiTokenAfterUnlock, getEncryptedIdentityForApiToken]);

  // Destructure privacy state from custom hook
  const {
    showEnhancedPrivacyPanel,
    setShowEnhancedPrivacyPanel,
    privacySettings,
    setPrivacySettings,
    showSessionManager,
    setShowSessionManager,
    showToolSettingsModal,
    setShowToolSettingsModal,
    selectedToolId,
    setSelectedToolId,
    showIntegrationSettings,
    setShowIntegrationSettings,
    showDataPointProposalModal,
    setShowDataPointProposalModal
  } = privacyState;
  const subPnAvailableScopes = React.useMemo(
    () =>
      Object.entries(privacySettings.dataPoints).map(([key, dp]) => ({
        key,
        label: dp.label,
        description: dp.description,
        enabled: dp.globalSetting
      })),
    [privacySettings.dataPoints]
  );

  // Destructure migration state from custom hook
  const {
    showMigrationModal,
    setShowMigrationModal,
    pendingMigrations,
    setPendingMigrations,
    migrationChecked,
    setMigrationChecked,
    showIntegrationDebugger,
    setShowIntegrationDebugger,
    custodianships,
    setCustodianships,
    recoveryKeyInput,
    setRecoveryKeyInput,
    activeRecoveryMethod,
    setActiveRecoveryMethod,
    recoveryKeyContactInfo,
    setRecoveryKeyContactInfo,
    licenseKey,
    setLicenseKey,
    licenseInfo,
    setLicenseInfo,
    licenseProof,
    setLicenseProof,
    currentDevice,
    setCurrentDevice,
    showRecoveryCompleteModal,
    setShowRecoveryCompleteModal,
    recoveredDID,
    setRecoveredDID,
    showCustodianApprovalModal,
    setShowCustodianApprovalModal,
    selectedRecoveryRequest,
    setSelectedRecoveryRequest,
    selectedCustodianship,
    setSelectedCustodianship,
    showCustodianInvitationModal,
    setShowCustodianInvitationModal,
    pendingCustodianInvitation,
    setPendingCustodianInvitation
  } = migrationState;

  const [networkIdentityRetired, setNetworkIdentityRetired] = React.useState(false);

  React.useEffect(() => {
    setNetworkIdentityRetired(false);
    if (!authenticatedUser?.id || !authenticatedUser?.publicKey) return;
    let cancelled = false;
    (async () => {
      try {
        const creds = SecureCredentialManager.getCredentials(authenticatedUser.id);
        if (!creds?.pnName || !creds?.passcode) return;
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        const pn = await VolumeIdGenerator.generateVolumeId({
          pnName: creds.pnName,
          passcode: creds.passcode,
          publicKey: authenticatedUser.publicKey
        });
        const res = await fetch(
          `${API_ENDPOINT}/api/v1/identity/successor?pn_identifier=${encodeURIComponent(pn)}`
        );
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as { revoked?: boolean };
        if (j.revoked && !cancelled) setNetworkIdentityRetired(true);
      } catch {
        /* offline or API error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticatedUser?.id, authenticatedUser?.publicKey]);

  // Destructure custodian state from custom hook
  const {
    showDeviceInfoModal,
    setShowDeviceInfoModal,
    showUnlockFromUsbModal,
    setShowUnlockFromUsbModal,
    showUnlockFromNfcModal,
    setShowUnlockFromNfcModal,
    hasNfcSupport,
    showSendInvitationModal,
    setShowSendInvitationModal,
    selectedCustodianForInvitation,
    setSelectedCustodianForInvitation,
    createForm,
    setCreateForm,
    createStep,
    setCreateStep,
    showPNName,
    setShowPNName,
    showPasscode,
    setShowPasscode,
    showConfirmPNName,
    setShowConfirmPNName,
    showConfirmPasscode,
    setShowConfirmPasscode,
    showCreatePasscode,
    setShowCreatePasscode,
    showCreateConfirmPasscode,
    setShowCreateConfirmPasscode,
    showCreateNickname,
    setShowCreateNickname,
    showCreateEmail,
    setShowCreateEmail,
    showCreatePhone,
    setShowCreatePhone,
    showUnlockPasscode,
    setShowUnlockPasscode,
    showUnlockNickname,
    setShowUnlockNickname,
    showUnlockEmail,
    setShowUnlockEmail,
    showUnlockPhone,
    setShowUnlockPhone,
    
    // Main form visibility
    showMainPNName,
    setShowMainPNName,
    showMainPasscode,
    setShowMainPasscode,
    unlockForm,
    setUnlockForm,
    mainForm,
    setMainForm,
    recoveryKeyForm,
    setRecoveryKeyForm,
    selectedStoredIdentity,
    setSelectedStoredIdentity,
    showIdentitySelector,
    setShowIdentitySelector,
    showOnboardingWizard,
    setShowOnboardingWizard,
    isNewUser,
    setIsNewUser,
    showProfilePictureEditor,
    setShowProfilePictureEditor,
    showNicknameEditor,
    setShowNicknameEditor,
    editingNickname,
    setEditingNickname,
    showRecoveryInfo,
    setShowRecoveryInfo,
    showCustodianInfo,
    setShowCustodianInfo,
    showCustodianAcceptanceModal,
    setShowCustodianAcceptanceModal,
    pendingCustodianInvitationData,
    setPendingCustodianInvitationData,
    custodianAcceptanceData,
    setCustodianAcceptanceData,
    showBiometricModal,
    setShowBiometricModal,
    biometricAvailable,
    setBiometricAvailable,
    biometricEnabled,
    setBiometricEnabled
  } = custodianState;

  // Destructure export state from custom hook
  const {
    showExportModal,
    setShowExportModal,
    showExportAuthModal,
    setShowExportAuthModal,
    showExportOptionsModal,
    setShowExportOptionsModal,
    showExportToUsbModal,
    setShowExportToUsbModal,
    identityForUsbExport,
    setIdentityForUsbExport,
    showExportToNfcModal,
    setShowExportToNfcModal,
    identityForNfcExport,
    setIdentityForNfcExport,
    pendingExportAction,
    setPendingExportAction,
    exportAuthData,
    setExportAuthData,
    showExportPasscode,
    setShowExportPasscode,
    showExportPnName,
    setShowExportPnName,
    showTransferReceiver,
    setShowTransferReceiver,
    showTermsOfService,
    setShowTermsOfService,
    showPrivacyPolicy,
    setShowPrivacyPolicy,
    showDmcaPolicy,
    setShowDmcaPolicy,
    showTransferSetupModal,
    setShowTransferSetupModal,
    transferUrl,
    setTransferUrl,
    showDelegationModal,
    setShowDelegationModal,
    activeDelegations,
    setActiveDelegations,
    transferId,
    setTransferId,
    transferPasscode,
    setTransferPasscode,
    transferCreated,
    setTransferCreated
  } = exportState;

  

  

  

  

  

  

  
  // Open export options directly (auth happens when user picks an option that needs it)
  const handleExportData = async () => {
    if (!canExportIdentity) {
      setError(deviceAuth.deviceRequiredMessage);
      setTimeout(() => setError(null), 9000);
      return;
    }
    setShowExportOptionsModal(true);
  };

  // Handle export authentication (shown when user picks USB/NFC and we don't have creds)
  const handleExportAuth = async () => {
    try {
      if (!authenticatedUser || !selectedDID) {
        throw new Error('No identity is currently unlocked. Please unlock an identity first.');
      }
      
      // Get the stored identity data that was used for unlock
      const simpleStorage = SimpleStorage.getInstance();
      const identityKey = authenticatedUser.publicKey || selectedDID?.publicKey || selectedDID?.id;
      const currentIdentity = await simpleStorage.getIdentity(identityKey);
      
      if (!currentIdentity) {
        throw new Error('Identity not found in storage. Please unlock your identity again.');
      }

      // Use the same authentication logic as the unlock function
      // This re-authenticates using the stored encrypted identity data
      const identityToUnlock = currentIdentity.encryptedData;
      
      if (!identityToUnlock.encryptedData || !identityToUnlock.iv || !identityToUnlock.salt) {
        throw new Error('Invalid identity data structure');
      }

      // Authenticate using the same crypto function as unlock
      const authSession = await IdentityCrypto.authenticateIdentity(
        identityToUnlock as any,
        exportAuthData.passcode,
        exportAuthData.pnName
      );

      // Authentication successful
      setShowExportAuthModal(false);
      setExportAuthData(exportAuthData); // ensure state is updated
      if (pendingExportAction === 'download') {
        setPendingExportAction(null);
        handleDownloadExport();
      } else if (pendingExportAction === 'usb') {
        setPendingExportAction(null);
        handleExportToUsb();
      } else if (pendingExportAction === 'nfc') {
        setPendingExportAction(null);
        handleExportToNfc();
      } else if (pendingExportAction === 'device-bound') {
        setPendingExportAction(null);
        handleDeviceBoundDownload();
      } else {
        setShowExportOptionsModal(true);
      }
    } catch (error: any) {
      setError(error.message || 'Authentication failed');
      setTimeout(() => setError(null), 9000);
    }
  };

  // Handle direct download export (always requires verification - never use cached creds)
  const handleDownloadExport = async () => {
    if (!canExportIdentity) {
      setError(deviceAuth.deviceRequiredMessage);
      setTimeout(() => setError(null), 9000);
      return;
    }
    if (!exportAuthData.pnName || !exportAuthData.passcode) {
      setPendingExportAction('download');
      setShowExportOptionsModal(false);
      setShowExportAuthModal(true);
      return;
    }
    try {
      await storage.init();
      
      if (!authenticatedUser || !selectedDID) {
        throw new Error('No identity is currently unlocked.');
      }
      
      const identityKey = authenticatedUser.publicKey || selectedDID?.publicKey || selectedDID?.id;
      const simpleStorage = SimpleStorage.getInstance();
      const currentIdentity = await simpleStorage.getIdentity(identityKey);
      
      if (!currentIdentity) {
        throw new Error('Identity not found in storage.');
      }
      
      const identityToExport = currentIdentity.encryptedData;
      
      if (!identityToExport.encryptedData || !identityToExport.iv || !identityToExport.salt) {
        throw new Error('Invalid encrypted data structure');
      }
      
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        identities: [identityToExport]
      };
      const exportedData = JSON.stringify(exportData, null, 2);
      
      let filename = 'identity-backup.pn';
      try {
        let nickname = 'identity';
        if (authenticatedUser && authenticatedUser.nickname) {
          nickname = authenticatedUser.nickname;
        }
        
        const cleanNickname = nickname
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase()
          .substring(0, 20);
        
        filename = `${cleanNickname}-backup.json`;
      } catch (parseError) {
        logError('Parse error:', parseError);
      }
      
      const blob = new Blob([exportedData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      
      setShowExportOptionsModal(false);
      setShowExportAuthModal(false);
      showSuccessMessage('pN file downloaded successfully');
      
    } catch (error: any) {
      setError(error.message || 'Download failed');
      setTimeout(() => setError(null), 9000);
    }
  };

  const handleExportDeviceBound = async () => {
    if (!canExportIdentity) {
      setError(deviceAuth.deviceRequiredMessage);
      setTimeout(() => setError(null), 9000);
      return;
    }
    if (!deviceAuth.isKeyedSession || !deviceAuth.localDeviceId) {
      setError('Device-bound export requires this browser to be keyed to your identity.');
      setTimeout(() => setError(null), 9000);
      return;
    }
    if (!exportAuthData.pnName || !exportAuthData.passcode) {
      setPendingExportAction('device-bound');
      setShowExportOptionsModal(false);
      setShowExportAuthModal(true);
      return;
    }
    await handleDeviceBoundDownload();
  };

  const handleDeviceBoundDownload = async () => {
    if (!canExportIdentity || !deviceAuth.isKeyedSession || !deviceAuth.localDeviceId) {
      setError(deviceAuth.deviceRequiredMessage);
      setTimeout(() => setError(null), 9000);
      return;
    }
    try {
      await storage.init();

      if (!authenticatedUser || !selectedDID || !recoveryVaultPnId) {
        throw new Error('No identity is currently unlocked.');
      }

      const identityKey = authenticatedUser.publicKey || selectedDID?.publicKey || selectedDID?.id;
      const simpleStorage = SimpleStorage.getInstance();
      const currentIdentity = await simpleStorage.getIdentity(identityKey);

      if (!currentIdentity) {
        throw new Error('Identity not found in storage.');
      }

      const identityToExport = currentIdentity.encryptedData;

      if (!identityToExport.encryptedData || !identityToExport.iv || !identityToExport.salt) {
        throw new Error('Invalid encrypted data structure');
      }

      const exportData = await createDeviceBoundPnExport({
        pnIdentifier: recoveryVaultPnId,
        deviceId: deviceAuth.localDeviceId,
        identityToExport: {
          encryptedData: identityToExport.encryptedData,
          iv: identityToExport.iv,
          salt: identityToExport.salt,
          publicKey: currentIdentity.publicKey ?? identityToExport.publicKey,
        },
        pnName: exportAuthData.pnName,
        passcode: exportAuthData.passcode,
        nickname: authenticatedUser.nickname,
      });

      const exportedData = JSON.stringify(exportData, null, 2);

      let filename = 'identity-device-bound.pn.json';
      try {
        const nickname = authenticatedUser.nickname || 'identity';
        const cleanNickname = nickname
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase()
          .substring(0, 20);
        filename = `${cleanNickname}-device-bound.pn.json`;
      } catch {
        // keep default filename
      }

      const blob = new Blob([exportedData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setShowExportOptionsModal(false);
      setShowExportAuthModal(false);
      showSuccessMessage('Device-bound pN file downloaded successfully');
    } catch (error: any) {
      setError(error.message || 'Device-bound download failed');
      setTimeout(() => setError(null), 9000);
    }
  };

  // Handle export to NFC - open modal directly; pN + passcode collected as last step before write
  const handleExportToNfc = async () => {
    if (!canExportIdentity) {
      setError(deviceAuth.deviceRequiredMessage);
      setTimeout(() => setError(null), 9000);
      return;
    }
    try {
      if (!authenticatedUser || !selectedDID) {
        throw new Error('No identity is currently unlocked.');
      }
      const identityKey = authenticatedUser.publicKey || selectedDID?.publicKey || selectedDID?.id;
      const simpleStorage = SimpleStorage.getInstance();
      const currentIdentity = await simpleStorage.getIdentity(identityKey);
      if (!currentIdentity) {
        throw new Error('Identity not found in storage.');
      }
      const identityToExport = currentIdentity.encryptedData;
      if (!identityToExport?.encryptedData && !(identityToExport as any)?.encrypted) {
        throw new Error('Invalid encrypted data structure');
      }
      setIdentityForNfcExport({
        encryptedData: (identityToExport as any).encryptedData ?? (identityToExport as any).encrypted,
        iv: (identityToExport as any).iv,
        salt: (identityToExport as any).salt,
        publicKey: currentIdentity.publicKey ?? (identityToExport as any).publicKey,
      });
      setShowExportOptionsModal(false);
      setShowExportToNfcModal(true);
    } catch (error: any) {
      setError(error.message || 'Failed to prepare NFC export');
      setTimeout(() => setError(null), 9000);
    }
  };

  // Handle export to USB - open modal directly; pN + passcode collected as last step before write
  const handleExportToUsb = async () => {
    if (!canExportIdentity) {
      setError(deviceAuth.deviceRequiredMessage);
      setTimeout(() => setError(null), 9000);
      return;
    }
    try {
      if (!authenticatedUser || !selectedDID) {
        throw new Error('No identity is currently unlocked.');
      }
      const identityKey = authenticatedUser.publicKey || selectedDID?.publicKey || selectedDID?.id;
      const simpleStorage = SimpleStorage.getInstance();
      const currentIdentity = await simpleStorage.getIdentity(identityKey);
      if (!currentIdentity) {
        throw new Error('Identity not found in storage.');
      }
      const identityToExport = currentIdentity.encryptedData;
      if (!identityToExport?.encryptedData && !(identityToExport as any)?.encrypted) {
        throw new Error('Invalid encrypted data structure');
      }
      setIdentityForUsbExport({
        encryptedData: (identityToExport as any).encryptedData ?? (identityToExport as any).encrypted,
        iv: (identityToExport as any).iv,
        salt: (identityToExport as any).salt,
        publicKey: currentIdentity.publicKey ?? (identityToExport as any).publicKey,
      });
      setShowExportOptionsModal(false);
      setShowExportToUsbModal(true);
    } catch (error: any) {
      setError(error.message || 'Failed to prepare USB export');
      setTimeout(() => setError(null), 9000);
    }
  };

  // Handle Bluetooth transfer export
  const handleTransfer = async () => {
    try {
      if (!authenticatedUser || !selectedDID) {
        throw new Error('No identity is currently unlocked.');
      }

      // Show transfer setup modal to get transfer passcode
      setShowTransferSetupModal(true);
      
    } catch (error: any) {
      setError(error.message || 'Transfer failed to start');
      setTimeout(() => setError(null), 9000);
    }
  };

  const handleTransferSetup = async () => {
    try {
      if (!transferPasscode || transferPasscode.length < 4) {
        throw new Error('Transfer passcode must be at least 4 characters.');
      }

      // Generate short transfer ID
      // Generate secure random transfer ID
      const randomArray = new Uint8Array(4);
      crypto.getRandomValues(randomArray);
      const transferId = Array.from(randomArray, byte => byte.toString(36)).join('').substring(0, 6).toUpperCase();
      
      // Get the current identity data for transfer
      const simpleStorage = SimpleStorage.getInstance();
      const identityKey = authenticatedUser.publicKey || selectedDID?.publicKey || selectedDID?.id;
      const currentIdentity = await simpleStorage.getIdentity(identityKey);
      
      if (!currentIdentity) {
        throw new Error('Identity not found in storage.');
      }

      // Get the encrypted identity data for transfer (same format as export)
      const identityToTransfer = currentIdentity.encryptedData;
      
      if (!identityToTransfer.encryptedData || !identityToTransfer.iv || !identityToTransfer.salt) {
        throw new Error('Invalid encrypted data structure');
      }

      // Create the proper backup format (same as export function) — embedded in URL (no IPFS)
      const transferFileContent = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        identities: [identityToTransfer]
      };

      const transferData = {
        id: transferId,
        ipfsCid: `direct-transfer-${transferId}`,
        nickname: authenticatedUser.nickname || 'Transferred pN',
        transferPasscode: transferPasscode,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
        directData: transferFileContent
      };

      // Encode transfer data for URL parameters (cross-device compatible)
      const transferDataEncoded = btoa(JSON.stringify(transferData));

      // Generate transfer URL with encoded data
      const transferUrl = `${window.location.origin}/transfer/id=${transferId}?data=${transferDataEncoded}`;
      
      // Show transfer URL and QR code
      setTransferUrl(transferUrl);
      setTransferId(transferId);
      setTransferPasscode('');
      setTransferCreated(true);
      
      // Generate QR code
      setTimeout(() => {
        generateQRCode(transferUrl);
      }, 100);
      
    } catch (error: any) {
      setError(error.message || 'Transfer setup failed');
      setTimeout(() => setError(null), 9000);
    }
  };
  
  // Load third-party permissions from Google Drive
  useEffect(() => {
    const loadThirdPartyPermissions = async () => {
      if (!authenticatedUser?.id) return;

      try {
        const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
        if (!credentials) {
          console.warn('[App] Cannot load permissions - credentials not available');
          return;
        }

        const authToken = authenticatedUser.accessToken || authenticatedUser.authToken;
        if (!authToken) {
          console.warn('[App] Cannot load permissions - no auth token');
          return;
        }

        // Get pN identifier
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        const pnIdentifier = await VolumeIdGenerator.generateVolumeId({
          pnName: credentials.pnName,
          passcode: credentials.passcode,
          publicKey: authenticatedUser.publicKey || ''
        });

        // Load permissions from API (Google Drive)
        const response = await ownerGet(
          authToken,
          `/api/users/${pnIdentifier}/third-party-permissions`
        );

        if (response.ok) {
          const { permissions } = await response.json();
          if (permissions && Object.keys(permissions).length > 0) {
            setPrivacySettings(prev => {
              const mergedPermissions: Record<string, any> = { ...permissions };
              
              // Ensure browser-app always has static required/optional data points
              // These are defined by the third party and never change
              if (mergedPermissions['browser-app']) {
                mergedPermissions['browser-app'] = {
                  ...mergedPermissions['browser-app'],
                  // Static: These are always the same, defined by browser-app
                  requiredDataPoints: [], // No required data points for browser
                  optionalDataPoints: ['age_attestation'], // Age is always optional
                  // dataPoints array reflects what user has granted (can change)
                };
              } else {
                // Initialize if not present
                mergedPermissions['browser-app'] = {
                  toolName: 'par Noir Browser',
                  toolDescription: 'Official par Noir browser application for browsing and discovering encrypted content',
                  permissions: ['openid', 'profile', 'zkp:age_attestation', 'cloud:read'],
                  dataPoints: [],
                  requiredDataPoints: [], // Static
                  optionalDataPoints: ['age_attestation'], // Static
                  grantedAt: new Date().toISOString(),
                  status: 'active' as const
                };
              }
              
              return {
                ...prev,
                toolPermissions: {
                  ...prev.toolPermissions,
                  ...mergedPermissions
                }
              };
            });
            console.log('[App] Loaded third-party permissions from Google Drive:', Object.keys(permissions));
          }
        } else if (response.status !== 404) {
          console.warn('[App] Failed to load permissions:', response.status);
        }
      } catch (error) {
        console.error('[App] Error loading third-party permissions:', error);
      }
    };

    loadThirdPartyPermissions();
  }, [authenticatedUser?.id]);

  // Initialize browser-app tool permissions (hard-coded pN owned third party)
  // Always initialize browser-app - it's a pN owned platform
  // Static required/optional data points are always present regardless of user choices
  useEffect(() => {
    if (authenticatedUser?.id) {
      setPrivacySettings(prev => {
        const existingBrowserApp = prev.toolPermissions['browser-app'];
        
        // Always ensure browser-app has static required/optional data points
        // These are defined by the third party and never change
        const browserAppPermission = {
          toolName: 'par Noir Browser',
          toolDescription: 'Official par Noir browser application for browsing and discovering encrypted content',
          permissions: ['openid', 'profile', 'zkp:age_attestation', 'cloud:read'],
          dataPoints: existingBrowserApp?.dataPoints || [], // User's granted permissions (can change)
          requiredDataPoints: [], // Static: No required data points for browser
          optionalDataPoints: ['age_attestation'], // Static: Age is always optional
          grantedAt: existingBrowserApp?.grantedAt || new Date().toISOString(),
          status: 'active' as const
        };
        
        return {
          ...prev,
          toolPermissions: {
            ...prev.toolPermissions,
            'browser-app': browserAppPermission
          },
          dataPoints: {
            ...prev.dataPoints,
            'age_attestation': {
              label: 'Age',
              description: 'Attest to your age for age-restricted services',
              category: 'verification' as const,
              requestedBy: ['browser-app'],
              globalSetting: true,
              lastUpdated: new Date().toISOString()
            }
          }
        };
      });
    }
  }, [authenticatedUser?.id]);
  
  // Load attested data points from metadata
  useEffect(() => {
    const loadAttestedDataPoints = async () => {
      try {
        if (authenticatedUser?.id) {
          console.log('[App] Loading attested data points for user:', authenticatedUser.id);
          
          // First, verify data is in localStorage
          try {
            const rawStorage = localStorage.getItem('secure_metadata');
            if (rawStorage) {
              const parsed = JSON.parse(rawStorage);
              const hasUserData = !!parsed[authenticatedUser.id];
              console.log('[App] localStorage check:', {
                hasSecureMetadata: !!rawStorage,
                hasUserData,
                allUserIds: Object.keys(parsed || {})
              });
            } else {
              console.log('[App] No secure_metadata in localStorage');
            }
          } catch (e) {
            console.warn('[App] Error checking localStorage:', e);
          }
          
          // Load attested data points from API server (Google Drive) - NO localStorage
            const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
            if (!credentials) {
            console.warn('[App] Credentials not available');
            setAttestedDataPoints(new Set());
              return;
            }
            
          const authToken = authenticatedUser.accessToken || authenticatedUser.authToken;
          if (!authToken) {
            console.warn('[App] No access token available');
            setAttestedDataPoints(new Set());
            return;
          }

          try {
            const { ZKPDataPointsService } = await import('./utils/zkpDataPointsService');
            const dataPointIds = await ZKPDataPointsService.getAllDataPoints(
              authenticatedUser.id,
              credentials,
              authToken,
              authenticatedUser.publicKey
            );

            console.log('[App] Loaded attested data points from API:', dataPointIds);
            setAttestedDataPoints(new Set(dataPointIds));
          } catch (error) {
            console.error('[App] Error loading attested data points from API:', error);
            setAttestedDataPoints(new Set()); // Clear on error
          }
        } else {
          console.log('[App] No authenticated user, clearing attested data points');
          setAttestedDataPoints(new Set());
        }
      } catch (error) {
        console.error('[App] Error loading attested data points:', error);
        console.error('[App] Error stack:', error instanceof Error ? error.stack : 'No stack');
        setAttestedDataPoints(new Set()); // Clear on error
      }
    };
    
    // Add a small delay to ensure authenticatedUser is fully set
    const timeoutId = setTimeout(() => {
      loadAttestedDataPoints();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [authenticatedUser?.id]); // Only depend on the ID, not the whole object
  
  // Debug success state changes
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      logDebug('Success state changed to:', success, 'authenticatedUser:', !!authenticatedUser);
    }
  }, [success, authenticatedUser]);


  


  const [assetDelegations, setAssetDelegations] = useState<AssetDelegation[]>([]);
  const [delegationsLoading, setDelegationsLoading] = useState(false);
  const [delegationsError, setDelegationsError] = useState<string | null>(null);

  const refreshAssetDelegations = useCallback(async () => {
    if (!apiToken) {
      setAssetDelegations([]);
      return;
    }
    setDelegationsLoading(true);
    setDelegationsError(null);
    try {
      const list = await listAllDelegations(apiToken);
      setAssetDelegations(list);
    } catch (e) {
      setDelegationsError(e instanceof Error ? e.message : 'Failed to load delegations');
      setAssetDelegations([]);
    } finally {
      setDelegationsLoading(false);
    }
  }, [apiToken]);

  useEffect(() => {
    if (activeTab === 'delegation' && apiToken) {
      void refreshAssetDelegations();
    }
  }, [activeTab, apiToken, refreshAssetDelegations]);

  const handleRemoveDelegation = async (delegationId: string) => {
    if (!apiToken) return;
    try {
      await revokeAssetDelegation(apiToken, delegationId);
      showSuccessMessage('Delegation revoked');
      await refreshAssetDelegations();
    } catch (e) {
      showErrorMessage(e instanceof Error ? e.message : 'Failed to revoke delegation');
    }
  };

  
  // selectedId state removed as it's now handled by enhanced identity selector

  // Helper functions for custodian counts
  const getSelfCustodiansCount = () => {
    return custodians.filter(c => c.type === 'person' && c.identityId === authenticatedUser?.id).length;
  };

  const getThirdPartyCustodiansCount = () => {
    return custodians.filter(c => c.type === 'person' && c.identityId !== authenticatedUser?.id).length;
  };

  // Check for transfer route
  useEffect(() => {
    const pathname = window.location.pathname;
    const transferMatch = pathname.match(/^\/transfer\/id=(.+)$/);
    
    if (transferMatch) {
      const transferId = transferMatch[1];
      // Handle transfer route - show transfer receiver
      setShowTransferReceiver(true);
      setTransferId(transferId);
    }
  }, []);

  // Check for legal pages route
  useEffect(() => {
    const pathname = window.location.pathname;
    
    if (pathname === '/terms') {
      setShowTermsOfService(true);
    } else if (pathname === '/privacy') {
      setShowPrivacyPolicy(true);
    } else if (pathname === '/dmca') {
      setShowDmcaPolicy(true);
    }
  }, []);

  // Check for successful transfer completion
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const transferCompleted = urlParams.get('transferCompleted');
    const autoLogin = urlParams.get('autoLogin');
    
    if (transferCompleted === 'true') {
      // A transfer was just completed
      if (autoLogin === 'true') {
        // Auto-login the user with the transferred pN
        const storedUser = localStorage.getItem('authenticatedUser');
        const storedDID = localStorage.getItem('selectedDID');
        
        if (storedUser && storedDID) {
          try {
            const user = JSON.parse(storedUser);
            const did = JSON.parse(storedDID);
            setAuthenticatedUser(user);
            setSelectedDID(did);
            setSuccessWithTimeout('Transfer completed successfully! You are now logged in with the transferred pN.');
          } catch (error) {
            setSuccessWithTimeout('Transfer completed successfully! Your pN identity is now available.');
          }
        } else {
          setSuccessWithTimeout('Transfer completed successfully! Your pN identity is now available.');
        }
      } else {
        setSuccessWithTimeout('Transfer completed successfully! Your pN identity is now available.');
      }
      
      setTimeout(() => setSuccessWithTimeout(null), 5000);
      
      // Clean up the URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  // Deep link: open Create New pN when ?create=1 (or ?create)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const createParam = urlParams.get('create');
    if (createParam === null) return;
    if (createParam === '0' || createParam.toLowerCase() === 'false') return;

    setShowCreateForm(true);

    urlParams.delete('create');
    const next = urlParams.toString();
    const newUrl = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`;
    window.history.replaceState({}, document.title, newUrl);
  }, [setShowCreateForm]);

  // Check for custodian invitation URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const custodianInvitation = urlParams.get('custodian-invitation');
    
    if (custodianInvitation) {
      try {
        const invitationData = JSON.parse(decodeURIComponent(custodianInvitation));
        
        // Validate the invitation hasn't expired
        if (invitationData.expiresAt && Date.now() > invitationData.expiresAt) {
          setError('Custodian invitation has expired');
          setTimeout(() => setError(null), 9000);
          return;
        }
        
        // Store the invitation data for later use
        setPendingCustodianInvitationData(invitationData);
        
        // Clean up the URL
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        
      } catch (error) {
        setError('Invalid custodian invitation link');
        setTimeout(() => setError(null), 9000);
      }
    }
  }, []);

  // Show custodian acceptance modal when user is authenticated and has pending invitation
  useEffect(() => {
    if (authenticatedUser && pendingCustodianInvitationData) {
      setShowCustodianAcceptanceModal(true);
    }
  }, [authenticatedUser, pendingCustodianInvitationData]);

  // Initialize systems
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      logDebug('App component initialized!');
    }
    const initializeSystems = async () => {
      try {
        // Initialize analytics
        await analytics.initialize();
        
              // Initialize realtime manager (disabled in dev mode)
      // await realtimeManager.connect();
        
        // Initialize notifications service
        // notificationsService.initialize(); // Removed - no longer needed
        

        
        // Track page view
        analytics.trackPageView('dashboard');

        // SECURITY: Enable screen protection (blur on tab switch)
        try {
          ScreenProtection.enable();
          logDebug('[Security] Screen protection enabled');
        } catch (screenProtectionError) {
          logError('Failed to enable screen protection:', screenProtectionError);
        }

        // SECURITY: Start extension detection and warnings
        try {
          ExtensionDetector.startMonitoring();
          // Check for warnings and show user notification if needed
          setTimeout(() => {
            if (ExtensionDetector.hasWarnings()) {
              const warningMessage = ExtensionDetector.getWarningMessage();
              if (warningMessage) {
                // Show warning to user (non-blocking)
                logDebug('[Security] Extension warning:', warningMessage);
                // Note: Full UI integration for extension warnings will be in Phase 3
              }
            }
          }, 2000); // Wait 2 seconds for page to fully load
          logDebug('[Security] Extension detection started');
        } catch (extensionError) {
          logError('Failed to start extension detection:', extensionError);
        }

        // SECURITY: Run session data migration to remove pnName/passcode from IndexedDB
        try {
          const migrationResult = await SessionDataMigration.runMigration();
          if (migrationResult.cleaned > 0) {
            logDebug(`[Security] Cleaned ${migrationResult.cleaned} sessions with exposed credentials`);
          }
        } catch (migrationError) {
          logError('Session data migration failed:', migrationError);
        }

        // SECURITY: Immediately clean up ALL plaintext Google Drive credentials
        // This runs on every app load, even before user authentication
        try {
          const cleanupResult = await IntegrationCredentialManager.cleanupAllPlaintextCredentials();
          if (cleanupResult.cleaned > 0) {
            logDebug(`[Security] Cleaned ${cleanupResult.cleaned} plaintext integration credential keys from localStorage (Google Drive, Firebase, GitHub, etc.)`);
          }
        } catch (cleanupError) {
          logError('Plaintext credential cleanup failed:', cleanupError);
        }

        // Check for migration needs (PWA only)
        if (!migrationChecked) {
          await checkForMigration();
          setMigrationChecked(true);
        }
      } catch (error) {
        logError('Failed to initialize systems:', error);
      }
    };

    initializeSystems();

    // Cleanup on unmount
    return () => {
      ScreenProtection.disable();
      ExtensionDetector.stopMonitoring();
    };
  }, [migrationChecked]);

  const handleOfflineModeChange = () => {
    // This function is no longer needed since we removed the offline mode state
  };

  // Migration check function
  const checkForMigration = async () => {
    try {
      if (await MigrationManager.isMigrationNeeded()) {
        const pendingIdentities = await MigrationManager.getPendingMigrations();
        if (pendingIdentities.length > 0) {
          setPendingMigrations(pendingIdentities);
          setShowMigrationModal(true);
          logDebug(`Found ${pendingIdentities.length} identities to migrate`);
        }
      }
    } catch (error) {
              logError('Migration check failed:', error);
    }
  };

  // Handle migration completion
  const handleMigrationComplete = (result: MigrationResult) => {
    if (result.success && result.migratedCount > 0) {
      setSuccessWithTimeout(`Successfully migrated ${result.migratedCount} identity(ies) to PWA storage!`);
      setTimeout(() => setSuccessWithTimeout(null), 5000);
      
      // Refresh the app to load migrated identities
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } else if (result.errors.length > 0) {
      setError(`Migration completed with ${result.errors.length} error(s). Some identities may not have been migrated.`);
      setTimeout(() => setError(null), 8000);
    }
    
    setShowMigrationModal(false);
  };

  const handleCreateDID = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('handleCreateDID called', { createForm, createStep });
    
    try {
      logDebug('Starting identity creation...');
      setLoading(true);
      setError(null);
      
      console.log('Validation starting...', {
        pnName: createForm.pnName,
        confirmPNName: createForm.confirmPNName,
        passcode: createForm.passcode ? '***' : '',
        confirmPasscode: createForm.confirmPasscode ? '***' : '',
        recoveryContactType: createForm.recoveryContactType,
        recoveryEmail: createForm.recoveryEmail,
        confirmRecoveryEmail: createForm.confirmRecoveryEmail
      });

      // Comprehensive input validation
      const pnNameValidation = InputValidator.validatePNName(createForm.pnName);
      if (!pnNameValidation.isValid) {
        const errorMsg = `pN Name validation failed: ${pnNameValidation.errors.join(', ')}`;
        setError(errorMsg);
        setLoading(false);
        analytics.trackError(new Error(errorMsg), 'create-form', 'high');
        setTimeout(() => setError(null), 9000);
        return;
      }

      const passcodeValidation = InputValidator.validatePasscode(createForm.passcode);
      if (!passcodeValidation.isValid) {
        const errorMsg = `Passcode validation failed: ${passcodeValidation.errors.join(', ')}`;
        setError(errorMsg);
        setLoading(false);
        analytics.trackError(new Error(errorMsg), 'create-form', 'high');
        setTimeout(() => setError(null), 9000);
        return;
      }

      // Validate optional fields
      if (createForm.recoveryEmail) {
        const emailValidation = InputValidator.validateEmail(createForm.recoveryEmail);
        if (!emailValidation.isValid) {
          const errorMsg = `Email validation failed: ${emailValidation.errors.join(', ')}`;
          setError(errorMsg);
          setLoading(false);
          setTimeout(() => setError(null), 9000);
          return;
        }
      }

      if (createForm.recoveryPhone) {
        const phoneValidation = InputValidator.validatePhone(createForm.recoveryPhone);
        if (!phoneValidation.isValid) {
          const errorMsg = `Phone validation failed: ${phoneValidation.errors.join(', ')}`;
          setError(errorMsg);
          setLoading(false);
          setTimeout(() => setError(null), 9000);
          return;
        }
      }

      // Rate limiting check
      const rateLimitConfig = {
        maxRequests: 5,
        windowMs: 60000, // 1 minute
        keyGenerator: (userId?: string) => `create_identity_${userId || 'anonymous'}`
      };

      if (!security.checkRateLimit(rateLimitConfig)) {
        setError('Too many requests. Please wait a moment and try again.');
        setLoading(false);
        setTimeout(() => setError(null), 9000);
        return;
      }

      // Initialize storage if not already done
      try {
        await storage.init();
      } catch (error) {
        logError('Storage initialization error:', error);
        // Try to clear and reinitialize storage
        try {
          await storage.clearAllData();
          await storage.init();
        } catch (retryError) {
          logError('Storage retry failed:', retryError);
          throw new Error('Storage system error. Please clear your browser data and try again.');
        }
      }

      // Validate passcode confirmation
      if (createForm.passcode !== createForm.confirmPasscode) {
        throw new Error('Passcodes do not match');
      }

      // Validate recovery contact is provided
      if (createForm.recoveryContactType === 'email' && !createForm.recoveryEmail) {
        throw new Error('Recovery email is required');
      }
      if (createForm.recoveryContactType === 'phone' && !createForm.recoveryPhone) {
        throw new Error('Recovery phone is required');
      }

      // Validate confirmation fields match
      if (createForm.pnName !== createForm.confirmPNName) {
        throw new Error('pN Names do not match');
      }
      

      
      if (createForm.recoveryContactType === 'email' && createForm.recoveryEmail !== createForm.confirmRecoveryEmail) {
        throw new Error('Recovery emails do not match');
      }
      
      if (createForm.recoveryContactType === 'phone' && createForm.recoveryPhone !== createForm.confirmRecoveryPhone) {
        throw new Error('Recovery phone numbers do not match');
      }

      // Generate random nickname
      const randomNickname = generateRandomNickname();
      
      // Create real identity with cryptography
      logDebug('Creating encrypted identity...');
      const creation = await IdentityCrypto.createIdentity(
        createForm.pnName,
        randomNickname,
        createForm.passcode,
        createForm.recoveryEmail ? createForm.recoveryEmail : undefined,
        createForm.recoveryPhone ? createForm.recoveryPhone : undefined
      );
      const encryptedIdentity = creation.identity;
      try {
        setPendingRecoverySharesBuffer({
          publicKey: encryptedIdentity.publicKey,
          shares: creation.recoveryShares,
          threshold: creation.recoveryConfig.threshold,
        });
      } catch {
        /* optional */
      }
      logDebug('Encrypted identity created successfully');

      // Portable .pn file is the identity — required for every unlock (file + pN name + passcode).
      const pnExport = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        identities: [encryptedIdentity],
      };
      const pnFilename = `${randomNickname
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()
        .substring(0, 20)}.pn`;
      downloadFile(JSON.stringify(pnExport, null, 2), pnFilename);

      // Optional PWA browser cache only — unlock always requires the .pn file.
      try {
        const simpleStorage = SimpleStorage.getInstance();
        const { PNNameHash } = await import('./utils/security/pnNameHash');
        const pnNameHash = await PNNameHash.getLookupKey(createForm.pnName);

        const simpleIdentity: SimpleIdentity = {
          id: encryptedIdentity.publicKey,
          nickname: randomNickname,
          pnNameHash,
          publicKey: encryptedIdentity.publicKey,
          encryptedData: encryptedIdentity,
          createdAt: new Date().toISOString(),
          lastAccessed: new Date().toISOString(),
        };

        await simpleStorage.storeIdentity(simpleIdentity);
        MigrationManager.storeForMigration(encryptedIdentity);
      } catch (error) {
        logError('Optional PWA browser cache failed (your .pn file is what matters):', error);
      }

      // Recovery keys are now automatically generated and encrypted in the ID file
      // They will be available after decryption and can be linked to custodians in dashboard metadata

      // Create DID info for UI (all data is encrypted except public key)
      const didInfo: DIDInfo = {
        id: '', // ID is encrypted - will be filled after decryption
        pnName: '', // pN Name is encrypted - user must enter it
        email: '', // Email is encrypted
        nickname: '', // Nickname is encrypted
        phone: '', // Phone is encrypted
        recoveryEmail: '', // Recovery email is encrypted
        recoveryPhone: '', // Recovery phone is encrypted
        createdAt: '', // Created at is encrypted
        status: 'active', // Default status
        custodiansRequired: false, // Default value
        custodiansSetup: false // Default value
      };



      // Update the UI with the new identity
      setDids(prev => {
        const newDids = [...prev, didInfo];
        return newDids;
      });
      setSelectedDID(didInfo);
      
      // Authenticate the user using the existing system (which is already decentralized)
      try {
        const authSession = await IdentityCrypto.authenticateIdentity(encryptedIdentity, createForm.passcode, createForm.pnName);
        setAuthenticatedUser(authSession);
        

        
        showSuccessMessage(
          `pN created! Your .pn file was downloaded — keep it safe; you need it with your pN name and passcode to unlock. Nickname: ${randomNickname}.`
        );
        
        // Trigger onboarding wizard for new users
        setIsNewUser(true);
        setShowOnboardingWizard(true);
      } catch (authError) {
        logError('Authentication error after creation:', authError);
        setError('pN created but authentication failed. Please try logging in.');
      }
      
      // Reset form
      setCreateForm({
        pnName: '',
        confirmPNName: '',
        passcode: '',
        confirmPasscode: '',
        nickname: '',
        email: '',
        phone: '',
        recoveryEmail: '',
        confirmRecoveryEmail: '',
        recoveryPhone: '',
        confirmRecoveryPhone: '',
        recoveryContactType: 'email'
      });
      setCreateStep(1);
      setShowCreateForm(false);
      setTimeout(() => setSuccessWithTimeout(null), 5000);
      
      // Track successful identity creation
      analytics.trackEvent('identity', 'created', 'success');
      analytics.trackFeatureUsage('identity_creation', 'completed');
    } catch (error: any) {
      logError('Create DID error:', error);
      setError(error.message || 'Failed to create DID');
      setTimeout(() => setError(null), 9000);
      
      // Track error
      analytics.trackError(error, 'create-form', 'medium');
      security.monitorAuthentication(false, createForm.pnName, 'identity_creation');
    } finally {
      setLoading(false);
    }
  };

  const handleImportDID = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);

      // Initialize storage if not already done
      await storage.init();

      // Validate backup file
      if (!importForm.backupFile) {
        throw new Error('Please select a backup file to import');
      }

      // Read and parse backup file
      const backupData = await importForm.backupFile.text();
      const backup = JSON.parse(backupData);

      // Validate backup structure
      if (!backup.identities || !Array.isArray(backup.identities)) {
        throw new Error('Invalid backup file format');
      }

      let authSession: AuthSession;
      let importedIdentity: Record<string, unknown>;

      if (isDeviceBoundPnEnvelope(backup)) {
        if (!(await checkDeviceBoundPnUnlockAvailable(backup, recoveryVaultPnId))) {
          throw new Error(DEVICE_BOUND_PN_ERROR);
        }
        if (backup.identities.length !== 1) {
          throw new Error('Invalid device-bound pN file: expected a single identity');
        }
        const result = await authenticateDeviceBoundPn({
          envelope: backup,
          pnName: importForm.pnName,
          passcode: importForm.passcode,
          pnIdentifier: recoveryVaultPnId,
        });
        authSession = result.authSession;
        importedIdentity = result.identity;
      } else {
        if (backup.identities.length !== 1) {
          throw new Error('Invalid pN file: Multiple identities found. Each pN file should contain only one identity.');
        }
        const identityToImport = parsePortablePnBackup(backup);

        authSession = await IdentityCrypto.authenticateIdentity(
          identityToImport,
          importForm.passcode,
          importForm.pnName
        );
        importedIdentity = { ...identityToImport };
      }

      // Store the session
      await storage.storeSession(authSession);

      // Create DID info for UI
      const didInfo: DIDInfo = {
        id: authSession.id,
        pnName: '',
        nickname: authSession.nickname,
        email: '',
        phone: '',
        recoveryEmail: '',
        recoveryPhone: '',
        createdAt: authSession.authenticatedAt,
        status: 'active',
        custodiansRequired: true,
        custodiansSetup: false
      };

      setDids(prev => {
        const newDids = [...prev, didInfo];
        return newDids;
      });
      setSelectedDID(didInfo);
      
      // Set authenticated user
      setAuthenticatedUser(authSession);
      
      // Reset form
      setImportForm({
        pnName: '',
        passcode: '',
        backupFile: null
      });
      setShowImportForm(false);
      setSuccessWithTimeout('pN imported and authenticated successfully!');
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to import DID');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };



  const deriveAuthToken = async (pnName: string | undefined, publicKey: string | undefined, passcode: string | undefined): Promise<string | null> => {
    if (!pnName || !publicKey || !passcode) {
      return null;
    }
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(`${pnName}::${publicKey}::${passcode}`);
      const digest = await window.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.warn('Failed to derive auth token', error);
      return null;
    }
  };

  const handleAuthSuccess = async (session: any) => {
    try {
      // SECURITY: Store credentials in memory only via SecureCredentialManager
      // pnName + passcode = 2FA credentials - must remain secret
      if (session.pnName && session.passcode) {
        const expiresIn = (session.expiresIn || 3600) * 1000; // Convert to milliseconds
        SecureCredentialManager.setCredentials(
          session.id,
          session.pnName,
          session.passcode,
          expiresIn
        );
      }

      // Store the session WITHOUT credentials
      // SECURITY: Do not pass pnName, passcode, or authToken to storeSession
      await storage.storeSession({
        id: session.id,
        nickname: session.nickname,
        accessToken: session.accessToken,
        expiresIn: session.expiresIn,
        authenticatedAt: session.authenticatedAt,
        publicKey: session.publicKey || '',
        // authToken removed - it's derived from credentials and should not be stored
        // pnName and passcode removed - stored in SecureCredentialManager only
      });

      // SECURITY: Do NOT store passcode in sessionStorage - use SecureCredentialManager instead
      // Removed: sessionStorage.setItem('pn_session_passcode', session.passcode);

      // SECURITY: Do NOT expose credentials in custom events
        try {
          // SECURITY: Get credentials from SecureCredentialManager (secrets), not from session
          const credentials = SecureCredentialManager.getCredentials(session.id);
          if (!credentials) {
            console.warn('[App] Cannot dispatch pn-auth-session event - credentials not available');
            return;
          }
          
          const authEventDetail = {
          // pnName and passcode removed - use SecureCredentialManager if needed
            publicKey: session.publicKey || session.id,
            authToken: await deriveAuthToken(credentials.pnName, session.publicKey || session.id, credentials.passcode),
          };
          window.dispatchEvent(new CustomEvent('pn-auth-session', { detail: authEventDetail }));
        } catch (eventError) {
          console.warn('Could not dispatch pn-auth-session event:', eventError);
      }

      // Set the authenticated user WITHOUT credentials
      // Credentials are stored in SecureCredentialManager, not in state
      setAuthenticatedUser({
        id: session.id,
        // pnName removed - use SecureCredentialManager.getCredentials(session.id) if needed
        nickname: session.nickname,
        accessToken: session.accessToken,
        expiresIn: session.expiresIn,
        authenticatedAt: session.authenticatedAt,
        publicKey: session.publicKey || '',
        // passcode removed - use SecureCredentialManager.getCredentials(session.id) if needed
        authToken: session.authToken || undefined,
      });

      // Acquire par Noir API JWT immediately after identity unlock.
      const credentials = SecureCredentialManager.getCredentials(session.id);
      if (credentials && session.publicKey) {
        try {
          const encryptedIdentity = await getEncryptedIdentityForApiToken(session.publicKey);
          if (encryptedIdentity) {
            const token = await ensureApiTokenAfterUnlock({
              encryptedIdentity,
              publicKey: session.publicKey,
              did: session.id,
              pnName: credentials.pnName,
              passcode: credentials.passcode
            });
            if (token) {
              try {
                const { migrateAndFlushOnUnlock } = await import('./services/deviceCloudCredentials');
                const { derivePnIdentifierForToken } = await import('./services/parNoirOAuthInline');
                const pnIdentifier = await derivePnIdentifierForToken(
                  credentials.pnName,
                  credentials.passcode,
                  session.publicKey
                );
                await migrateAndFlushOnUnlock({
                  identityId: pnIdentifier,
                  authToken: token,
                  session: {
                    sessionId: session.id,
                    pnName: credentials.pnName,
                    passcode: credentials.passcode
                  }
                });
              } catch (deviceCloudErr) {
                logDebug('[DeviceCloud] migrate/flush skipped or failed:', deviceCloudErr);
              }
            }
          }
        } catch {
          // Keep unlock success path intact; Sub-pN flows can surface token errors.
        }
      }

      // Set the unlocked identity for notifications
      // SECURITY: pnName and passcode not passed - stored in SecureCredentialManager only
      notificationsService.setUnlockedIdentity(session.id, session.nickname || 'User');

      // SECURITY: Migrate plaintext integration credentials to encrypted storage
      try {
        // First, try to migrate any existing credentials
        const migrated = await IntegrationCredentialManager.migratePlaintextCredentials(
          'google_drive',
          session.id
        );
        if (migrated) {
          logDebug('[Security] Migrated Google Drive credentials to encrypted storage');
        }
        
        // Then, clean up ALL remaining plaintext credentials (even if migration failed)
        const cleanupResult = await IntegrationCredentialManager.cleanupAllPlaintextCredentials();
        if (cleanupResult.cleaned > 0) {
          logDebug(`[Security] Cleaned ${cleanupResult.cleaned} plaintext integration credential keys (Google Drive, Firebase, GitHub, etc.)`);
        }
      } catch (migrationError) {
        logError('Integration credential migration failed:', migrationError);
        // Still try to clean up plaintext credentials even if migration fails
        try {
          await IntegrationCredentialManager.cleanupAllPlaintextCredentials();
        } catch (cleanupError) {
          logError('Plaintext credential cleanup failed:', cleanupError);
        }
      }

      // Reload stored identities into the selector
      try {
        const storedIdentities = await storage.getIdentities();
        const didInfos: DIDInfo[] = storedIdentities.map((identity: any) => ({
          id: identity.id,
          pnName: identity.pnName,
          nickname: identity.nickname || identity.pnName,
          email: identity.email || '',
          phone: identity.phone || '',
          recoveryEmail: identity.recoveryEmail || '',
          recoveryPhone: identity.recoveryPhone || '',
          createdAt: identity.createdAt || new Date().toISOString(),
          status: identity.status || 'active',
          custodiansRequired: identity.custodiansRequired || false,
          custodiansSetup: identity.custodiansSetup || false,
          isEncrypted: identity.isEncrypted || false,
          fileContent: identity.fileContent || '',
          publicKey: identity.publicKey || '',
          filePath: identity.filePath || '',
          fileName: identity.fileName || '',
          idFile: identity.idFile || null
        }));
        
        setDids(didInfos);
        
        // Set the current user as selected
        const currentUser = didInfos.find(did => did.id === session.id);
        if (currentUser) {
          setSelectedDID(currentUser);
        }
        
        logDebug('Reloaded', didInfos.length, 'stored identities into selector');
      } catch (error) {
        logError('Failed to reload stored identities:', error);
      }

      // Show success
    setError(null);
            // pnName is secret - use nickname or generic message
            showSuccessMessage(`Successfully unlocked identity: ${session.nickname || 'Your pN'}`, 5000);
    } catch (error: any) {
              logError('Failed to store session:', error);
      setError('Authentication succeeded but failed to store session. Please try again.');
    }
  };

  const handleAuthError = (error: Error) => {
            logError('Authentication failed:', error);
    setError(error.message);
    setTimeout(() => setError(null), 9000);
  };

  const handleLogout = async () => {
    try {
      logDebug('Logging out...');
      
      // SECURITY: Clear all credentials from memory
      SecureCredentialManager.clearAll();
      
      // SECURITY: Clear all integration credentials
      try {
        await IntegrationCredentialManager.clearAll();
      } catch (error) {
        logError('Failed to clear integration credentials:', error);
      }

      try {
        const { stopDeviceCloudWorkers, wipeDeviceCloudCredentials } = await import(
          './services/deviceCloudCredentials'
        );
        stopDeviceCloudWorkers();
        const authUser = authenticatedUser;
        if (authUser?.id) {
          await wipeDeviceCloudCredentials(authUser.id).catch(() => undefined);
        }
      } catch {
        /* optional */
      }
      
      // Clear the current session from storage
      await storage.clearExpiredSessions();
      
      // Clear the unlocked identity for notifications
      notificationsService.clearUnlockedIdentity();
      
      // Clear all state
      clearApiToken();
      setAuthenticatedUser(null);
      setDids([]);
      setSelectedDID(null);
      setSelectedStoredIdentity(null);
      setMainForm({ pnName: '', passcode: '', uploadFile: null });
      setShowMainPNName(false);
      setShowMainPasscode(false);
      setError(null);
      setSuccessWithTimeout(null);
      setLoading(false);
      
        // Clear the last unlock time to force lock on next open
        localStorage.removeItem('pwa-last-unlock-time');
      
      // Clear initialization flag so scan can run again on next app load
      localStorage.removeItem('pwa_initialized');
      localStorage.removeItem('pwa_directory_handle'); // Clean up old file system handles
      
      // Don't clear stored ID files - keep them for next login
              logDebug('Keeping stored identities for next login:', localStorage.getItem('pwa_stored_identities'));
      
              logDebug('Logout complete - all state cleared');
      showSuccessMessage('Successfully locked your identity', 5000);
    } catch (error) {
              logError('Error during logout:', error);
      // Force clear state even if storage fails
      clearApiToken();
      setAuthenticatedUser(null);
      setDids([]);
      setSelectedDID(null);
      setSelectedStoredIdentity(null);
      setMainForm({ pnName: '', passcode: '', uploadFile: null });
      setShowMainPNName(false);
      setShowMainPasscode(false);
      setError(null);
      setSuccessWithTimeout(null);
      setLoading(false);
      
      // Clear the last unlock time even if logout fails
        localStorage.removeItem('pwa-last-unlock-time');
    }
  };



  // Identity selector handlers
  const handleIdentitySelect = (identity: SimpleIdentity | null) => {
    setSelectedStoredIdentity(identity);
    if (identity) {
      // Clear any uploaded file when selecting a stored identity
      setMainForm(prev => ({ ...prev, uploadFile: null }));
    }
  };



  const handleDeleteIdentity = async (identity: SimpleIdentity) => {
    try {
      const storage = SimpleStorage.getInstance();
      await storage.deleteIdentity(identity.id);
      
      // Clear selection if the deleted identity was selected
      if (selectedStoredIdentity?.id === identity.id) {
        setSelectedStoredIdentity(null);
        setMainForm(prev => ({ ...prev, pnName: '' }));
      }
      
      setSuccessWithTimeout(`Identity "${identity.nickname}" deleted successfully`);
      setTimeout(() => setSuccessWithTimeout(null), 3000);
    } catch (error) {
      setError('Failed to delete identity');
      setTimeout(() => setError(null), 3000);
    }
  };



  const handleIncomingNicknameUpdate = async (identityId: string, newNickname: string) => {
    try {
              logDebug('Received nickname update for identity:', identityId, 'new nickname:', newNickname);
      
      // Get the stored identity (identityId could be publicKey or ID)
      let storedIdentity = await storage.getIdentity(identityId);
      if (!storedIdentity) {
        logDebug('Identity not found in local storage, skipping nickname update');
        return;
      }
      
      // Create an EncryptedIdentity from the StoredIdentity with updated nickname
      const updatedIdentity: EncryptedIdentity = { 
        publicKey: storedIdentity.publicKey,
        encryptedData: storedIdentity.encryptedData,
        iv: storedIdentity.iv,
        salt: storedIdentity.salt
      };
      
      // Store the updated identity
      await storage.storeIdentity(updatedIdentity);
      
      // Update the authenticated user's nickname if this is the current user
      if (authenticatedUser && authenticatedUser.id === identityId) {
        const updatedUser = { ...authenticatedUser, nickname: newNickname };
        setAuthenticatedUser(updatedUser);
      }
      
      // Update the DID info
      setDids(prev => prev.map(did => 
        did.id === identityId 
          ? { ...did, displayName: newNickname, nickname: newNickname }
          : did
      ));
      
      // Update selected DID if it's the current user
      if (selectedDID?.id === identityId) {
        setSelectedDID(prev => prev ? { ...prev, nickname: newNickname } : null);
      }
      
      // Update the stored identity reference in localStorage
      try {
        const storedIdentities = localStorage.getItem('pwa_stored_identities');
        if (storedIdentities) {
          const stored = JSON.parse(storedIdentities);
          const identityIndex = stored.findIndex((item: any) => 
            item.publicKey === storedIdentity.publicKey || item.idFile?.id === identityId
          );
          
          if (identityIndex >= 0) {
            // Update the nickname in the stored reference
            stored[identityIndex].nickname = newNickname;
            localStorage.setItem('pwa_stored_identities', JSON.stringify(stored));
            logDebug('Updated nickname in stored identity reference (incoming):', newNickname);
          }
        }
      } catch (error) {
        logError('Failed to update stored identity reference (incoming):', error);
      }

      // Update cloud database with the incoming nickname change
      try {
        await cloudSyncManager.initialize();
        await cloudSyncManager.storeNicknameUpdate({
          identityId,
          publicKey: storedIdentity.publicKey,
          oldNickname: authenticatedUser?.nickname || '',
          newNickname,
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
        logDebug('Incoming nickname update stored in cloud database');
      } catch (error) {
        logError('Failed to store incoming nickname update in cloud:', error);
      }
      
              logDebug('Nickname updated from sync:', newNickname);
    } catch (error) {
              logError('Error handling incoming nickname update:', error);
    }
  };

  const handleNicknameUpdate = async (newNickname: string) => {
    if (!authenticatedUser) return;
    
    try {
      setLoading(true);
      
      const isPWAMode = pwaState.isInstalled;
      logDebug('Updating nickname for', isPWAMode ? 'PWA' : 'Web App', 'identity...');
      
      // 🔐 SECURE METADATA UPDATE: Update nickname in encrypted metadata
      try {
        const identityId = authenticatedUser.id || authenticatedUser.publicKey;
        // SECURITY: Retrieve credentials from SecureCredentialManager
        const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
        if (!credentials) {
          throw new Error('Credentials not available for metadata update');
        }
        
        await SecureMetadataStorage.updateMetadataField(
          identityId,
          credentials.pnName,
          credentials.passcode,
          'nickname',
          newNickname
        );
        logDebug('Nickname updated in secure metadata');
      } catch (error) {
        logError('Failed to update secure metadata:', error);
        // Continue with local updates even if secure metadata fails
      }
      
      // Update the authenticated user's nickname
      const updatedUser = { ...authenticatedUser, nickname: newNickname };
      setAuthenticatedUser(updatedUser);
      
      // Update the DID info in state
      setDids(prev => prev.map(did => 
        did.id === authenticatedUser.id 
          ? { ...did, nickname: newNickname, displayName: newNickname }
          : did
      ));
      
      // Update selected DID if it's the current user
      if (selectedDID?.id === authenticatedUser.id) {
        setSelectedDID(prev => prev ? { ...prev, nickname: newNickname } : null);
      }
      
      if (isPWAMode) {
        // PWA: Update localStorage storage
        try {
          const storedIdentities = localStorage.getItem('pwa_stored_identities');
          if (storedIdentities) {
            const stored = JSON.parse(storedIdentities);
            const identityIndex = stored.findIndex((item: any) => 
              item.publicKey === authenticatedUser.publicKey || item.idFile?.id === authenticatedUser.id
            );
            
            if (identityIndex >= 0) {
              // Update the nickname in the stored reference
              stored[identityIndex].nickname = newNickname;
              
              // Update the nickname in the actual ID file data
              if (stored[identityIndex].idFile) {
                stored[identityIndex].idFile.nickname = newNickname;
              }
              
              localStorage.setItem('pwa_stored_identities', JSON.stringify(stored));
              logDebug('Updated nickname in PWA localStorage:', newNickname);
            } else {
              logDebug('Identity not found in PWA localStorage');
            }
          } else {
            logDebug('No PWA stored identities found');
          }
        } catch (error) {
          logError('Failed to update PWA stored identity reference:', error);
        }
      } else {
        // Web App: Update IndexedDB storage
        try {
          await storage.init();
          const storedIdentity = await storage.getIdentity(authenticatedUser.publicKey);
          if (storedIdentity) {
            logDebug('Web app: Updated session nickname, user should re-upload ID file for permanent storage');
          } else {
            logDebug('Identity not found in web app storage');
          }
        } catch (error) {
          logError('Failed to update web app storage:', error);
        }
      }

      // Store nickname update in cloud database for cross-platform sync
      try {
        await cloudSyncManager.initialize();
        await cloudSyncManager.storeUpdate({
          type: 'nickname',
          identityId: authenticatedUser.id,
          publicKey: authenticatedUser.publicKey,
          data: {
            oldNickname: authenticatedUser.nickname || '',
            newNickname
          },
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
        logDebug('Nickname update stored in cloud database for cross-platform sync');
      } catch (error) {
        logError('Failed to store nickname update in cloud:', error);
        // Don't fail the entire operation if cloud sync fails
      }
      
      setShowNicknameEditor(false);
      const successMessage = pwaState.isInstalled 
        ? 'Nickname updated successfully! Changes will sync across all PWA devices and platforms.'
        : 'Nickname updated successfully! Changes will sync to cloud and other platforms. Re-upload your pN file to save changes permanently.';
      showSuccessMessage(successMessage);
    } catch (error) {
      logError('Error updating nickname:', error);
      showErrorMessage(`Failed to update nickname: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePictureUpdate = async (newProfilePicture: string) => {
    if (!authenticatedUser) return;
    if (!canProfileWrite) {
      setError(deviceAuth.deviceRequiredMessage);
      setTimeout(() => setError(null), 9000);
      return;
    }
    
    try {
      setLoading(true);
      
      const isPWAMode = pwaState.isInstalled;
              logDebug('Updating profile picture for', isPWAMode ? 'PWA' : 'Web App', 'identity...');
      
      // 🔐 SECURE METADATA UPDATE: Update profile picture in encrypted metadata
      try {
        const identityId = authenticatedUser.id || authenticatedUser.publicKey;
        // SECURITY: Retrieve credentials from SecureCredentialManager
        const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
        if (!credentials) {
          throw new Error('Credentials not available for metadata update');
        }
        
        await SecureMetadataStorage.updateMetadataField(
          identityId,
          credentials.pnName,
          credentials.passcode,
          'profilePicture',
          newProfilePicture
        );
        logDebug('Profile picture updated in secure metadata');
      } catch (error) {
        logError('Failed to update secure metadata:', error);
        // Continue with local updates even if secure metadata fails
      }
      
      // Update the authenticated user's profile picture
      const updatedUser = { ...authenticatedUser, profilePicture: newProfilePicture };
      setAuthenticatedUser(updatedUser);
      
      // Update the DID info in state
      setDids(prev => prev.map(did => 
        did.id === authenticatedUser.id 
          ? { ...did, profilePicture: newProfilePicture }
          : did
      ));
      
      // Update selected DID if it's the current user
      if (selectedDID?.id === authenticatedUser.id) {
        setSelectedDID(prev => prev ? { ...prev, profilePicture: newProfilePicture } : null);
      }
      
      if (isPWAMode) {
        // PWA: Update localStorage storage
        try {
          const storedIdentities = localStorage.getItem('pwa_stored_identities');
          if (storedIdentities) {
            const stored = JSON.parse(storedIdentities);
            const identityIndex = stored.findIndex((item: any) => 
              item.publicKey === authenticatedUser.publicKey || item.idFile?.id === authenticatedUser.id
            );
            
            if (identityIndex >= 0) {
              // Update the profile picture in the stored reference
              stored[identityIndex].profilePicture = newProfilePicture;
              
              // Update the profile picture in the actual ID file data
              if (stored[identityIndex].idFile) {
                stored[identityIndex].idFile.profilePicture = newProfilePicture;
              }
              
              localStorage.setItem('pwa_stored_identities', JSON.stringify(stored));
              logDebug('Updated profile picture in PWA localStorage:', newProfilePicture);
            } else {
              logDebug('Identity not found in PWA localStorage');
            }
          } else {
            logDebug('No PWA stored identities found');
          }
        } catch (error) {
          logError('Failed to update PWA stored identity reference:', error);
        }
      } else {
        // Web App: Update IndexedDB storage
        try {
          await storage.init();
          const storedIdentity = await storage.getIdentity(authenticatedUser.publicKey);
          if (storedIdentity) {
            logDebug('Web app: Updated session profile picture, user should re-upload ID file for permanent storage');
          } else {
            logDebug('Identity not found in web app storage');
          }
        } catch (error) {
          logError('Failed to update web app storage:', error);
        }
      }

      // Store profile picture update in cloud database for cross-platform sync
      try {
        await cloudSyncManager.initialize();
        await cloudSyncManager.storeUpdate({
          type: 'profile-picture',
          identityId: authenticatedUser.id,
          publicKey: authenticatedUser.publicKey,
          data: {
            oldProfilePicture: authenticatedUser.profilePicture || '',
            newProfilePicture
          },
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
        logDebug('Profile picture update stored in cloud database for cross-platform sync');
      } catch (error) {
        logError('Failed to store profile picture update in cloud:', error);
        // Don't fail the entire operation if cloud sync fails
      }
      
      setShowProfilePictureEditor(false);
      const successMessage = pwaState.isInstalled 
        ? 'Profile picture updated successfully! Changes will sync across all PWA devices and platforms.'
        : 'Profile picture updated successfully! Changes will sync to cloud and other platforms. Re-upload your pN file to save changes permanently.';
      showSuccessMessage(successMessage);
    } catch (error) {
      logError('Profile picture update error:', error);
      setError('Failed to update profile picture');
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateNickname = async (newNickname: string) => {
    if (!authenticatedUser) return;
    if (!canProfileWrite) {
      setError(deviceAuth.deviceRequiredMessage);
      setTimeout(() => setError(null), 9000);
      return;
    }
    
    try {
      setLoading(true);
      
      const isPWAMode = pwaState.isInstalled;
      logDebug('Updating nickname for', isPWAMode ? 'PWA' : 'Web App', 'identity...');
      
      // Update the authenticated user's nickname
      const updatedUser = { ...authenticatedUser, nickname: newNickname };
      setAuthenticatedUser(updatedUser);
      
      // Update the DID info in state
      setDids(prev => prev.map(did => 
        did.id === authenticatedUser.id 
          ? { ...did, nickname: newNickname }
          : did
      ));
      
      // Update selected DID if it's the current user
      if (selectedDID?.id === authenticatedUser.id) {
        setSelectedDID(prev => prev ? { ...prev, nickname: newNickname } : null);
      }
      
      if (isPWAMode) {
        // PWA: Update localStorage storage
        try {
          const storedIdentities = localStorage.getItem('pwa_stored_identities');
          if (storedIdentities) {
            const stored = JSON.parse(storedIdentities);
            const identityIndex = stored.findIndex((item: any) => 
              item.publicKey === authenticatedUser.publicKey || item.idFile?.id === authenticatedUser.id
            );
            
            if (identityIndex >= 0) {
              // Update the nickname in the stored reference
              stored[identityIndex].nickname = newNickname;
              
              // Update the nickname in the actual ID file data
              if (stored[identityIndex].idFile) {
                stored[identityIndex].idFile.nickname = newNickname;
              }
              
              localStorage.setItem('pwa_stored_identities', JSON.stringify(stored));
              logDebug('Updated nickname in PWA localStorage:', newNickname);
            }
          }
        } catch (error) {
          logError('Failed to update PWA stored identity reference:', error);
        }
      } else {
        // Web App: Update IndexedDB storage
        try {
          await storage.init();
          const storedIdentity = await storage.getIdentity(authenticatedUser.publicKey);
          if (storedIdentity) {
            logDebug('Web app: Updated session nickname, user should re-upload ID file for permanent storage');
          }
        } catch (error) {
          logError('Failed to update web app storage:', error);
        }
      }

      // Store nickname update in cloud database for cross-platform sync
      try {
        await cloudSyncManager.initialize();
        await cloudSyncManager.storeUpdate({
          type: 'nickname',
          identityId: authenticatedUser.id,
          publicKey: authenticatedUser.publicKey,
          data: {
            oldNickname: authenticatedUser.nickname || '',
            newNickname
          },
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
        logDebug('Nickname update stored in cloud database for cross-platform sync');
      } catch (error) {
        logError('Failed to store nickname update in cloud:', error);
      }
      
      const successMessage = pwaState.isInstalled 
        ? 'Nickname updated successfully! Changes will sync across all PWA devices and platforms.'
        : 'Nickname updated successfully! Changes will sync to cloud and other platforms. Re-upload your pN file to save changes permanently.';
      showSuccessMessage(successMessage);
    } catch (error) {
      logError('Nickname update error:', error);
      setError('Failed to update nickname');
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  // State for biometric passcode modal
  const [showBiometricPasscodeModal, setShowBiometricPasscodeModal] = React.useState(false);
  const [pendingBiometricIdentity, setPendingBiometricIdentity] = React.useState<DIDInfo | null>(null);
  const [biometricPasscodeError, setBiometricPasscodeError] = React.useState<string | null>(null);

  // Biometric authentication handler - Complete implementation
  const handleBiometricAuth = async (identity: DIDInfo, passcode?: string) => {
    try {
      setLoading(true);
      setBiometricPasscodeError(null);
      
      // Attempt biometric authentication
      const result = await BiometricAdapter.authenticate({ identityId: identity.id });
      
      if (result.success) {
        // Get the encrypted identity from SimpleStorage
        const simpleStorage = SimpleStorage.getInstance();
        const simpleIdentity = await simpleStorage.getIdentity(identity.id);
        
        if (!simpleIdentity) {
          throw new Error('Identity not found in storage');
        }

        // Get the encrypted identity data
        const encryptedIdentity: EncryptedIdentity = simpleIdentity.encryptedData;
        
        // SECURITY: Always require BOTH pnName and passcode - both are secrets
        // Biometric auth proves identity ownership, but we still need BOTH secrets to decrypt
        // pnName is NOT stored in plaintext, so user must provide it
        if (!passcode) {
          setPendingBiometricIdentity(identity);
          setShowBiometricPasscodeModal(true);
          setLoading(false);
          return;
        }

        // If pnName not provided, show modal to prompt for it
        // Note: We can't use identity.pnName because it's not stored (security)
        // User must provide both secrets
        if (!identity.pnName) {
          setPendingBiometricIdentity(identity);
          setShowBiometricPasscodeModal(true);
          setLoading(false);
          return;
        }

        // Decrypt and authenticate the identity using BOTH pnName and passcode
        // This will automatically store credentials in SecureCredentialManager
        const authSession = await IdentityCrypto.authenticateIdentity(
          encryptedIdentity,
          passcode,
          identity.pnName
        );

        // Store the session (credentials are already in SecureCredentialManager)
        await storage.storeSession(authSession);
        
        // Set authenticated user
        setAuthenticatedUser(authSession);
        
        // Update selected DID
        setSelectedDID(identity);
        
        // Update last accessed time
        await simpleStorage.updateIdentity({
          ...simpleIdentity,
          lastAccessed: new Date().toISOString()
        });
        
        // Close modal if open
        setShowBiometricPasscodeModal(false);
        setPendingBiometricIdentity(null);
        
        setSuccessWithTimeout('Successfully unlocked with biometrics!');
        setTimeout(() => setSuccessWithTimeout(null), 3000);
      } else if (result.fallbackToPasscode) {
        // Fall back to passcode authentication
        setSelectedDID(identity);
        setMainForm(prev => ({ ...prev, pnName: identity.pnName }));
        setError(result.error || 'Biometric authentication failed. Please enter your passcode.');
        setTimeout(() => setError(null), 9000);
      } else {
        throw new Error(result.error || 'Biometric authentication failed');
      }
    } catch (error: any) {
      logError('Biometric authentication error:', error);
      setBiometricPasscodeError(error.message || 'Biometric authentication failed');
      setError(error.message || 'Biometric authentication failed');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  // Handle passcode submission from biometric modal
  // SECURITY: Require BOTH pnName and passcode - both are secrets
  const handleBiometricPasscodeSubmit = async (pnName: string, passcode: string) => {
    if (!pendingBiometricIdentity) {
      return;
    }
    
    try {
      // Create identity object with provided pnName (not from storage - security)
      const identityWithPnName = {
        ...pendingBiometricIdentity,
        pnName: pnName
      };
      await handleBiometricAuth(identityWithPnName, passcode);
    } catch (error: any) {
      setBiometricPasscodeError(error.message || 'Failed to decrypt identity');
      throw error; // Re-throw so modal can handle it
    }
  };

  const handleBiometricSetupSuccess = () => {
    setSuccessWithTimeout('Biometric authentication set up successfully!');
    setTimeout(() => setSuccessWithTimeout(null), 3000);
  };



  const handleUnlockFromUsb = async (result: import('./components/unlock/UnlockFromUsbModal').UnlockFromUsbResult) => {
    const { authSession, identityToUnlock, identityData, publicKey, nickname, pnName, identityId } = result;
    await storage.storeSession(authSession);

    const data = identityData as Record<string, unknown>;
    const didInfo: DIDInfo = {
      id: identityId,
      pnName,
      nickname,
      email: (data.email as string) || '',
      phone: (data.phone as string) || '',
      recoveryEmail: (data.recoveryEmail as string) || '',
      recoveryPhone: (data.recoveryPhone as string) || '',
      createdAt: (data.createdAt as string) || new Date().toISOString(),
      status: (data.status as string) || 'active',
      custodiansRequired: (data.custodiansRequired as boolean) ?? true,
      custodiansSetup: (data.custodiansSetup as boolean) ?? false
    };

    try {
      const simpleStorage = SimpleStorage.getInstance();
      const simpleIdentity: SimpleIdentity = {
        id: publicKey,
        nickname,
        publicKey,
        encryptedData: identityToUnlock,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString()
      };
      await simpleStorage.storeIdentity(simpleIdentity);
    } catch (err) {
      logError('Failed to store ID file from USB unlock:', err);
    }

    setDids(prev => [...prev, didInfo]);
    setSelectedDID(didInfo);
    setAuthenticatedUser({ ...authSession, nickname });
    setMainForm({ pnName: '', passcode: '', uploadFile: null });
    setShowMainPNName(false);
    setShowMainPasscode(false);
    showSuccessMessage('pN unlocked from USB successfully!');
  };

  const handleMainFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!mainForm.pnName || !mainForm.passcode) {
      setError('Please enter both pnName and passcode');
      return;
    }

    try {
      await storage.init();
    } catch (error) {
      logError('Storage initialization error:', error);
      setError('Storage system error. Please refresh and try again.');
      setTimeout(() => setError(null), 9000);
      return;
    }
    
    // Check if we have either a stored identity selected, a file uploaded, or a synced identity
    const syncedIdentityKey = `synced-identity-${mainForm.pnName}`;
    const syncedIdentityData = localStorage.getItem(syncedIdentityKey);
    
    if (!selectedStoredIdentity && !mainForm.uploadFile && !syncedIdentityData) {
      setError('Please select an identity, upload a pN file, or sync from another device');
      return;
    }
    
    // Handle file upload logic here OR selected identity reference
    if (mainForm.uploadFile || selectedStoredIdentity) {
              logDebug('Processing file upload or selected identity reference');
      
      try {
        setLoading(true);
        setError(null);

                // Get identity data - either from uploaded file or from stored identity
        let identityData: any;
        let identityToUnlock: any;
    if (mainForm.uploadFile) {
          const fileContent = await mainForm.uploadFile.text();
          logDebug('File content from upload, length:', fileContent.length);
          
          // Parse the file as JSON
          try {
            identityData = JSON.parse(fileContent);
            logDebug('Parsed identity data:', identityData);
            logDebug('File structure - has identities array:', !!identityData.identities);
            logDebug('File structure - identities length:', identityData.identities?.length);
            logDebug('File structure - keys:', Object.keys(identityData));
                } catch (parseError) {
        logError('JSON parse error:', parseError);
        throw new Error('Invalid file format. Please use a valid pN file (.pn, .id, .json, or .identity).');
      }
        } else if (selectedStoredIdentity?.encryptedData) {
          // Use stored identity data - it's already the decrypted identity object
          identityToUnlock = selectedStoredIdentity.encryptedData;
          logDebug('Using stored identity data for selected identity');
        } else if (syncedIdentityData) {
          // Use synced identity data from device sync
          try {
            identityToUnlock = JSON.parse(syncedIdentityData);
            logDebug('Using synced identity data for device sync');
          } catch (parseError) {
            logError('Failed to parse synced identity data:', parseError);
            throw new Error('Invalid synced identity data');
          }
        } else {
          setError('Please upload the pN file to unlock this pN');
          setLoading(false);
          return;
        }

        // Handle different possible formats (only for file uploads, not stored identities)
        if (mainForm.uploadFile) {
          identityToUnlock = parsePortablePnBackup(identityData);
        }

        // Check if this is an encrypted identity
        logDebug('Checking identity type:', { 
          hasEncryptedData: !!identityToUnlock.encryptedData, 
          hasIV: !!identityToUnlock.iv, 
          hasSalt: !!identityToUnlock.salt 
        });
        
        if (identityToUnlock.encryptedData && identityToUnlock.iv && identityToUnlock.salt) {
          logDebug('Processing encrypted identity');
          // pnName is secret - not logged
          logDebug('Attempting authentication');
          logDebug('Identity to unlock publicKey:', identityToUnlock.publicKey);

          const deviceBoundEnvelope =
            mainForm.uploadFile && identityData && isDeviceBoundPnEnvelope(identityData)
              ? identityData
              : null;

          if (deviceBoundEnvelope) {
            const available = await checkDeviceBoundPnUnlockAvailable(
              deviceBoundEnvelope,
              recoveryVaultPnId
            );
            if (!available) {
              throw new Error(DEVICE_BOUND_PN_ERROR);
            }
          }
          
          // This is an encrypted identity, try to authenticate it
          let authSession;
          try {
            if (deviceBoundEnvelope) {
              const result = await authenticateDeviceBoundPn({
                envelope: deviceBoundEnvelope,
                pnName: mainForm.pnName,
                passcode: mainForm.passcode,
                pnIdentifier: recoveryVaultPnId,
              });
              authSession = result.authSession;
            } else {
              authSession = await IdentityCrypto.authenticateIdentity(
                identityToUnlock as any,
                mainForm.passcode,
                mainForm.pnName
              );
            }
            logDebug('Authentication successful, auth session created:', authSession);
          } catch (authError) {
            logError('Authentication failed:', authError);
            throw new Error(`Authentication failed: ${authError instanceof Error ? authError.message : 'Invalid credentials'}`);
          }

          // Store the session
          logDebug('Auth session created:', authSession);
          await storage.storeSession(authSession);
          logDebug('Session stored:', authSession);

          // Use stored identity nickname or derive from filename
          let finalNickname = selectedStoredIdentity?.nickname;
          if (!finalNickname && mainForm.uploadFile?.name) {
            finalNickname = mainForm.uploadFile.name
              .replace(/\.(json|pn|id|identity)$/i, '')
              .replace(/\([0-9]+\)$/, '')
              .replace(/backup$/i, '')
              .replace(/identity$/i, '')
              .replace(/[-_]/g, ' ')
              .trim();
          }
          if (!finalNickname) {
            finalNickname = `Identity (${identityToUnlock.id.slice(-8)})`;
          }

          logDebug('Using nickname:', finalNickname);

          // Create DID info for UI
          const didInfo: DIDInfo = {
            id: identityToUnlock.id,
            pnName: identityToUnlock.pnName,
            nickname: finalNickname,
            email: identityToUnlock.email || '',
            phone: identityToUnlock.phone || '',
            recoveryEmail: identityToUnlock.recoveryEmail || '',
            recoveryPhone: identityToUnlock.recoveryPhone || '',
            createdAt: identityToUnlock.createdAt || new Date().toISOString(),
            status: identityToUnlock.status || 'active',
            custodiansRequired: identityToUnlock.custodiansRequired || false,
            custodiansSetup: identityToUnlock.custodiansSetup || false
          };

          // Store the ID file using simple storage
          try {
            const simpleStorage = SimpleStorage.getInstance();
            const simpleIdentity: SimpleIdentity = {
              id: identityToUnlock.publicKey,
              nickname: finalNickname,
              publicKey: identityToUnlock.publicKey,
              encryptedData: identityToUnlock, // This is the decrypted data - we need to store the original encrypted data
              createdAt: new Date().toISOString(),
              lastAccessed: new Date().toISOString()
            };
            
            await simpleStorage.storeIdentity(simpleIdentity);
            logDebug('ID file stored using simple storage:', finalNickname);
            

            
            // Update the DID list to show the new identity
            setDids(prev => {
              const newDids = [...prev, {
                ...didInfo,
                idFile: identityToUnlock,
                fileName: mainForm.uploadFile?.name || 'stored-identity'
              }];
              return newDids;
            });
          } catch (error) {
            logError('Failed to store ID file:', error);
          }
          
          setDids(prev => {
            const newDids = [...prev, didInfo];
            return newDids;
          });
          setSelectedDID(didInfo);
          
          // Update the session with the correct nickname
          const updatedSession = {
            ...authSession,
            nickname: finalNickname
          };
          
          // Set authenticated user with correct nickname
          logDebug('Setting authenticated user:', updatedSession);
          setAuthenticatedUser(updatedSession);
          
          showSuccessMessage('pN file unlocked successfully!');
        } else {
          logDebug('Processing plain identity');
          // This appears to be a plain identity, but we need to validate credentials
          // Check if the pN Name matches the identity in the file
          if (identityToUnlock.pnName && identityToUnlock.pnName !== mainForm.pnName) {
            logError('pN Name mismatch:', { filePNName: identityToUnlock.pnName, formPNName: mainForm.pnName });
            throw new Error('pN Name does not match the identity in the file');
          }
          
          // For plain identities, we should still require some form of validation
          // For now, we'll require the pN Name to match and create a proper session
          const session = {
            id: identityToUnlock.id || 'plain-id',
            pnName: identityToUnlock.pnName || mainForm.pnName,
            nickname: identityToUnlock.nickname || identityToUnlock.pnName || 'User',
            accessToken: 'token-' + Date.now(),
            expiresIn: 3600,
            authenticatedAt: new Date().toISOString(),
            publicKey: identityToUnlock.publicKey || ''
          };

          // Store the session
          await storage.storeSession(session);
          logDebug('Session stored (plain):', session);

          // Create DID info for UI
          const didInfo: DIDInfo = {
            id: identityToUnlock.id || 'plain-id',
            pnName: identityToUnlock.pnName || mainForm.pnName,
            nickname: identityToUnlock.nickname || identityToUnlock.pnName || 'User',
            email: identityToUnlock.email || '',
            phone: identityToUnlock.phone || '',
            recoveryEmail: identityToUnlock.recoveryEmail || '',
            recoveryPhone: identityToUnlock.recoveryPhone || '',
            createdAt: identityToUnlock.createdAt || new Date().toISOString(),
            status: identityToUnlock.status || 'active',
            custodiansRequired: identityToUnlock.custodiansRequired || false,
            custodiansSetup: identityToUnlock.custodiansSetup || false
          };

          // Note: Plain identities are not stored in regular storage as they don't match EncryptedIdentity format
          logDebug('Plain identity processed - not stored in regular storage');
          

          
          // Identity already stored securely in encrypted format
          logDebug('Identity processed securely:', didInfo.id);
          
          setDids(prev => {
            const newDids = [...prev, didInfo];
            return newDids;
          });
          setSelectedDID(didInfo);
          
          // Set authenticated user
          setAuthenticatedUser(session);
          
          showSuccessMessage('pN file unlocked successfully!');
        }
        
        // Clear the form
        setMainForm({ pnName: '', passcode: '', uploadFile: null });
        setShowMainPNName(false);
        setShowMainPasscode(false);
        
        return; // Exit early since we handled the file upload
                      } catch (error: any) {
          logError('File unlock error:', error);
          setError(`Failed to unlock identity: ${error.message || 'Unknown error'}`);
          setTimeout(() => setError(null), 9000);
      } finally {
        setLoading(false);
      }
      return; // Exit early since we handled the file upload
    }
    
    // If we get here, no file was uploaded, so try simple storage
    try {
      setLoading(true);
      setError(null);

      // Use simple storage
      const simpleStorage = SimpleStorage.getInstance();
      const identities = await simpleStorage.getIdentities();
      logDebug('Simple storage identities found:', identities.length);
      
      // Find the identity to unlock
      let foundIdentity: SimpleIdentity | null = null;
      let authSession: AuthSession | null = null;
      
      for (const identity of identities) {
        try {
          const session = await IdentityCrypto.authenticateIdentity(
            identity.encryptedData, 
            mainForm.passcode, 
            mainForm.pnName
          );
          foundIdentity = identity;
          authSession = session;
          break;
        } catch (error) {
          logError('Failed to decrypt identity:', error);
          continue;
        }
      }

      if (!foundIdentity || !authSession) {
        throw new Error('No identity found with that pN name and passcode. Upload your .pn file to unlock.');
      }

      await storage.storeSession(authSession);
      setAuthenticatedUser(authSession);
      try {
        const { maybeMigrateVolumeId } = await import('./utils/volumeIdMigration');
        const credentials = SecureCredentialManager.getCredentials(authSession.id);
        await maybeMigrateVolumeId({
          publicKey: foundIdentity.publicKey,
          pnName: credentials?.pnName ?? mainForm.pnName,
          passcode: mainForm.passcode,
          authToken: apiToken
        });
      } catch {
        /* non-blocking */
      }
      setDids([{
        id: authSession.id,
        pnName: '',
        nickname: authSession.nickname,
        createdAt: authSession.authenticatedAt,
        status: 'active',
        displayName: authSession.nickname,
        custodiansRequired: true,
        custodiansSetup: false
      }]);
      
      // Clear the form
      setMainForm({ pnName: '', passcode: '', uploadFile: null });
      setShowMainPNName(false);
      setShowMainPasscode(false);
      
      // Show success message with proper timeout management
      showSuccessMessage('Identity unlocked successfully!');
      
    } catch (error: any) {
              logError('Authentication error:', error);
      setError(error.message || 'Failed to unlock identity');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  // Recovery functions
  const handleInitiateRecovery = async (recoveryData: {
    pnName: string;
    passcode: string;
    nickname: string;
    emailOrPhone: string;
  }) => {
    try {
      setLoading(true);
      setError(null);

      // Initialize storage if not already done
      await storage.init();

      // Get stored identities
      const storedIdentities = await storage.getIdentities();
      
      // Find the identity to recover
      const foundIdentity = storedIdentities.find(stored => {
        try {
          // Try to decrypt and verify the identity
          const decryptedData = JSON.parse(stored.encryptedData);
          return (
            decryptedData.pnName === recoveryData.pnName &&
            decryptedData.nickname === recoveryData.nickname &&
            (decryptedData.recoveryEmail === recoveryData.emailOrPhone || 
             decryptedData.recoveryPhone === recoveryData.emailOrPhone)
          );
        } catch {
          return false;
        }
      });

      if (!foundIdentity) {
        throw new Error('No matching PN found. Please check your information.');
      }

      // Verify passcode cryptographically
      const isValidPasscode = await IdentityCrypto.verifyPasscode(
        recoveryData.passcode,
        foundIdentity.encryptedData,
        foundIdentity.salt
      );

      if (!isValidPasscode) {
        throw new Error('Invalid passcode. Please check your information.');
      }

      // Create recovery request with old identity hash for license transfer
      const recoveryRequest: RecoveryRequest = {
        id: `recovery-${Date.now()}`,
        requestingDid: foundIdentity.publicKey, // Use public key since ID is encrypted
        requestingUser: recoveryData.pnName,
        timestamp: new Date().toISOString(),
        status: 'pending',
        approvals: [],
        denials: [],
        signatures: [], // ZK proof signatures will be added here
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), // 72 hours
        requiredApprovals: recoveryThreshold,
        currentApprovals: 0,
        oldIdentityHash: foundIdentity.publicKey // In real implementation, this would be the actual old identity hash
      };

      setRecoveryRequests(prev => [...prev, recoveryRequest]);
      setShowRecoveryModal(false);
      setSuccessWithTimeout('Recovery request initiated! Notifying custodians...');
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to initiate recovery');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  const generateCustodianQRCode = async (custodianData: CustodianInvitationForm & { id?: string }) => {
    try {
      const recoveryAuth = getRecoveryAuthSession();
      if (!recoveryAuth) {
        throw new Error(recoveryAuthRequiredMessage());
      }
      if (!canManageCustodians) {
        throw new Error(deviceAuth.deviceRequiredMessage);
      }
      const custodianId = custodianData.id || selectedCustodianForInvitation?.id;
      if (!custodianId || !authenticatedUser?.id) {
        throw new Error('Select a custodian and unlock your identity first');
      }
      const encryptedIdentity = recoveryAuth.encryptedIdentity;
      const invitationId = `inv-${Date.now()}`;
      const existingCustodian = custodians.find((c) => c.id === custodianId);
      const vaultInvited = recoveryVaultSummary?.custodians.some(
        (c) =>
          c.custodianId === custodianId
          && c.status !== 'revoked'
          && c.status !== 'accepted'
      );
      const pnId = recoveryVaultPnId || authenticatedUser.id;
      const { assignCustodianVaultAndIssueCredential } = await import('./services/recoveryCustodianSetup');
      const vault = await assignCustodianVaultAndIssueCredential({
        custodianId,
        custodianName: custodianData.name,
        custodianType: custodianData.type,
        identityId: authenticatedUser.id,
        encryptedIdentity,
        invitationId,
        threshold: recoveryThreshold,
        apiToken,
        userPnIdentifier: pnId,
        pnName: recoveryAuth.pnName,
        passcode: recoveryAuth.passcode,
        unrevokable: custodianData.unrevokable === true,
        resendExisting: Boolean(vaultInvited || existingCustodian?.status === 'pending'),
      });

      const invitationData = {
        invitationId,
        custodianId,
        custodianName: custodianData.name,
        custodianType: custodianData.type === 'self' ? 'self-recovery' : custodianData.type,
        contactType: custodianData.contactType,
        contactValue: custodianData.contactValue,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000),
        identityName: authenticatedUser?.nickname || 'Unknown Identity',
        identityUsername: authenticatedUser?.nickname || authenticatedUser?.id || 'unknown',
        identityPublicKey: encryptedIdentity.publicKey,
        shareIndex: vault.shareIndex,
        custodianshipZkp: vault.custodianshipZkp
      };

      const deepLinkData = {
        invitationId: invitationData.invitationId,
        custodianId: invitationData.custodianId,
        custodianName: invitationData.custodianName,
        custodianType: invitationData.custodianType,
        contactType: invitationData.contactType,
        contactValue: invitationData.contactValue,
        identityName: invitationData.identityName,
        identityUsername: invitationData.identityUsername,
        identityPublicKey: invitationData.identityPublicKey,
        shareIndex: invitationData.shareIndex,
        custodianshipZkp: invitationData.custodianshipZkp
      };

      setCustodians(prev => prev.map(c =>
        c.id === custodianId
          ? { ...c, status: 'pending' as const, canApprove: false, lastVerified: new Date().toISOString() }
          : c
      ));

      void refreshRecoveryVault();

      const deepLink = `${window.location.origin}?custodian-invitation=${encodeURIComponent(JSON.stringify(deepLinkData))}`;
      
      // Generate QR code with deep link
      const qrCodeDataURL = await QRCode.toDataURL(deepLink, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      setCustodianQRCode(qrCodeDataURL);
      setCustodianContactInfo(custodianData);
    } catch (error) {
              logError('Failed to generate QR code:', error);
    }
  };

  const handleContactAction = (contactType: 'email' | 'phone', contactValue: string) => {
    // Generate the direct link for custodian invitation
    const invitationData = {
      invitationId: `inv-${Date.now()}`,
      custodianName: custodianContactInfo.name,
      custodianType: custodianContactInfo.type === 'self' ? 'self-recovery' : custodianContactInfo.type,
      contactType: custodianContactInfo.contactType,
      contactValue: custodianContactInfo.contactValue,
      identityName: authenticatedUser?.nickname || 'Unknown Identity',
      identityUsername: authenticatedUser?.pnName || 'unknown',
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
    
    const directLink = `${window.location.origin}?custodian-invitation=${encodeURIComponent(JSON.stringify(invitationData))}`;
    
    if (contactType === 'email') {
      const subject = 'Identity Protocol - Custodian Invitation';
      const body = `You have been invited to be a recovery custodian for ${authenticatedUser?.nickname || 'an identity'}.

To accept this custodianship:
1. Click this link: ${directLink}
2. Unlock your pN identity
3. Enter the passcode provided by the identity owner
4. Confirm the custodianship

This invitation expires in 24 hours.`;
      window.open(`mailto:${contactValue}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    } else if (contactType === 'phone') {
      const message = `You've been invited as a custodian for ${authenticatedUser?.nickname || 'an identity'}. Click: ${directLink} (Passcode required)`;
      window.open(`sms:${contactValue}?body=${encodeURIComponent(message)}`);
    }
  };

  const handleAddCustodian = async (custodianData: CustodianInvitationForm) => {
    try {
      if (!getRecoveryAuthSession()) {
        throw new Error(recoveryAuthRequiredMessage());
      }
      if (!canManageCustodians) {
        throw new Error(deviceAuth.deviceRequiredMessage);
      }
      // Validate contact information
      if (!custodianData.name.trim() || !custodianData.contactValue.trim()) {
        throw new Error('Name and contact information are required');
      }

      // Check if we already have 5 custodians (maximum)
      if (custodians.length >= 5) {
        throw new Error('You can only have up to 5 custodians');
      }

      // Add custodian as pending
      const newCustodian: RecoveryCustodian = {
        id: `custodian-${Date.now()}`,
        identityId: authenticatedUser?.id || selectedDID?.id || 'temp-identity',
        name: custodianData.name,
        type: custodianData.type,
        status: 'pending', // Start as pending
        addedAt: new Date().toISOString(),
        canApprove: false, // Cannot approve until validated
        contactType: custodianData.contactType,
        contactValue: custodianData.contactValue,
        publicKey: crypto.randomUUID(), // Generate a unique public key
        trustLevel: 'medium', // Default trust level
        passcode: custodianData.passcode // Store the 6-digit passcode
      };

      setCustodians(prev => [...prev, newCustodian]);
      setShowAddCustodianModal(false);

      // Store custodian update in cloud database for cross-platform sync
      try {
        await cloudSyncManager.initialize();
        await cloudSyncManager.storeUpdate({
          type: 'custodian',
          identityId: authenticatedUser?.id || selectedDID?.id || 'temp-identity',
          publicKey: authenticatedUser?.publicKey || '',
          data: {
            action: 'add',
            custodian: newCustodian
          },
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
        logDebug('Custodian update stored in cloud database for cross-platform sync');
      } catch (error) {
                  logError('Failed to store custodian update in cloud:', error);
        // Don't fail the entire operation if cloud sync fails
      }

      setSuccessWithTimeout('Custodian added as pending! Use the "Send Invitation" button to generate and send the QR code. Changes will sync across platforms.');
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to add custodian');
      setTimeout(() => setError(null), 9000);
    }
  };



  // Handle custodian invitation acceptance — store ZK custodianship credential only (no share bytes)
  const handleCustodianAcceptance = async () => {
    try {
      if (!pendingCustodianInvitationData) {
        throw new Error('No pending invitation found');
      }

      if (!custodianAcceptanceData.contactValue.trim() || !custodianAcceptanceData.passcode.trim()) {
        throw new Error('Please enter your contact information and the passcode');
      }

      if (custodianAcceptanceData.contactValue !== pendingCustodianInvitationData.contactValue) {
        throw new Error('Contact information does not match the invitation');
      }

      const acceptancePasscode = custodianAcceptanceData.passcode.trim();
      const isValidPasscode = /^\d{6}$/.test(acceptancePasscode);
      if (!isValidPasscode) {
        throw new Error('Invalid passcode. Enter the 6-digit code from the identity owner.');
      }

      const invitation = pendingCustodianInvitationData as {
        custodianId?: string;
        identityPublicKey?: string;
        shareIndex?: number;
        custodianshipZkp?: string;
        identityName?: string;
        identityUsername?: string;
        invitationId?: string;
      };

      if (!invitation.custodianshipZkp || !invitation.custodianId || !invitation.identityPublicKey) {
        throw new Error('Invitation is missing custodianship credential. Ask the owner to resend the invitation.');
      }

      storeCustodianshipCredential({
        custodianId: invitation.custodianId,
        identityPublicKey: invitation.identityPublicKey,
        identityName: invitation.identityName || 'Identity',
        identityUsername: invitation.identityUsername || '',
        shareIndex: invitation.shareIndex || 0,
        custodianshipZkp: invitation.custodianshipZkp,
        custodianPasscode: acceptancePasscode,
        acceptedAt: new Date().toISOString()
      });

      if (apiToken && invitation.identityPublicKey) {
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        const ownerPn = await VolumeIdGenerator.generateCanonicalVolumeId(invitation.identityPublicKey);
        await acceptRecoveryCustodianship(ownerPn, apiToken, invitation.custodianId, invitation.custodianshipZkp);
      }

      const newCustodianship = {
        id: `custodianship-${invitation.custodianId}`,
        identityId: invitation.invitationId || invitation.custodianId,
        identityName: invitation.identityName || 'Identity',
        identityUsername: invitation.identityUsername || '',
        identityPublicKey: invitation.identityPublicKey,
        status: 'active' as const,
        canApprove: true
      };

      setCustodianships(prev => {
        const filtered = prev.filter(
          (c) => c.identityPublicKey !== invitation.identityPublicKey
        );
        return [...filtered, newCustodianship];
      });

      setShowCustodianAcceptanceModal(false);
      setPendingCustodianInvitationData(null);
      setCustodianAcceptanceData({ contactType: 'email', contactValue: '', passcode: '' });

      setSuccessWithTimeout('Custodianship accepted. You hold an authorization credential only — no secret shares.');
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to accept custodianship');
      setTimeout(() => setError(null), 9000);
    }
  };

  // ZK authorization recovery approval (custodian never submits share bytes)
  const handleApproveRecovery = async (requestId: string, custodianshipId: string) => {
    try {
      setLoading(true);
      setError(null);

      const recoveryRequest = recoveryRequests.find((req) => req.id === requestId);
      const custodianship = custodianships.find((c) => c.id === custodianshipId);
      const identityPublicKey =
        custodianship?.identityPublicKey || recoveryRequest?.requestingDid || '';

      if (!recoveryRequest && !custodianship) {
        throw new Error('Recovery request not found');
      }

      const cred = (await import('./services/recoveryCredentialStorage')).getCustodianshipCredential(
        identityPublicKey,
        custodianshipId.replace('custodianship-', '')
      ) || (await import('./services/recoveryCredentialStorage')).getCustodianshipCredential(
        identityPublicKey,
        custodianship?.identityId || ''
      );

      const custodianId = cred?.custodianId || custodianshipId.replace('custodianship-', '');
      const custodianPasscode = cred?.custodianPasscode || '';

      const { approveRecoveryWithZkp } = await import('./components/recovery/useRecoveryHandlers');
      let userPnIdentifier = identityPublicKey;
      if (apiToken && identityPublicKey) {
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        userPnIdentifier = await VolumeIdGenerator.generateCanonicalVolumeId(identityPublicKey);
      }

      let custodianEncryptedIdentity: EncryptedIdentity | undefined;
      if (authenticatedUser?.id) {
        const encPartial = await getEncryptedIdentityForApiToken(authenticatedUser.publicKey || authenticatedUser.id);
        if (encPartial) {
          custodianEncryptedIdentity = {
            publicKey: authenticatedUser.publicKey || authenticatedUser.id,
            encryptedData: encPartial.encryptedData,
            iv: encPartial.iv,
            salt: encPartial.salt
          };
        }
      }

      const { stored, thresholdMet } = await approveRecoveryWithZkp({
        requestId,
        custodianId,
        identityPublicKey,
        custodianPasscode,
        threshold: recoveryThreshold,
        authToken: apiToken || undefined,
        userPnIdentifier,
        custodianIdentityId: authenticatedUser?.id,
        custodianEncryptedIdentity
      });

      setRecoveryRequests((prev) =>
        prev.map((req) =>
          req.id === requestId
            ? {
                ...req,
                approvals: [...req.approvals, custodianId],
                proofs: [...(req.proofs || []), custodianId],
                signatures: [...req.signatures, custodianId]
              }
            : req
        )
      );

      if (thresholdMet) {
        const envelopeRaw = sessionStorage.getItem(`pn_recovery_envelope_${requestId}`);
        const identityRaw = sessionStorage.getItem(`pn_recovery_identity_${requestId}`);
        if (envelopeRaw && identityRaw && apiToken) {
          const { fetchSharesAfterThreshold } = await import('./components/recovery/useRecoveryHandlers');
          const shares = await fetchSharesAfterThreshold({
            userPnIdentifier,
            authToken: apiToken,
            requestId,
            identityPublicKey
          });
          setPendingRecoveryCompletion({
            requestId,
            envelope: JSON.parse(envelopeRaw),
            existingIdentity: JSON.parse(identityRaw),
            shares
          });
          setShowRecoveryPasscodeModal(true);
        } else {
          setSuccessWithTimeout('Threshold met. Open recovery on the device with your .pn file to set a new passcode.');
        }
      } else {
        setSuccessWithTimeout('Recovery authorization submitted. Waiting for more custodians…');
        setTimeout(() => setSuccessWithTimeout(null), 5000);
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Recovery approval failed');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateRecoveryFromPn = async (file: File, claimantName: string, emailOrPhone: string) => {
    try {
      setLoading(true);
      setError(null);
      const { initiateRecoveryFromPnFile } = await import('./components/recovery/useRecoveryHandlers');
      const req = await initiateRecoveryFromPnFile({
        file,
        claimantName,
        emailOrPhone,
        threshold: recoveryThreshold,
        authToken: apiToken
      });
      setRecoveryRequests((prev) => [
        ...prev,
        {
          id: req.id,
          requestingDid: req.publicKey,
          requestingUser: claimantName,
          timestamp: new Date().toISOString(),
          status: 'pending',
          approvals: [],
          denials: [],
          signatures: [],
          proofs: [],
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          requiredApprovals: recoveryThreshold,
          currentApprovals: 0,
          oldIdentityHash: req.publicKey,
          claimantContactValue: emailOrPhone
        }
      ]);
      setShowRecoveryModal(false);
      setSuccessWithTimeout('Recovery started. Custodians will submit authorization proofs.');
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to start recovery');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryPasscodeSubmit = async (newPasscode: string) => {
    if (!pendingRecoveryCompletion) return;
    setLoading(true);
    try {
      const result = await completeRecoveryWithShares({
        envelope: pendingRecoveryCompletion.envelope,
        shares: pendingRecoveryCompletion.shares,
        newPasscode,
        existingIdentity: pendingRecoveryCompletion.existingIdentity
      });

      const simpleStorage = (await import('./utils/simpleStorage')).SimpleStorage.getInstance();
      const { PNNameHash } = await import('./utils/security/pnNameHash');
      const pnNameHash = await PNNameHash.getLookupKey(result.pnName);
      await simpleStorage.storeIdentity({
        id: result.identity.publicKey,
        nickname: result.pnName,
        pnNameHash,
        publicKey: result.identity.publicKey,
        encryptedData: result.identity,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString()
      });

      const authSession = await IdentityCrypto.authenticateIdentity(
        result.identity,
        newPasscode,
        result.pnName
      );
      setAuthenticatedUser(authSession);
      setRecoveredIdentityExport(result.identity);
      setShowRecoveryPasscodeModal(false);
      setPendingRecoveryCompletion(null);
      setRecoveredDID({
        id: authSession.id,
        pnName: result.pnName,
        nickname: authSession.nickname || result.pnName,
        email: '',
        phone: '',
        recoveryEmail: '',
        recoveryPhone: '',
        createdAt: new Date().toISOString(),
        status: 'active',
        custodiansRequired: true,
        custodiansSetup: true,
        isEncrypted: true,
        displayName: authSession.nickname || result.pnName,
        publicKey: result.identity.publicKey
      });
      setShowRecoveryCompleteModal(true);
      setSuccessWithTimeout('Recovery complete. Download your updated .pn file and reconnect Google Drive.');
    } finally {
      setLoading(false);
    }
  };

  // Recovery denial handler (currently unused but available for future use)
  const handleDenyRecovery = (requestId: string, custodianId: string) => {
    setRecoveryRequests(prev => {
      const updatedRequests = prev.map(req => 
        req.id === requestId 
          ? { ...req, denials: [...req.denials, custodianId] }
          : req
      );
      
      // Check if enough denials to reject the recovery
      const updatedRequest = updatedRequests.find(req => req.id === requestId);
      if (updatedRequest && updatedRequest.denials.length >= recoveryThreshold) {
        // Recovery denied - update status
        const finalUpdatedRequests = updatedRequests.map(req => 
          req.id === requestId 
            ? { ...req, status: 'denied' as const }
            : req
        );
        return finalUpdatedRequests;
      }
      
      return updatedRequests;
    });
    
    setSuccessWithTimeout('Recovery denied.');
    setTimeout(() => setSuccessWithTimeout(null), 5000);
  };

  const handleGenerateRecoveryKey = async (purpose: RecoveryKey['purpose'], description?: string) => {
    try {
      setLoading(true);
      setError(null);

      // Initialize storage if not already done
      await storage.init();

      // Generate a cryptographically secure recovery key
      const keyData = await IdentityCrypto.generateRecoveryKey(
        authenticatedUser?.id || 'unknown',
        purpose
      );
      
      const recoveryKey: RecoveryKey = {
        id: `key-${Date.now()}`,
        identityId: authenticatedUser?.id || selectedDID?.id || 'unknown',
        keyData,
        createdAt: new Date().toISOString(),
        purpose,
        description
      };

      setRecoveryKeys(prev => [...prev, recoveryKey]);
      setShowRecoveryKeyModal(false);

      // Store recovery key update in cloud database for cross-platform sync
      try {
        await cloudSyncManager.initialize();
        await cloudSyncManager.storeUpdate({
          type: 'recovery-key',
          identityId: authenticatedUser?.id || selectedDID?.id || 'unknown',
          publicKey: authenticatedUser?.publicKey || '',
          data: {
            action: 'generate',
            recoveryKey
          },
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
        logDebug('Recovery key update stored in cloud database for cross-platform sync');
      } catch (error) {
                  logError('Failed to store recovery key update in cloud:', error);
        // Don't fail the entire operation if cloud sync fails
      }

      setSuccessWithTimeout('Recovery key generated successfully! Download and store it securely. Changes will sync across platforms.');
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to generate recovery key');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadRecoveryKey = (keyId: string) => {
    const key = recoveryKeys.find(k => k.id === keyId);
    if (!key) return;

    const keyData = {
      recoveryKey: key.keyData,
      identityId: key.identityId,
      purpose: key.purpose,
      description: key.description,
      createdAt: key.createdAt,
      instructions: `
        RECOVERY KEY INSTRUCTIONS:
        
        This recovery key is for triggering the recovery system for your Identity Protocol ID.
        It does NOT unlock your identity directly - it only initiates the recovery process.
        
        To use this key:
        1. Go to the Identity Protocol dashboard
        2. Click "Recover Access"
        3. Enter your recovery key
        4. Your custodians will be notified to approve the recovery
        
        Store this key securely:
        - Keep it in a safe location
        - Consider giving copies to trusted individuals
        - You can provide this to legal entities (will, insurance, etc.)
        
        Purpose: ${key.purpose}
        Description: ${key.description || 'No description provided'}
        Created: ${key.createdAt}
      `
    };

    const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
    a.download = `recovery-key-${key.purpose}-${key.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    setSuccessWithTimeout('Recovery key downloaded successfully!');
    setTimeout(() => setSuccessWithTimeout(null), 5000);
  };

  const handleInitiateRecoveryWithKey = async (recoveryKey: string, contactInfo: {
    contactType: 'email' | 'phone';
    contactValue: string;
    claimantName: string;
  }) => {
    try {
      setLoading(true);
      setError(null);

      // Validate contact information
      if (!contactInfo.claimantName.trim() || !contactInfo.contactValue.trim()) {
        throw new Error('Please provide claimant name and contact information.');
      }

      // Find the recovery key
      const key = recoveryKeys.find(k => k.keyData === recoveryKey);
      if (!key) {
        throw new Error('Invalid recovery key. Please check and try again.');
      }

      // Find the associated identity
      const foundDID = dids.find(did => did.id === key.identityId);
      if (!foundDID) {
        throw new Error('Identity not found for this recovery key.');
      }

      // Create recovery request with claimant details
      const recoveryRequest: RecoveryRequest = {
        id: `recovery-${Date.now()}`,
        requestingDid: foundDID.id,
        requestingUser: contactInfo.claimantName,
        timestamp: new Date().toISOString(),
        status: 'pending',
        approvals: [],
        denials: [],
        signatures: [], // ZK proof signatures will be added here
        claimantContactType: contactInfo.contactType,
        claimantContactValue: contactInfo.contactValue
      };

      setRecoveryRequests(prev => [...prev, recoveryRequest]);
      setShowRecoveryKeyInputModal(false);
      setRecoveryKeyInput('');
      setRecoveryKeyContactInfo({
        contactType: 'email',
        contactValue: '',
        claimantName: ''
      });
      setSuccessWithTimeout(`Recovery initiated by ${contactInfo.claimantName}! Notifying custodians...`);
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to initiate recovery with key');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCustodian = (custodianId: string) => {
    if (!getRecoveryAuthSession()) {
      setError(recoveryAuthRequiredMessage());
      setTimeout(() => setError(null), 9000);
      return;
    }
    if (!canManageCustodians) {
      setError(deviceAuth.deviceRequiredMessage);
      setTimeout(() => setError(null), 9000);
      return;
    }
    const vaultRow = recoveryVaultSummary?.custodians.find((c) => c.custodianId === custodianId);
    if (vaultRow?.unrevokable) {
      setError('Protected custodians cannot be revoked. Use an alternative pN you control as a protected anchor.');
      setTimeout(() => setError(null), 9000);
      return;
    }

    if (
      vaultRow
      && vaultRow.status === 'accepted'
      && (recoveryVaultSummary?.counts.acceptedUnrevokable ?? 0) < 1
    ) {
      const proceed = window.confirm(
        'Recovery cannot complete without at least one accepted protected custodian. Add and accept a protected custodian (e.g. your own alt pN) before removing operational custodians. Revoke anyway?'
      );
      if (!proceed) return;
    }

    const removedCustodian = custodians.find(c => c.id === custodianId);
    setCustodians(prev => prev.filter(c => c.id !== custodianId));

    if (removedCustodian && apiToken && recoveryVaultPnId) {
      void revokeRecoveryCustodian(recoveryVaultPnId, apiToken, custodianId, recoveryThreshold)
        .then(() => refreshRecoveryVault())
        .catch((error) => {
          logError('Failed to revoke custodian on vault:', error);
        });
    }

    // Store custodian removal in cloud database for cross-platform sync
    if (removedCustodian) {
      cloudSyncManager.initialize().then(() => {
        return cloudSyncManager.storeUpdate({
          type: 'custodian',
          identityId: authenticatedUser?.id || selectedDID?.id || 'temp-identity',
          publicKey: authenticatedUser?.publicKey || '',
          data: {
            action: 'remove',
            custodianId,
            custodian: removedCustodian
          },
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
      }).then(() => {
        logDebug('Custodian removal stored in cloud database for cross-platform sync');
      }).catch((error) => {
                  logError('Failed to store custodian removal in cloud:', error);
        // Don't fail the entire operation if cloud sync fails
      });
    }

    setSuccessWithTimeout('Custodian removed successfully. Changes will sync across platforms.');
    setTimeout(() => setSuccessWithTimeout(null), 5000);
  };

  // Tool Settings Handlers
  const handleOpenToolSettings = (toolId: string) => {
    setSelectedToolId(toolId);
    setShowToolSettingsModal(true);
  };

  const handleToggleToolDataPoint = async (toolId: string, dataPointId: string, enabled: boolean) => {
    const tool = privacySettings.toolPermissions[toolId];
    if (!tool) return;

    // Required data points must always be included
    const requiredDataPoints = tool.requiredDataPoints || [];
    
    // For optional data points, add/remove based on enabled flag
    // For required data points, always include them
    const newDataPoints = enabled
      ? [...new Set([...tool.dataPoints, dataPointId])] // Ensure no duplicates
      : tool.dataPoints.filter(dp => dp !== dataPointId && !requiredDataPoints.includes(dp)); // Don't remove required
    
    // Always include required data points
    const finalDataPoints = [...new Set([...newDataPoints, ...requiredDataPoints])];

    const newSettings = {
      ...privacySettings,
      toolPermissions: {
        ...privacySettings.toolPermissions,
        [toolId]: {
          ...tool,
          dataPoints: finalDataPoints,
          requiredDataPoints: tool.requiredDataPoints || [],
          optionalDataPoints: tool.optionalDataPoints || []
        }
      }
    };
    setPrivacySettings(newSettings);

    // Persist to Google Drive via API
    try {
      const credentials = SecureCredentialManager.getCredentials(authenticatedUser?.id || '');
      if (!credentials || !authenticatedUser?.id) {
        console.warn('[App] Cannot persist permissions - credentials not available');
        return;
      }

      const authToken = authenticatedUser.accessToken || authenticatedUser.authToken;
      if (!authToken) {
        console.warn('[App] Cannot persist permissions - no auth token');
        return;
      }

      // Get pN identifier
      const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
      const pnIdentifier = await VolumeIdGenerator.generateVolumeId({
        pnName: credentials.pnName,
        passcode: credentials.passcode,
        publicKey: authenticatedUser.publicKey || ''
      });

      // Store permissions via API (will be saved to Google Drive)
      const path = `/api/users/${pnIdentifier}/third-party-permissions`;
      const response = await ownerFetch(authToken, 'PUT', path, {
        toolId,
        permission: newSettings.toolPermissions[toolId],
      });

      if (!response.ok) {
        console.error('Failed to persist permissions:', response.status);
      } else {
        console.log('✅ Permissions persisted to Google Drive');
      }
    } catch (error) {
      console.error('Error persisting permissions:', error);
    }
  };

  const handleSetToolDataPointRequired = (toolId: string, dataPointId: string, required: boolean) => {
    const tool = privacySettings.toolPermissions[toolId];
    if (!tool) return;

    const currentRequired = tool.requiredDataPoints || [];
    const currentOptional = tool.optionalDataPoints || [];

    const newRequiredDataPoints = required
      ? [...currentRequired.filter(dp => dp !== dataPointId), dataPointId]
      : currentRequired.filter(dp => dp !== dataPointId);
    
    const newOptionalDataPoints = required
      ? currentOptional.filter(dp => dp !== dataPointId)
      : [...currentOptional.filter(dp => dp !== dataPointId), dataPointId];

    const newSettings = {
      ...privacySettings,
      toolPermissions: {
        ...privacySettings.toolPermissions,
        [toolId]: {
          ...tool,
          requiredDataPoints: newRequiredDataPoints,
          optionalDataPoints: newOptionalDataPoints
        }
      }
    };
    setPrivacySettings(newSettings);
  };

  const handleDeactivateTool = (toolId: string) => {
    const newSettings = {
      ...privacySettings,
      toolPermissions: {
        ...privacySettings.toolPermissions,
        [toolId]: {
          ...privacySettings.toolPermissions[toolId],
          status: privacySettings.toolPermissions[toolId].status === 'active' ? 'revoked' as const : 'revoked' as const
        }
      }
    };
    setPrivacySettings(newSettings);

    // Store privacy settings update in cloud database for cross-platform sync
    cloudSyncManager.initialize().then(() => {
      return cloudSyncManager.storeUpdate({
        type: 'privacy',
        identityId: authenticatedUser?.id || selectedDID?.id || 'temp-identity',
        publicKey: authenticatedUser?.publicKey || '',
        data: {
          action: 'update',
          toolId,
          newSettings
        },
        updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
      });
    }).then(() => {
              logDebug('Privacy settings update stored in cloud database for cross-platform sync');
    }).catch((error) => {
                logError('Failed to store privacy settings update in cloud:', error);
      // Don't fail the entire operation if cloud sync fails
    });

    setSuccessWithTimeout('Tool status updated successfully. Changes will sync across platforms.');
    setTimeout(() => setSuccessWithTimeout(null), 5000);
  };

  // Helper function to map data point ID to proof type for ZKP API
  const mapDataPointIdToProofType = (dataPointId: string): 'age_verification' | 'identity_verification' | 'location_verification' | 'document_verification' => {
    switch (dataPointId) {
      case 'age_attestation':
        return 'age_verification';
      case 'identity_attestation':
        return 'identity_verification';
      case 'location_verification':
        return 'location_verification';
      case 'document_verification':
        return 'document_verification';
      default:
        // Default to identity_verification for unknown data points
        return 'identity_verification';
    }
  };

  const handleRequestDataPoint = async (dataPointId: string) => {
    try {
      const dataPoint = STANDARD_DATA_POINTS[dataPointId];
      if (!dataPoint) {
        setError('Unknown data point');
        return;
      }

      // Check if user has already attested this data point - from API server (Google Drive)
      let existingData = null;
      
        const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
        if (!credentials) {
        console.warn('[App] Credentials not available for checking existing data point');
      } else {
        const authToken = authenticatedUser.accessToken || authenticatedUser.authToken;
        if (authToken) {
          try {
            // Check API server (Google Drive) for existing data point - NO localStorage
            const { ZKPDataPointsService } = await import('./utils/zkpDataPointsService');
            const existingDataPoint = await ZKPDataPointsService.getDataPoint(
              authenticatedUser.id,
              credentials,
              authToken,
              dataPointId,
              authenticatedUser.publicKey
            );
            
            if (existingDataPoint) {
              console.log('[App] Found existing data point in API:', existingDataPoint.dataPointId);
              
              // Decrypt userData if available for editing
              if (existingDataPoint.encryptedUserData) {
                try {
                  // SECURITY: Decryption requires BOTH pnName and passcode
                  // encryptedUserData is stored as JSON string of EncryptedData object
                  // Handle both string and object cases (API might return object directly)
                  let encryptedDataObj;
                  if (typeof existingDataPoint.encryptedUserData === 'string') {
                    try {
                      encryptedDataObj = JSON.parse(existingDataPoint.encryptedUserData);
                    } catch (parseError) {
                      // If parsing fails, it might be "[object Object]" string or invalid format
                      console.warn('[App] Failed to parse encryptedUserData string:', parseError);
                      throw new Error('Invalid encryptedUserData format');
                    }
                  } else if (typeof existingDataPoint.encryptedUserData === 'object' && existingDataPoint.encryptedUserData !== null) {
                    // Already an object (from API JSON response)
                    encryptedDataObj = existingDataPoint.encryptedUserData;
                  } else {
                    throw new Error('encryptedUserData is neither string nor object');
                  }
                  
                  const decryptedUserDataJson = await IdentityCrypto.decryptData(
                    encryptedDataObj,
                    credentials.pnName,
                    credentials.passcode
                  );
                  existingData = JSON.parse(decryptedUserDataJson);
                  console.log('[App] Decrypted existing userData for editing:', existingData);
                } catch (error) {
                  console.warn('[App] Failed to decrypt userData, will show empty form:', error);
                  existingData = null;
                }
              }
            }
          } catch (error) {
            console.warn('[App] Error checking for existing data point:', error);
            // Continue without existing data
          }
        }
      }
      
      setCurrentDataPoint(dataPoint);
      setCurrentDataPointExistingData(existingData);
      console.log('🔄 [App] Opening DataPointInputModal', {
        dataPointId,
        dataPointName: dataPoint.name,
        hasExistingData: !!existingData
      });
      setShowDataPointInputModal(true);
    } catch (error) {
      console.error('❌ [App] Error loading existing data, using fallback:', error);
      // Fallback to new data collection
      const dataPoint = STANDARD_DATA_POINTS[dataPointId];
      setCurrentDataPoint(dataPoint);
      setCurrentDataPointExistingData(null);
      console.log('🔄 [App] Opening DataPointInputModal (fallback)', {
        dataPointId,
        dataPointName: dataPoint.name
      });
      setShowDataPointInputModal(true);
    }
  };

    const handleDataPointInputComplete = async (proofs: any[], userData: any) => {
    console.log('🔄 [DataPointInput] handleDataPointInputComplete called', { 
      proofsCount: proofs.length, 
      dataPointId: currentDataPoint?.id,
      hasUserData: !!userData 
    });
      
    try {
      const dataPointId = currentDataPoint?.id;
      if (!dataPointId || proofs.length === 0) {
        throw new Error('Invalid data point or proof');
      }

      const proof = proofs[0];
        const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
        if (!credentials) {
        throw new Error('Credentials not available');
        }
        
      const authToken = authenticatedUser.accessToken || authenticatedUser.authToken;
      if (!authToken) {
        throw new Error('No access token available. Please re-authenticate.');
        }
        
      // Convert to API format
      const { ZKPDataPointsService } = await import('./utils/zkpDataPointsService');
        
      // Encrypt userData for storage (so it can be retrieved for editing)
      let encryptedUserData: string | undefined;
      if (userData && Object.keys(userData).length > 0) {
        try {
          const userDataJson = JSON.stringify(userData);
          // SECURITY: Encryption requires BOTH pnName and passcode
          const encryptedDataObj = await IdentityCrypto.encryptData(
            userDataJson,
            credentials.pnName,
            credentials.passcode
          );
          // Serialize EncryptedData object to string for storage
          encryptedUserData = JSON.stringify(encryptedDataObj);
        } catch (error) {
          console.warn('Failed to encrypt userData, continuing without it:', error);
        }
      }
      
            const zkpDataPoint = {
              dataPointId: dataPointId,
              proofType: mapDataPointIdToProofType(dataPointId),
              zkpProof: proof.proof,
        signature: proof.signature || proof.proof,
              verifiedAt: proof.timestamp || new Date().toISOString(),
        expiresAt: proof.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              verificationLevel: proof.verificationLevel || 'basic',
              metadata: {
                provider: 'user_attested',
                fraudPreventionScore: undefined
        },
        encryptedUserData: encryptedUserData
      };

      // Save directly to API server (Google Drive) - NO localStorage
      console.log('🔄 [ZKP Save] Saving directly to API server (Google Drive)...');
      await ZKPDataPointsService.saveDataPoint(
        authenticatedUser.id,
        credentials,
        authToken,
        zkpDataPoint,
        authenticatedUser.publicKey
      );

      // Wait for Google Drive to sync
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify by reading back from API
      console.log('🔄 [ZKP Verify] Verifying save...');
      const verified = await ZKPDataPointsService.hasDataPoint(
        authenticatedUser.id,
        credentials,
        authToken,
        dataPointId,
        authenticatedUser.publicKey
      );
              
      if (!verified) {
        throw new Error('Verification failed - data point not found after save');
      }

      // Reload all data points from API
      const allDataPointIds = await ZKPDataPointsService.getAllDataPoints(
        authenticatedUser.id,
        credentials,
        authToken,
        authenticatedUser.publicKey
      );
      
      console.log('✅ [ZKP] Successfully saved and verified. All data points:', allDataPointIds);
      setAttestedDataPoints(new Set(allDataPointIds));
      
      setSuccessWithTimeout(`Successfully attested ${currentDataPoint?.name}!`);
      setTimeout(() => setSuccessWithTimeout(null), 5000);
      setShowDataPointInputModal(false);
      setCurrentDataPoint(null);
      setCurrentDataPointExistingData(null);
    } catch (error) {
      console.error('❌ [DataPointInput] Error:', error);
      setError(`Failed to save data point: ${error instanceof Error ? error.message : String(error)}`);
      setTimeout(() => setError(null), 9000);
    }
  };







  // Device syncing utility functions
  const generateDeviceFingerprint = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = '16px Arial';
      ctx.fillText('Device Fingerprint', 10, 20);
      return canvas.toDataURL().slice(0, 50) + Date.now().toString();
    }
    const randomBytes = crypto.getRandomValues(new Uint8Array(8));
    const randomString = Array.from(randomBytes).map(b => b.toString(36)).join('').substring(0, 8);
    return `device-${Date.now()}-${randomString}`;
  };

  // Generate QR code for transfer URL
  const generateQRCode = async (url: string) => {
    try {
      const qrContainer = document.getElementById('qr-code-container');
      if (qrContainer) {
        // Clear QR container safely
        while (qrContainer.firstChild) {
          qrContainer.removeChild(qrContainer.firstChild);
        }
        const qrDataURL = await QRCode.toDataURL(url, {
          width: 192,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        
        const img = document.createElement('img');
        img.src = qrDataURL;
        img.alt = 'Transfer QR Code';
        img.className = 'w-full h-full';
        qrContainer.appendChild(img);
      }
    } catch (error) {
    }
  };

  // Check for cloud updates and sync them to PWA
  const checkForCloudUpdates = async () => {
    try {
      logDebug('Checking for cloud updates...');
      
      // 🔄 SYNC PENDING METADATA: Sync offline changes to cloud
      const pendingSync = SecureMetadataStorage.getPendingSync();
      if (Object.keys(pendingSync).length > 0) {
        logDebug('Found pending metadata sync items:', Object.keys(pendingSync).length);
        const syncResult = await SecureMetadataStorage.syncPendingToCloud();
        if (syncResult.synced > 0) {
          setSuccessWithTimeout(`Synced ${syncResult.synced} offline changes to cloud`);
          setTimeout(() => setSuccessWithTimeout(null), 3000);
        }
      }
      
      // Get stored identities from PWA localStorage
      const storedIdentities = localStorage.getItem('pwa_stored_identities');
      if (!storedIdentities) {
        logDebug('No PWA identities to check for updates');
        return;
      }
      
      const stored = JSON.parse(storedIdentities);
      
      // Check each stored identity for cloud updates
      for (const identity of stored) {
        if (identity.publicKey) {
          try {
            const cloudUpdates = await cloudSyncManager.getUpdates(identity.publicKey);
            
            // Process each type of update
            for (const update of cloudUpdates) {
              // Check if this update is newer than our local version
              const localLastUpdated = identity.lastAccessed || identity.createdAt;
              const cloudLastUpdated = update.updatedAt;
              
              if (new Date(cloudLastUpdated) > new Date(localLastUpdated)) {
                logDebug('Found cloud update for identity:', identity.publicKey, 'type:', update.type);
                
                switch (update.type) {
                  case 'nickname':
                    if (identity.nickname !== update.data.newNickname) {
                      identity.nickname = update.data.newNickname;
                      if (identity.idFile) {
                        identity.idFile.nickname = update.data.newNickname;
                      }
                      logDebug('Updated local nickname from cloud:', update.data.newNickname);
                    }
                    break;
                    
                  case 'profile-picture':
                    if (identity.profilePicture !== update.data.newProfilePicture) {
                      identity.profilePicture = update.data.newProfilePicture;
                      if (identity.idFile) {
                        identity.idFile.profilePicture = update.data.newProfilePicture;
                      }
                      logDebug('Updated local profile picture from cloud:', update.data.newProfilePicture);
                    }
                    break;
                    
                  case 'custodian':
                    // Note: Custodian updates would need to be handled by the main app state
                    // This is just for logging - actual sync would happen in the main component
                    logDebug('Found custodian update from cloud:', update.data.action, update.data.custodian?.name);
                    break;
                    
                  case 'recovery-key':
                    // Note: Recovery key updates would need to be handled by the main app state
                    logDebug('Found recovery key update from cloud:', update.data.action);
                    break;
                    
                  case 'device':
                    // Note: Device updates would need to be handled by the main app state
                    logDebug('Found device update from cloud:', update.data.action, update.data.device?.name);
                    break;
                    
                  case 'privacy':
                    // Note: Privacy updates would need to be handled by the main app state
                    logDebug('Found privacy settings update from cloud:', update.data.action, update.data.toolId);
                    break;
                }
              }
            }
          } catch (error) {
            logError('Failed to check cloud updates for identity:', identity.publicKey, error);
          }
        }
      }
      
      // Save updated identities back to localStorage
      localStorage.setItem('pwa_stored_identities', JSON.stringify(stored));
              logDebug('Cloud sync check completed');
      
    } catch (error) {
              logError('Failed to check for cloud updates:', error);
    }
  };

  // Helper function to get time ago string
  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInMinutes < 1) return 'just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return `${Math.floor(diffInDays / 7)}w ago`;
  };

  // Get offline sync status
  const getOfflineSyncStatus = () => {
    const pendingSync = SecureMetadataStorage.getPendingSync();
    const pendingCount = Object.keys(pendingSync).filter(key => !pendingSync[key].synced).length;
    return {
      hasPending: pendingCount > 0,
      pendingCount,
      lastSync: pendingCount > 0 ? 
        getTimeAgo(new Date(Object.values(pendingSync)[0]?.timestamp || Date.now())) : 
        'All synced'
    };
  };

  const generateSyncKey = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };





  // Function to sync data from webapp storage to PWA
  const syncFromWebappStorage = async (): Promise<{ identities: any[] } | null> => {
    try {
      // Try to access the webapp's IndexedDB storage
      const webappDB = indexedDB.open('IdentityProtocolDB', 1);
      
      return new Promise((resolve) => { // @ts-ignore
        webappDB.onsuccess = async () => {
          try {
            const db = webappDB.result;
            const transaction = db.transaction(['identities'], 'readonly');
            const store = transaction.objectStore('identities');
            const request = store.getAll();
            
            request.onsuccess = () => {
              const identities = request.result;
              logDebug('Found', identities.length, 'identities in webapp storage');
              resolve({ identities });
            };
            
            request.onerror = () => {
              logDebug('Could not read from webapp storage');
              resolve(null);
            };
          } catch (error) {
            logError('Error accessing webapp storage:', error);
            resolve(null);
          }
        };
        
        webappDB.onerror = () => {
          logDebug('Could not open webapp database');
          resolve(null);
        };
      });
    } catch (error) {
      logError('Error in syncFromWebappStorage:', error);
      return null;
    }
  };

  // Initialize storage and load existing data
  useEffect(() => {
    const initializeApp = async () => {
      try {
        await storage.init();
        logDebug('Storage initialized');
        
        // Load existing identities for debugging
        const identities = await storage.getIdentities();
        logDebug('Available identities:', identities);
        
        // Since all data is encrypted, we can't display identities without decrypting
        // The user will need to enter pnName and passcode to unlock
        logDebug('Found', identities.length, 'encrypted identities - user must unlock with credentials');
        // Don't set dids here - let the other useEffect handle PWA identity loading
        
        // Check if we're in PWA mode
        const isPWA = window.matchMedia('(display-mode: standalone)').matches;
        logDebug('Is PWA:', isPWA);
        
        // If in PWA and no identities found, try to sync from webapp storage
        if (isPWA && identities.length === 0) {
                      logDebug('PWA detected with no identities, attempting to sync from webapp storage');
          try {
            // Try to access the webapp's storage context
            const webappStorage = await syncFromWebappStorage();
            if (webappStorage && webappStorage.identities.length > 0) {
              logDebug('Found identities in webapp storage, syncing to PWA');
              for (const identity of webappStorage.identities) {
                await storage.storeIdentity(identity);
              }
                              logDebug('Synced', webappStorage.identities.length, 'identities to PWA');
            }
          } catch (error) {
                          logError('Could not sync from webapp storage:', error);
          }
        }
        
        // Don't automatically restore sessions - user must unlock their ID each time
                  logDebug('Not restoring session - user must unlock ID manually');
        setAuthenticatedUser(null);
        
        // Recovery keys are now stored encrypted in the ID file
        // They will be loaded when identities are decrypted
        
        // Set up realtime listeners for cross-device sync
        try {
                // const realtimeManager = RealtimeManager.getInstance();
      // await realtimeManager.connect();
          
          // Subscribe to device sync updates for nickname changes (disabled in dev mode)
          // realtimeManager.subscribe('device-sync', (message) => {
          //   if (message.data.action === 'nickname-updated') {
          //     const { identityId, newNickname } = message.data.data;
          //     handleIncomingNicknameUpdate(identityId, newNickname);
          //   }
          // });
          
          logDebug('Realtime listeners set up for cross-device sync');
        } catch (error) {
          logError('Failed to set up realtime listeners:', error);
        }

        // Initialize cloud sync for cross-platform nickname updates
        try {
          await cloudSyncManager.initialize();
          logDebug('Cloud sync initialized for cross-platform updates');
          
          // Check for cloud updates if in PWA mode
          if (isPWA) {
            await checkForCloudUpdates();
          }
        } catch (error) {
          logError('Failed to initialize cloud sync:', error);
          // Don't fail the entire initialization if cloud sync fails
        }


      } catch (error) {
                  logError('Failed to initialize storage:', error);
        setError('Failed to initialize storage');
      } finally {
        // Cleanup completed
      }
    };

    initializeApp();
  }, [storage]);



  // PWA lock management with stable dependencies
  useEffect(() => {
    let lockTimeout: NodeJS.Timeout | null = null;
    const capListenerRef = { current: null as { remove: () => Promise<void> } | null };

    const checkInitialLock = () => {
      if (pwaState.isInstalled && !authenticatedUser) {
        const lastUnlockTime = localStorage.getItem('pwa-last-unlock-time');
        if (lastUnlockTime) {
          const unlockTime = parseInt(lastUnlockTime);
          const now = Date.now();
          const timeSinceUnlock = now - unlockTime;
          
          if (timeSinceUnlock > 5 * 60 * 1000) {
            setIsPWALocked(true);
          }
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && pwaState.isInstalled && authenticatedUser) {
        if (lockTimeout) clearTimeout(lockTimeout);
        lockTimeout = setTimeout(() => setIsPWALocked(true), 5 * 60 * 1000);
      }
    };

    const handleUserActivity = () => {
      if (lockTimeout) clearTimeout(lockTimeout);
      if (document.hidden && pwaState.isInstalled && authenticatedUser) {
        lockTimeout = setTimeout(() => setIsPWALocked(true), 5 * 60 * 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('mousedown', handleUserActivity);
    document.addEventListener('keydown', handleUserActivity);
    document.addEventListener('touchstart', handleUserActivity);

    void (async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const listener = await CapApp.addListener('appStateChange', ({ isActive }) => {
            if (pwaState.isInstalled && authenticatedUser) {
              if (!isActive) {
                if (lockTimeout) clearTimeout(lockTimeout);
                lockTimeout = setTimeout(() => setIsPWALocked(true), 5 * 60 * 1000);
              } else if (lockTimeout) {
                clearTimeout(lockTimeout);
                lockTimeout = null;
              }
            }
          });
          capListenerRef.current = listener;
        }
      } catch {
        // CapApp not available
      }
    })();

    checkInitialLock();

    if (document.hidden && pwaState.isInstalled && authenticatedUser) {
      lockTimeout = setTimeout(() => setIsPWALocked(true), 5 * 60 * 1000);
    }

    return () => {
      if (lockTimeout) clearTimeout(lockTimeout);
      capListenerRef.current?.remove?.();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('mousedown', handleUserActivity);
      document.removeEventListener('keydown', handleUserActivity);
      document.removeEventListener('touchstart', handleUserActivity);
    };
  }, [pwaState.isInstalled]);

  // Handle PWA unlock
  const handlePWAUnlock = () => {
    // Only show success message if this is actually an unlock action
    // (i.e., if the PWA was previously locked)
    const wasLocked = isPWALocked;
    
    setIsPWALocked(false);
    // Store the unlock time
    localStorage.setItem('pwa-last-unlock-time', Date.now().toString());
    
    // Only show success message if this was actually an unlock action
    if (wasLocked) {
      // Show appropriate message based on context with proper timeout management
      if (authenticatedUser) {
        // This is an ID unlock, not a PWA unlock
        showSuccessMessage('Identity unlocked successfully');
      } else {
        // This is a PWA unlock
        showSuccessMessage('PWA unlocked successfully');
      }
    }
  };

  // Handle PWA fallback to passcode (mobile only)
  const handlePWAFallback = () => {
    setIsPWALocked(false);
  };

  // Handle PWA unlock for desktop (no popup)
  /*
  const handlePWADesktopUnlock = () => {
    setIsPWALocked(false);
    // Store the unlock time
    localStorage.setItem('pwa-last-unlock-time', Date.now().toString());
    // Don't show any popup or success message - just unlock silently
  };
  */


    

  const handleDownloadRecoveredPn = () => {
    if (!recoveredIdentityExport) return;
    if (!canExportIdentity) {
      setError(deviceAuth.deviceRequiredMessage);
      setTimeout(() => setError(null), 9000);
      return;
    }
    const blob = new Blob([JSON.stringify(recoveredIdentityExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recovered-identity.pn';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle recovery completion with automatic license transfer
  const handleRecoveryComplete = async (recovered: { nickname: string }) => {
    try {
      setLoading(true);
      setError(null);

      if (!authenticatedUser?.id) {
        setAuthenticatedUser({
          id: recoveredDID?.id || `recovered-${Date.now()}`,
          nickname: recovered.nickname,
          accessToken: `recovered-token-${Date.now()}`,
          expiresIn: 3600,
          authenticatedAt: new Date().toISOString(),
          publicKey: recoveredDID?.id || ''
        });
      }

      // Create a new primary device for the recovered identity
      const recoveredPrimaryDevice: SyncedDevice = {
        id: `recovered-primary-${Date.now()}`,
        name: `${navigator.platform} - ${navigator.userAgent.split(' ').pop()?.split('/')[0] || 'Unknown'}`,
        type: 'desktop', // Default to desktop, could be enhanced with better detection
        lastSync: new Date().toISOString(),
        status: 'active',
        location: 'Recovered Location',
        ipAddress: 'Recovered IP',
        isPrimary: true, // This becomes the new primary device
        deviceFingerprint: generateDeviceFingerprint(),
        syncKey: generateSyncKey(),
        pairedAt: new Date().toISOString()
      };
      
      setCurrentDevice(recoveredPrimaryDevice);
      
      // Update recovery request status
      setRecoveryRequests(prev => prev.map(req => 
        req.requestingDid === (recoveredDID?.id || authenticatedUser?.publicKey)
          ? { ...req, status: 'approved' as const }
          : req
      ));

      // AUTOMATIC LICENSE TRANSFER - Transfer all licenses from old identity to new identity
      try {
        if (!recoveredDID) {
          throw new Error('Recovered identity details are unavailable');
        }
        // Find the old identity hash (from the recovery request)
        const recoveryRequest = recoveryRequests.find(req => req.requestingDid === recoveredDID.id);
        if (recoveryRequest) {
          // Get the old identity hash (in real implementation, this would be extracted from recovery data)
          const oldIdentityHash = recoveryRequest.oldIdentityHash || `old-${recoveredDID.id}`;
          const newIdentityHash = recoveredDID.id;

          // Transfer all licenses automatically
          const transferredLicenses = await LicenseVerification.transferLicense(oldIdentityHash, newIdentityHash);
          
          if (transferredLicenses) {
            // Update license info in the UI
            setLicenseKey(transferredLicenses.licenseKey);
            setLicenseInfo(transferredLicenses);

            // Generate new ZK proof for the transferred license
            const newLicenseProof = await LicenseVerification.generateLicenseProof(transferredLicenses, {});
            setLicenseProof(newLicenseProof);

            // Store license transfer in cloud database for cross-platform sync
            try {
              await cloudSyncManager.initialize();
              await cloudSyncManager.storeUpdate({
                type: 'license-transfer',
                identityId: recoveredDID.id,
                publicKey: authenticatedUser?.publicKey || '',
                data: {
                  action: 'transfer',
                  oldIdentityHash,
                  newIdentityHash,
                  transferredLicense: transferredLicenses
                },
                updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
              });
              logDebug('License transfer stored in cloud database for cross-platform sync');
            } catch (error) {
              logError('Failed to store license transfer in cloud:', error);
              // Don't fail the entire operation if cloud sync fails
            }

            setSuccessWithTimeout('Identity recovered successfully with automatic license transfer! This device is now your primary device.');
          } else {
            setSuccessWithTimeout('Identity recovered successfully! This device is now your primary device.');
          }
        } else {
          setSuccessWithTimeout('Identity recovered successfully! This device is now your primary device.');
        }
      } catch (licenseError: any) {
        // Log license transfer error but don't fail the recovery
        logError('License transfer failed during recovery:', licenseError);
        setSuccessWithTimeout('Identity recovered successfully! License transfer will be completed separately.');
      }

      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to complete recovery');
    } finally {
      setLoading(false);
    }
  };

  // Handle opening custodian approval modal
  const handleOpenCustodianApprovalModal = (custodianship: {
    id: string;
    identityId: string;
    identityName: string;
    identityUsername: string;
    identityPublicKey?: string;
    status: 'active' | 'pending';
    canApprove: boolean;
  }) => {
    const pk = custodianship.identityPublicKey || custodianship.identityId;
    const pendingRequest = recoveryRequests.find(
      (r) => (r.requestingDid === pk || r.requestingDid === custodianship.identityId) && r.status === 'pending'
    );
    if (pendingRequest && custodianship.canApprove) {
      setSelectedRecoveryRequest(pendingRequest);
      setSelectedCustodianship(custodianship);
      setShowCustodianApprovalModal(true);
    }
  };

  // Handle custodian invitation acceptance
  const handleCustodianInvitationAcceptance = async (invitationData: {
    invitationId: string;
    custodianName: string;
    custodianType: 'self-recovery' | 'person' | 'service';
    contactType: 'email' | 'phone';
    contactValue: string;
    identityName: string;
    identityUsername: string;
  }) => {
    try {
      // Check if user is authenticated
      if (!authenticatedUser) {
        setError('You must unlock your identity first to accept custodianship');
        setTimeout(() => setError(null), 9000);
        return;
      }

      // Create new custodianship
      const newCustodianship = {
        id: `custodianship-${Date.now()}`,
        identityId: invitationData.invitationId.split('-')[0], // Extract identity ID from invitation
        identityName: invitationData.identityName,
        identityUsername: invitationData.identityUsername,
        status: 'active' as const,
        canApprove: true
      };

      // Add to custodianships
      setCustodianships(prev => [...prev, newCustodianship]);

      // Update custodian status on the identity owner's side (in real app, this would be a server call)
      // For now, we'll simulate this by updating the local state
      setSuccessWithTimeout(`Custodianship accepted! You are now a custodian for ${invitationData.identityName}`);
      setTimeout(() => setSuccessWithTimeout(null), 5000);

      // Close the invitation modal
      setShowCustodianInvitationModal(false);
      setPendingCustodianInvitation(null);

    } catch (error: any) {
      setError(error.message || 'Failed to accept custodianship');
      setTimeout(() => setError(null), 9000);
    }
  };

  // Handle custodian invitation QR code acceptance
  // @ts-ignore
  // Custodian invitation QR code handler (currently unused but available for future use)
  const handleCustodianInvitationQRCode = async (qrData: string) => {
    try {
      // Parse and validate QR code data
      const parsedData = await QRCodeManager.parseQRCode(qrData);
      
      if (parsedData.type !== 'custodian-invitation') {
        throw new Error('Invalid QR code type - expected custodian invitation');
      }
      
      const invitationData = parsedData.data;
      
      // Validate the invitation hasn't expired
      if (invitationData.expiresAt && Date.now() > invitationData.expiresAt) {
        throw new Error('Custodian invitation has expired');
      }
      
      // Create new custodianship
      const newCustodianship = {
        id: `custodianship-${Date.now()}`,
        identityId: invitationData.invitationId,
        identityName: invitationData.custodianName,
        identityUsername: invitationData.custodianName.split(' ')[0].toLowerCase(),
        status: 'active' as const,
        canApprove: true
      };
      
      // Add to custodianships list
      setCustodianships(prev => [...prev, newCustodianship]);
      
      // Update any existing pending custodians to active
      setCustodians(prev => prev.map(custodian => 
        custodian.contactValue === invitationData.contactValue &&
        custodian.contactType === invitationData.contactType
          ? { 
              ...custodian, 
              status: 'active' as const,
              canApprove: true,
              lastVerified: new Date().toISOString()
            }
          : custodian
      ));
      
      setSuccessWithTimeout('Custodianship accepted successfully! You can now approve recovery requests for this identity.');
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to accept custodian invitation');
      setTimeout(() => setError(null), 9000);
    }
  };

  // Note: Success notifications are now managed by showSuccessMessage() function
  // which properly handles timeout management with successTimeoutRef



  // Helper function to format version detection messages
  const formatUpdateMessage = (updateType: string, data: any): string => {
    switch (updateType) {
      case 'nickname':
        return `Nickname updated to: ${data.newNickname}`;
      case 'profile-picture':
        return 'Profile picture updated';
      case 'custodian':
        return data.action === 'add' 
          ? `Custodian added: ${data.custodian.name}`
          : 'Custodian removed';
      case 'recovery-key':
        return 'Recovery key generated';
      case 'device':
        return 'Device removed';
      case 'privacy':
        return 'Privacy settings updated';
      default:
        return `${updateType} updated`;
    }
  };

  // @ts-ignore
  // Simple unlock handler (currently unused but available for future use)
  const handleSimpleUnlock = async (file: File, passcode: string) => {
    try {
      logDebug('Starting unlock process...');
      setLoading(true);
      setError(null);

      // Initialize storage if not already done
              logDebug('Initializing storage...');
      await storage.init();

      // Read the file content
              logDebug('Reading file content...');
      const fileContent = await file.text();
              logDebug('File content:', fileContent.substring(0, 200) + '...');
      
      // Try to parse as JSON first
      let identityData;
      try {
        identityData = JSON.parse(fileContent);
        logDebug('Parsed identity data:', identityData);
      } catch (parseError) {
        logError('JSON parse error:', parseError);
        // If not JSON, try to parse as plain text or other format
        throw new Error('Unsupported file format. Please use a valid pN file (.pn, .id, .json, or .identity).');
      }

      // Handle different possible formats
      let identityToUnlock;
      
      if (identityData.identities && Array.isArray(identityData.identities)) {
        // Backup format with multiple identities
        if (identityData.identities.length === 1) {
          identityToUnlock = identityData.identities[0];
        } else {
          throw new Error('Multiple identities found. Please specify which one to unlock.');
        }
      } else if (identityData.id || identityData.pnName) {
        // Single identity format
        identityToUnlock = identityData;
      } else {
        throw new Error('Invalid pN file format');
      }

      // 🔄 VERSION DETECTION: Check for cloud updates and apply them
      let updatedIdentityData = { ...identityToUnlock };
      let hasCloudUpdates = false;
      let updateMessages: string[] = [];
      
      try {
        await cloudSyncManager.initialize();
        const cloudUpdates = await cloudSyncManager.getUpdates(identityToUnlock.publicKey || identityToUnlock.id);
        
        if (cloudUpdates.length > 0) {
          // Get the file's last modified timestamp
          const fileLastModified = file.lastModified;
          const fileDate = new Date(fileLastModified);
          
          logDebug('File timestamp:', fileDate.toISOString());
          logDebug('Checking', cloudUpdates.length, 'cloud updates...');
          
          // Check if any cloud updates are newer than the file
          for (const update of cloudUpdates) {
            const updateDate = new Date(update.updatedAt);
            
            if (updateDate > fileDate) {
              logDebug('Found newer cloud data for identity:', identityToUnlock.id);
                              logDebug('Update type:', update.type, 'at:', update.updatedAt);
              hasCloudUpdates = true;
              
              // Apply cloud updates to the identity data
              switch (update.type) {
                case 'nickname':
                  if (update.data.newNickname) {
                    updatedIdentityData.nickname = update.data.newNickname;
                    updatedIdentityData.displayName = update.data.newNickname;
                    updateMessages.push(formatUpdateMessage('nickname', update.data));
                  }
                  break;
                  
                case 'profile-picture':
                  if (update.data.newProfilePicture) {
                    updatedIdentityData.profilePicture = update.data.newProfilePicture;
                    updateMessages.push(formatUpdateMessage('profile-picture', update.data));
                  }
                  break;
                  
                case 'custodian':
                  if (update.data.action === 'add' && update.data.custodian) {
                    if (!updatedIdentityData.custodians) updatedIdentityData.custodians = [];
                    updatedIdentityData.custodians.push(update.data.custodian);
                    updateMessages.push(formatUpdateMessage('custodian', update.data));
                  } else if (update.data.action === 'remove' && update.data.custodianId) {
                    if (updatedIdentityData.custodians) {
                      updatedIdentityData.custodians = updatedIdentityData.custodians.filter(
                        (c: any) => c.id !== update.data.custodianId
                      );
                      updateMessages.push(formatUpdateMessage('custodian', update.data));
                    }
                  }
                  break;
                  
                case 'recovery-key':
                  if (update.data.action === 'generate' && update.data.recoveryKey) {
                    if (!updatedIdentityData.recoveryKeys) updatedIdentityData.recoveryKeys = [];
                    updatedIdentityData.recoveryKeys.push(update.data.recoveryKey);
                    updateMessages.push(formatUpdateMessage('recovery-key', update.data));
                  }
                  break;
                  
                case 'device':
                  if (update.data.action === 'remove' && update.data.deviceId) {
                    if (updatedIdentityData.syncedDevices) {
                      updatedIdentityData.syncedDevices = updatedIdentityData.syncedDevices.filter(
                        (d: any) => d.id !== update.data.deviceId
                      );
                      updateMessages.push(formatUpdateMessage('device', update.data));
                    }
                  }
                  break;
                  
                case 'privacy':
                  if (update.data.action === 'update' && update.data.newSettings) {
                    updatedIdentityData.privacySettings = update.data.newSettings;
                    updateMessages.push(formatUpdateMessage('privacy', update.data));
                  }
                  break;
              }
            }
          }
        }
      } catch (error) {
        logError('Failed to check cloud updates during unlock:', error);
        // Continue with unlock even if cloud check fails
      }

      // Use the updated identity data for authentication
      const finalIdentityToUnlock = hasCloudUpdates ? updatedIdentityData : identityToUnlock;

      // 🔐 SECURE METADATA: Apply encrypted metadata to identity
      let identityWithMetadata = finalIdentityToUnlock;
      try {
        identityWithMetadata = await SecureMetadataStorage.applyMetadataToIdentity(
          finalIdentityToUnlock,
          finalIdentityToUnlock.pnName,
          passcode
        );
        logDebug('Applied secure metadata to identity');
        
        // 🔄 IPFS SYNC: Check for newer metadata from other devices
        try {
          const identityId = finalIdentityToUnlock.publicKey || finalIdentityToUnlock.id;
          const synced = await SecureMetadataStorage.syncFromOtherDevices(identityId);
          if (synced) {
            logDebug('Synced newer metadata from IPFS');
            // Re-apply metadata with the synced version
            identityWithMetadata = await SecureMetadataStorage.applyMetadataToIdentity(
              finalIdentityToUnlock,
              finalIdentityToUnlock.pnName,
              passcode
            );
          }
        } catch (syncError) {
          logDebug('IPFS sync failed (non-critical):', syncError);
        }
      } catch (error) {
        logError('Failed to apply secure metadata:', error);
        // Continue with original identity if metadata fails
        identityWithMetadata = finalIdentityToUnlock;
      }

      // Check if this is an encrypted identity (has encryptedData, iv, salt)
      if (identityWithMetadata.encryptedData && identityWithMetadata.iv && identityWithMetadata.salt) {
        // This is an encrypted identity, try to authenticate it
        try {
          const deviceBoundEnvelope = isDeviceBoundPnEnvelope(identityData) ? identityData : null;
          if (deviceBoundEnvelope) {
            if (!(await checkDeviceBoundPnUnlockAvailable(deviceBoundEnvelope, recoveryVaultPnId))) {
              throw new Error(DEVICE_BOUND_PN_ERROR);
            }
          }

          const authSession = deviceBoundEnvelope
            ? (
                await authenticateDeviceBoundPn({
                  envelope: deviceBoundEnvelope,
                  pnName: identityWithMetadata.pnName || mainForm.pnName,
                  passcode,
                  pnIdentifier: recoveryVaultPnId,
                })
              ).authSession
            : await IdentityCrypto.authenticateIdentity(
                identityWithMetadata as any,
                passcode,
                identityWithMetadata.pnName || 'unknown'
              );

          // Store the session
          await storage.storeSession(authSession);

          // Create DID info for UI
          const didInfo: DIDInfo = {
            id: identityWithMetadata.id,
            pnName: identityWithMetadata.pnName,
            nickname: identityWithMetadata.nickname || identityWithMetadata.pnName,
            email: identityWithMetadata.email || '',
            phone: identityWithMetadata.phone || '',
            recoveryEmail: identityWithMetadata.recoveryEmail || '',
            recoveryPhone: identityWithMetadata.recoveryPhone || '',
            createdAt: identityWithMetadata.createdAt || new Date().toISOString(),
            status: identityWithMetadata.status || 'active',
            custodiansRequired: identityWithMetadata.custodiansRequired || false,
            custodiansSetup: identityWithMetadata.custodiansSetup || false
          };

          setDids(prev => [...prev, didInfo]);
          setSelectedDID(didInfo);
          
          // Set authenticated user
          setAuthenticatedUser(authSession);
          
          const successMessage = hasCloudUpdates 
            ? `pN file unlocked and updated with latest data! ${updateMessages.join(', ')}`
            : 'pN file unlocked successfully!';
          showSuccessMessage(successMessage, 5000);
        } catch (authError: any) {
          throw new Error(`Authentication failed: ${authError.message}`);
        }
      } else {
        // Create authenticated session for the identity
        const session = {
          id: finalIdentityToUnlock.id,
          pnName: finalIdentityToUnlock.pnName,
          nickname: finalIdentityToUnlock.nickname || finalIdentityToUnlock.pnName,
          accessToken: await generateSecureToken(finalIdentityToUnlock),
          expiresIn: 3600,
          authenticatedAt: new Date().toISOString(),
          publicKey: finalIdentityToUnlock.publicKey || ''
        };

        // Store the session
        await storage.storeSession(session);

        // Create DID info for UI
        const didInfo: DIDInfo = {
          id: finalIdentityToUnlock.id,
          pnName: finalIdentityToUnlock.pnName,
          nickname: finalIdentityToUnlock.nickname || finalIdentityToUnlock.pnName,
          email: finalIdentityToUnlock.email || '',
          phone: finalIdentityToUnlock.phone || '',
          recoveryEmail: finalIdentityToUnlock.recoveryEmail || '',
          recoveryPhone: finalIdentityToUnlock.recoveryPhone || '',
          createdAt: finalIdentityToUnlock.createdAt || new Date().toISOString(),
          status: finalIdentityToUnlock.status || 'active',
          custodiansRequired: finalIdentityToUnlock.custodiansRequired || false,
          custodiansSetup: finalIdentityToUnlock.custodiansSetup || false
        };

        setDids(prev => [...prev, didInfo]);
        setSelectedDID(didInfo);
        
        // Set authenticated user
        setAuthenticatedUser(session);
        
        const successMessage = hasCloudUpdates 
          ? `pN file unlocked and updated with latest data! ${updateMessages.join(', ')} (Demo mode)`
                      : 'pN file unlocked successfully! (Demo mode)';
        showSuccessMessage(successMessage, 5000);
      }
    } catch (error: any) {
        logError('Unlock error:', error);
              setError(error.message || 'Failed to unlock pN file');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 9000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  /*
  // Input validation and sanitization using comprehensive framework
  const sanitizeInput = (input: string): string => {
    const validation = InputValidator.validateDisplayName(input);
    return validation.sanitizedValue || input.trim();
  };

  const validateDisplayName = (name: string): boolean => {
    const validation = InputValidator.validateDisplayName(name);
    return validation.isValid;
  };
  */

  /*
  const handleCreateIdentity = async () => {
    try {
      if (!newIdentityName.trim()) {
        setError('Identity name is required');
        return;
      }

      const sanitizedName = sanitizeInput(newIdentityName.trim());
      
      if (!validateDisplayName(sanitizedName)) {
        setError('Invalid identity name format');
        return;
      }

      if (sanitizedName.length > 50) {
        setError('Identity name must be 50 characters or less');
        return;
      }

      // Check for duplicate names
      const existingNames = identities.map(id => id.displayName?.toLowerCase() || '');
      if (existingNames.includes(sanitizedName.toLowerCase())) {
        setError('An identity with this name already exists');
        return;
      }

      setLoading(true);
      setError('');

      const newIdentity = await identityManager.createIdentity(sanitizedName);
      
      if (newIdentity) {
        setIdentities(prev => [...prev, {
          id: newIdentity.id || `id-${Date.now()}`,
          pnName: newIdentity.pnName || 'unknown',
          nickname: newIdentity.nickname || 'Unknown User',
          email: '',
          phone: '',
          recoveryEmail: '',
          recoveryPhone: '',
          createdAt: newIdentity.createdAt || new Date().toISOString(),
          status: 'active',
          custodiansRequired: false,
          custodiansSetup: false,
          profilePicture: newIdentity.profilePicture
        }]);
        setNewIdentityName('');
        setShowCreateForm(false);
        setSuccessWithTimeout(`Identity "${sanitizedName}" created successfully!`);
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccessWithTimeout(null), 3000);
      }
    } catch (error) {
      setError('Failed to create identity. Please try again.');
      logError('Create identity error:', error);
    } finally {
      // setIsLoading(false);
    }
  };

  /*
  const handleUpdateIdentity = async (id: string, newName: string) => {
    try {
      if (!newName.trim()) {
        setError('Identity name is required');
        return;
      }

      const sanitizedName = sanitizeInput(newName.trim());
      
      if (!validateDisplayName(sanitizedName)) {
        setError('Invalid identity name format');
        return;
      }

      if (sanitizedName.length > 50) {
        setError('Identity name must be 50 characters or less');
        return;
      }

      // Check for duplicate names (excluding current identity)
      const existingNames = identities
        .filter(identity => identity.id !== id)
        .map(identity => identity.displayName?.toLowerCase() || '');
      
      if (existingNames.includes(sanitizedName.toLowerCase())) {
        setError('An identity with this name already exists');
        return;
      }

      // setIsLoading(true);
      setError('');

      const updatedIdentity = await identityManager.updateIdentity(id, sanitizedName);
      
      if (updatedIdentity) {
        setIdentities(prev => 
          prev.map(identity => 
            identity.id === id ? { ...identity, displayName: sanitizedName } : identity
          )
        );
        // setEditingId(null);
        // setSuccessMessage(`Identity renamed to "${sanitizedName}" successfully!`);
        
        // Clear success message after 3 seconds
        // setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (error) {
      setError('Failed to update identity. Please try again.');
      logError('Edit identity error:', error);
    } finally {
      // setIsLoading(false);
    }
  };
  */

  useEffect(() => {
    logDebug('PWA State:', pwaState);
  }, [pwaState]);

  return (
    <div className="min-h-screen text-text-primary flex flex-col">
      {/* Extension Warning Banner */}
      <ExtensionWarningBanner />

      {networkIdentityRetired && (
        <div
          className="w-full z-30 px-4 py-2 text-sm text-center bg-red-950/95 text-red-100 border-b border-red-800 shrink-0"
          role="alert"
        >
          This pN identifier is retired on the par Noir network. Use your current pN file for cloud storage, ZKPs, and
          connected services. Decrypting an old backup may still work offline, but it no longer receives network-backed
          state.
        </div>
      )}
      
      <Header
        authenticatedUser={authenticatedUser}
        onLogout={handleLogout}
        onOfflineModeChange={handleOfflineModeChange}
        isOnline={pwaState.isOnline}
        pwaState={pwaState}
        onPWAInstall={pwaHandlers?.install}
        onPWACheckUpdate={pwaHandlers?.checkForUpdates}
        onExport={handleExportData}

      />




      
      {/* Success Display */}
      {success && (
        <div
          className="fixed left-1/2 transform -translate-x-1/2 z-50 mb-4 p-3 bg-green-100 border border-green-200 rounded-lg shadow-lg"
          style={{ top: 'calc(5rem + env(safe-area-inset-top, 0px))' }}
        >
          <p className="text-green-700 text-sm">{success}</p>
          <button 
            onClick={() => {
              setSuccessWithTimeout(null);
              if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
                successTimeoutRef.current = null;
              }
            }}
            className="modal-close-button"
          >
            ×
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && authenticatedUser && (
        <div
          className="fixed left-1/2 transform -translate-x-1/2 z-50 mb-4 p-3 bg-red-100 border border-red-200 rounded-lg shadow-lg"
          style={{ top: 'calc(5rem + env(safe-area-inset-top, 0px))' }}
        >
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Offline Sync Status */}
      {authenticatedUser && pwaState.isInstalled && (
        (() => {
          const syncStatus = getOfflineSyncStatus();
          if (syncStatus.hasPending) {
            return (
              <div
                className="fixed right-4 z-50 mb-4 p-3 bg-yellow-100 border border-yellow-200 rounded-lg shadow-lg"
                style={{ top: 'calc(4rem + env(safe-area-inset-top, 0px))' }}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-yellow-700 text-sm">
                    <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  {syncStatus.pendingCount} offline change{syncStatus.pendingCount > 1 ? 's' : ''} pending sync
                </div>
                  </span>
                  <button
                    onClick={async () => {
                      const result = await SecureMetadataStorage.syncPendingToCloud();
                      if (result.synced > 0) {
                        setSuccessWithTimeout(`Synced ${result.synced} changes to cloud`);
                        setTimeout(() => setSuccessWithTimeout(null), 3000);
                      }
                    }}
                    className="px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700"
                  >
                    Sync Now
                  </button>
                </div>
              </div>
            );
          }
          return null;
        })()
      )}
      
      <main className="flex-1">
        <UnlockGate
          authenticatedUser={authenticatedUser}
          showTransferReceiver={showTransferReceiver}
          pwaState={pwaState}
          handleMainFormSubmit={handleMainFormSubmit}
          selectedStoredIdentity={selectedStoredIdentity}
          handleIdentitySelect={handleIdentitySelect}
          handleDeleteIdentity={handleDeleteIdentity}
          setShowCreateForm={setShowCreateForm}
          mainForm={mainForm}
          setMainForm={setMainForm}
          setSelectedStoredIdentity={setSelectedStoredIdentity}
          setShowUnlockFromUsbModal={setShowUnlockFromUsbModal}
          hasNfcSupport={hasNfcSupport}
          setShowUnlockFromNfcModal={setShowUnlockFromNfcModal}
          showMainPNName={showMainPNName}
          setShowMainPNName={setShowMainPNName}
          showMainPasscode={showMainPasscode}
          setShowMainPasscode={setShowMainPasscode}
          loading={loading}
          setShowRecoveryModal={setShowRecoveryModal}
        />






        {/* Create DID Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Create New pN</h2>
                  <button 
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateStep(1);
                    setCreateForm({
                      pnName: '',
                      confirmPNName: '',
                      passcode: '',
                      confirmPasscode: '',
                      nickname: '',
                      email: '',
                      phone: '',
                      recoveryEmail: '',
                      confirmRecoveryEmail: '',
                      recoveryPhone: '',
                      confirmRecoveryPhone: '',
                      recoveryContactType: 'email'
                    });
                    // Reset show/hide states
                    setShowPNName(false);
                    setShowPasscode(false);
                    setShowConfirmPNName(false);
                    setShowConfirmPasscode(false);
                  }}
                  className="modal-close-button"
                >
                  ×
                  </button>
                </div>
                
                {/* Step Indicator */}
                <div className="flex items-center justify-center mb-6">
                  <div className="flex items-center space-x-2">
                    {/* Step 1 Circle */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 ${
                      createStep === 1 
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : createStep >= 2
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-transparent text-gray-400 border-gray-400'
                    }`}>
                      1
                    </div>
                    
                    {/* Connecting Line */}
                    <div className={`w-12 h-1 ${
                      createStep >= 2 ? 'bg-blue-600' : 'bg-gray-400'
                    }`}></div>
                    
                    {/* Step 2 Circle */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 ${
                      createStep === 2 
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : 'bg-transparent text-gray-400 border-gray-400'
                    }`}>
                      2
                    </div>
                  </div>
                </div>
                
                {/* Error Message Display */}
                {error && (
                  <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                    <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                  </div>
                )}
                
              {createStep === 1 ? (
                <form key="step1" onSubmit={(e) => { e.preventDefault(); setCreateStep(2); }} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-text-primary border-b border-border pb-2">Step 1: Enter Your Information</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        pN Name
                      </label>
                      <div className="relative">
                        <input
                          type={showPNName ? "text" : "password"}
                          value={createForm.pnName}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, pnName: e.target.value }))}
                          className="w-full px-3 py-2 pr-10 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Enter pN Name"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPNName(!showPNName)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                        >
                          {showPNName ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-text-secondary">
                        <p className="font-medium mb-1">Requirements:</p>
                        <ul className="space-y-1">
                          <li className={createForm.pnName.length >= 3 ? "text-green-500" : "text-red-500"}>
                            • 3-20 characters long
                          </li>
                          <li className={/^[a-zA-Z0-9-]+$/.test(createForm.pnName) ? "text-green-500" : "text-red-500"}>
                            • Letters, numbers, and hyphens only
                          </li>
                          <li className={createForm.pnName.length > 0 && !['admin', 'root', 'system', 'test'].includes(createForm.pnName.toLowerCase()) ? "text-green-500" : "text-red-500"}>
                            • Not a reserved name
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Passcode
                      </label>
                      <div className="relative">
                        <input
                          type={showPasscode ? "text" : "password"}
                          value={createForm.passcode}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, passcode: e.target.value }))}
                          className="w-full px-3 py-2 pr-10 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Enter passcode"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasscode(!showPasscode)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                        >
                          {showPasscode ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-text-secondary">
                        <p className="font-medium mb-1">Requirements:</p>
                        <ul className="space-y-1">
                          <li className={createForm.passcode.length >= 12 ? "text-green-500" : "text-red-500"}>
                            • At least 12 characters
                          </li>
                          <li className={/[A-Z]/.test(createForm.passcode) ? "text-green-500" : "text-red-500"}>
                            • One uppercase letter
                          </li>
                          <li className={/[a-z]/.test(createForm.passcode) ? "text-green-500" : "text-red-500"}>
                            • One lowercase letter
                          </li>
                          <li className={/[0-9]/.test(createForm.passcode) ? "text-green-500" : "text-red-500"}>
                            • One number
                          </li>
                          <li className={/[^A-Za-z0-9]/.test(createForm.passcode) ? "text-green-500" : "text-red-500"}>
                            • One special character
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Recovery Contact Type
                      </label>
                      <div className="flex space-x-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="recoveryContactType"
                            value="email"
                            checked={createForm.recoveryContactType === 'email'}
                            onChange={(e) => setCreateForm(prev => ({ ...prev, recoveryContactType: e.target.value as 'email' | 'phone' }))}
                            className="mr-2"
                          />
                          <span className="text-sm text-text-primary">Email</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="recoveryContactType"
                            value="phone"
                            checked={createForm.recoveryContactType === 'phone'}
                            onChange={(e) => setCreateForm(prev => ({ ...prev, recoveryContactType: e.target.value as 'email' | 'phone' }))}
                            className="mr-2"
                          />
                          <span className="text-sm text-text-primary">Phone</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Recovery Contact
                      </label>
                      {createForm.recoveryContactType === 'email' ? (
                        <input
                          type="email"
                          value={createForm.recoveryEmail}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, recoveryEmail: e.target.value }))}
                          className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Enter recovery email"
                          required
                        />
                      ) : (
                        <input
                          type="tel"
                          value={createForm.recoveryPhone}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, recoveryPhone: e.target.value }))}
                          className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Enter recovery phone"
                          required
                        />
                      )}
                      <p className="text-xs text-text-secondary mt-1">
                        This will only be used for recovery if you lose access
                      </p>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 modal-button rounded-md"
                      disabled={!createForm.pnName || !createForm.passcode || 
                        (createForm.recoveryContactType === 'email' ? !createForm.recoveryEmail : !createForm.recoveryPhone)}
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="flex-1 px-4 py-2 modal-button rounded-md"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <form key="step2" onSubmit={handleCreateDID} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-text-primary border-b border-border pb-2">Step 2: Confirm Your Information</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Confirm pN Name
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPNName ? "text" : "password"}
                          value={createForm.confirmPNName}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, confirmPNName: e.target.value }))}
                          className="w-full px-3 py-2 pr-10 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Confirm your pN Name"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPNName(!showConfirmPNName)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                        >
                          {showConfirmPNName ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-text-secondary">
                        <p className={createForm.confirmPNName === createForm.pnName ? "text-green-500" : "text-red-500"}>
                          {createForm.confirmPNName === createForm.pnName ? "✓ Names match" : "✗ Names do not match"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Confirm Passcode
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPasscode ? "text" : "password"}
                          value={createForm.confirmPasscode}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, confirmPasscode: e.target.value }))}
                          className="w-full px-3 py-2 pr-10 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Confirm your passcode"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPasscode(!showConfirmPasscode)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                        >
                          {showConfirmPasscode ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-text-secondary">
                        <p className={createForm.confirmPasscode === createForm.passcode ? "text-green-500" : "text-red-500"}>
                          {createForm.confirmPasscode === createForm.passcode ? "✓ Passcodes match" : "✗ Passcodes do not match"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Confirm Recovery Contact
                      </label>
                      {createForm.recoveryContactType === 'email' ? (
                        <input
                          type="email"
                          value={createForm.confirmRecoveryEmail}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, confirmRecoveryEmail: e.target.value }))}
                          className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Confirm your recovery email"
                          required
                        />
                      ) : (
                        <input
                          type="tel"
                          value={createForm.confirmRecoveryPhone}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, confirmRecoveryPhone: e.target.value }))}
                          className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Confirm your recovery phone"
                          required
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setCreateStep(1)}
                      className="flex-1 px-4 py-2 modal-button rounded-md"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 modal-button rounded-md"
                      disabled={!createForm.confirmPNName || !createForm.confirmPasscode || 
                        (createForm.recoveryContactType === 'email' ? !createForm.confirmRecoveryEmail : !createForm.confirmRecoveryPhone)}
                    >
                      Create pN
                    </button>
                  </div>
                </form>
              )}
                  </div>
                </div>
        )}

        {/* Import DID Modal */}
        {showImportForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Unlock pN</h2>
                  <button 
                  onClick={() => setShowImportForm(false)}
                  className="modal-close-button"
                >
                  ×
                  </button>
                </div>
              <form onSubmit={handleImportDID} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Identity File
                  </label>
                  <input
                    type="file"
                    accept=".pn,.id,.json,.identity"
                    onChange={(e) => setImportForm(prev => ({ ...prev, backupFile: e.target.files?.[0] || null }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg text-text-primary rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    Upload your identity file (.pn, .id, .json, or .identity) to unlock your identity
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    pN Name
                  </label>
                  <input
                    type="text"
                    value={importForm.pnName}
                    onChange={(e) => setImportForm(prev => ({ ...prev, pnName: e.target.value }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg text-text-primary rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter your pN Name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Passcode
                  </label>
                  <input
                    type="password"
                    value={importForm.passcode}
                    onChange={(e) => setImportForm(prev => ({ ...prev, passcode: e.target.value }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg text-text-primary rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter passcode"
                    required
                  />
                </div>
                <div className="flex space-x-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    {loading ? 'Unlocking...' : 'Unlock pN'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImportForm(false)}
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    Cancel
                  </button>
                </div>
              </form>
                      </div>
                    </div>
                  )}




        <AuthenticatedShell
          authenticatedUser={authenticatedUser}
          selectedDID={selectedDID}
          showNicknameEditor={showNicknameEditor}
          editingNickname={editingNickname}
          loading={loading}
          canExportIdentity={canExportIdentity}
          activeTab={activeTab}
          canProfileRead={canProfileRead}
          deviceAuth={deviceAuth}
          apiToken={apiToken}
          verifiedDataPoints={verifiedDataPoints}
          attestedDataPoints={attestedDataPoints}
          globalSettingsExpanded={globalSettingsExpanded}
          thirdPartyExpanded={thirdPartyExpanded}
          privacySettings={privacySettings}
          recoveryVaultPnId={recoveryVaultPnId}
          canRotateIdentity={canRotateIdentity}
          canCustodiansRead={canCustodiansRead}
          recoveryVaultSummary={recoveryVaultSummary}
          vaultRecoveryReady={vaultRecoveryReady}
          recoveryThreshold={recoveryThreshold}
          recoveryMutationAllowed={recoveryMutationAllowed}
          canManageCustodians={canManageCustodians}
          custodians={custodians}
          recoveryKeys={recoveryKeys}
          custodianships={custodianships}
          recoveryRequests={recoveryRequests}
          showRecoveryInfo={showRecoveryInfo}
          canDriveRead={canDriveRead}
          canDriveUpload={canDriveUpload}
          canProfileWrite={canProfileWrite}
          connectError={connectError}
          subPnAvailableScopes={subPnAvailableScopes}
          delegationsLoading={delegationsLoading}
          delegationsError={delegationsError}
          assetDelegations={assetDelegations}
          setShowProfilePictureEditor={setShowProfilePictureEditor}
          setEditingNickname={setEditingNickname}
          setShowNicknameEditor={setShowNicknameEditor}
          setShowOnboardingWizard={setShowOnboardingWizard}
          setActiveTab={setActiveTab}
          setShowVerificationModal={setShowVerificationModal}
          setShowEnhancedPrivacyPanel={setShowEnhancedPrivacyPanel}
          setShowSessionManager={setShowSessionManager}
          setShowIntegrationSettings={setShowIntegrationSettings}
          setShowIntegrationDebugger={setShowIntegrationDebugger}
          setShowDataPointProposalModal={setShowDataPointProposalModal}
          setGlobalSettingsExpanded={setGlobalSettingsExpanded}
          setThirdPartyExpanded={setThirdPartyExpanded}
          setRecoveryThreshold={setRecoveryThreshold}
          setError={setError}
          setShowAddCustodianModal={setShowAddCustodianModal}
          setSelectedCustodianForInvitation={setSelectedCustodianForInvitation}
          setShowSendInvitationModal={setShowSendInvitationModal}
          setShowRecoveryKeyModal={setShowRecoveryKeyModal}
          setSelectedCustodianship={setSelectedCustodianship}
          setSelectedRecoveryRequest={setSelectedRecoveryRequest}
          setShowCustodianApprovalModal={setShowCustodianApprovalModal}
          setRecoveryRequests={setRecoveryRequests}
          setShowRecoveryInfo={setShowRecoveryInfo}
          setShowDelegationModal={setShowDelegationModal}
          handleNicknameUpdate={handleNicknameUpdate}
          handleExportData={handleExportData}
          handleLogout={handleLogout}
          handleRequestDataPoint={handleRequestDataPoint}
          handleToggleToolDataPoint={handleToggleToolDataPoint}
          handleOpenToolSettings={handleOpenToolSettings}
          bumpRecoveryAuthUi={bumpRecoveryAuthUi}
          refreshRecoveryVault={refreshRecoveryVault}
          handleRemoveCustodian={handleRemoveCustodian}
          handleDownloadRecoveryKey={handleDownloadRecoveryKey}
          handleOpenCustodianApprovalModal={handleOpenCustodianApprovalModal}
          ensureOwnerApiTokenForActiveUser={ensureOwnerApiTokenForActiveUser}
          showErrorMessage={showErrorMessage}
          showSuccessMessage={showSuccessMessage}
          refreshAssetDelegations={refreshAssetDelegations}
          handleRemoveDelegation={handleRemoveDelegation}
        />





        <AppModals
          showMigrationModal={showMigrationModal}
          setShowMigrationModal={setShowMigrationModal}
          pendingMigrations={pendingMigrations}
          handleMigrationComplete={handleMigrationComplete}
          showRecoveryModal={showRecoveryModal}
          setShowRecoveryModal={setShowRecoveryModal}
          activeRecoveryMethod={activeRecoveryMethod}
          setActiveRecoveryMethod={setActiveRecoveryMethod}
          handleInitiateRecoveryFromPn={handleInitiateRecoveryFromPn}
          handleInitiateRecoveryWithKey={handleInitiateRecoveryWithKey}
          recoveryKeys={recoveryKeys}
          recoveryVaultSummary={recoveryVaultSummary}
          showAddCustodianModal={showAddCustodianModal}
          setShowAddCustodianModal={setShowAddCustodianModal}
          showCustodianInfo={showCustodianInfo}
          setShowCustodianInfo={setShowCustodianInfo}
          handleAddCustodian={handleAddCustodian}
          showRecoveryKeyModal={showRecoveryKeyModal}
          setShowRecoveryKeyModal={setShowRecoveryKeyModal}
          recoveryKeyForm={recoveryKeyForm}
          setRecoveryKeyForm={setRecoveryKeyForm}
          handleGenerateRecoveryKey={handleGenerateRecoveryKey}
          showRecoveryKeyInputModal={showRecoveryKeyInputModal}
          setShowRecoveryKeyInputModal={setShowRecoveryKeyInputModal}
          recoveryKeyInput={recoveryKeyInput}
          setRecoveryKeyInput={setRecoveryKeyInput}
          recoveryKeyContactInfo={recoveryKeyContactInfo}
          setRecoveryKeyContactInfo={setRecoveryKeyContactInfo}
          showCustodianInvitationModal={showCustodianInvitationModal}
          setShowCustodianInvitationModal={setShowCustodianInvitationModal}
          pendingCustodianInvitation={pendingCustodianInvitation}
          setPendingCustodianInvitation={setPendingCustodianInvitation}
          handleCustodianInvitationAcceptance={handleCustodianInvitationAcceptance}
          showSendInvitationModal={showSendInvitationModal}
          setShowSendInvitationModal={setShowSendInvitationModal}
          selectedCustodianForInvitation={selectedCustodianForInvitation}
          setSelectedCustodianForInvitation={setSelectedCustodianForInvitation}
          custodianQRCode={custodianQRCode}
          setCustodianQRCode={setCustodianQRCode}
          custodianContactInfo={custodianContactInfo}
          setCustodianContactInfo={setCustodianContactInfo}
          generateCustodianQRCode={generateCustodianQRCode}
          handleContactAction={handleContactAction}
          showCustodianAcceptanceModal={showCustodianAcceptanceModal}
          setShowCustodianAcceptanceModal={setShowCustodianAcceptanceModal}
          pendingCustodianInvitationData={pendingCustodianInvitationData}
          setPendingCustodianInvitationData={setPendingCustodianInvitationData}
          custodianAcceptanceData={custodianAcceptanceData}
          setCustodianAcceptanceData={setCustodianAcceptanceData}
          handleCustodianAcceptance={handleCustodianAcceptance}
          showCustodianApprovalModal={showCustodianApprovalModal}
          setShowCustodianApprovalModal={setShowCustodianApprovalModal}
          selectedRecoveryRequest={selectedRecoveryRequest}
          selectedCustodianship={selectedCustodianship}
          recoveryThreshold={recoveryThreshold}
          handleApproveRecovery={handleApproveRecovery}
          setSuccessWithTimeout={setSuccessWithTimeout}
          showRecoveryPasscodeModal={showRecoveryPasscodeModal}
          setShowRecoveryPasscodeModal={setShowRecoveryPasscodeModal}
          setPendingRecoveryCompletion={setPendingRecoveryCompletion}
          loading={loading}
          handleRecoveryPasscodeSubmit={handleRecoveryPasscodeSubmit}
          showRecoveryCompleteModal={showRecoveryCompleteModal}
          setShowRecoveryCompleteModal={setShowRecoveryCompleteModal}
          recoveredDID={recoveredDID}
          handleRecoveryComplete={handleRecoveryComplete}
          handleDownloadRecoveredPn={handleDownloadRecoveredPn}
          recoveredIdentityExport={recoveredIdentityExport}
          showEnhancedPrivacyPanel={showEnhancedPrivacyPanel}
          setShowEnhancedPrivacyPanel={setShowEnhancedPrivacyPanel}
          privacySettings={privacySettings}
          setPrivacySettings={setPrivacySettings}
          showToolSettingsModal={showToolSettingsModal}
          setShowToolSettingsModal={setShowToolSettingsModal}
          selectedToolId={selectedToolId}
          showSessionManager={showSessionManager}
          setShowSessionManager={setShowSessionManager}
          showProfilePictureEditor={showProfilePictureEditor}
          selectedDID={selectedDID}
          handleProfilePictureUpdate={handleProfilePictureUpdate}
          setShowProfilePictureEditor={setShowProfilePictureEditor}
          showUnlockFromUsbModal={showUnlockFromUsbModal}
          setShowUnlockFromUsbModal={setShowUnlockFromUsbModal}
          handleUnlockFromUsb={handleUnlockFromUsb}
          setError={setError}
          showUnlockFromNfcModal={showUnlockFromNfcModal}
          setShowUnlockFromNfcModal={setShowUnlockFromNfcModal}
          showDeviceInfoModal={showDeviceInfoModal}
          setShowDeviceInfoModal={setShowDeviceInfoModal}
          currentDevice={currentDevice}
          showOnboardingWizard={showOnboardingWizard}
          setShowOnboardingWizard={setShowOnboardingWizard}
          setIsNewUser={setIsNewUser}
          authenticatedUser={authenticatedUser}
          handleUpdateNickname={handleUpdateNickname}
          handleExportData={handleExportData}
          handleExportToUsb={handleExportToUsb}
          handleExportToNfc={handleExportToNfc}
          setActiveTab={setActiveTab}
          showIntegrationSettings={showIntegrationSettings}
          setShowIntegrationSettings={setShowIntegrationSettings}
          showIntegrationDebugger={showIntegrationDebugger}
          setShowIntegrationDebugger={setShowIntegrationDebugger}
          showExportAuthModal={showExportAuthModal}
          setShowExportAuthModal={setShowExportAuthModal}
          setPendingExportAction={setPendingExportAction}
          setShowExportOptionsModal={setShowExportOptionsModal}
          exportAuthData={exportAuthData}
          setExportAuthData={setExportAuthData}
          showExportPnName={showExportPnName}
          setShowExportPnName={setShowExportPnName}
          showExportPasscode={showExportPasscode}
          setShowExportPasscode={setShowExportPasscode}
          handleExportAuth={handleExportAuth}
          pendingExportAction={pendingExportAction}
          showExportOptionsModal={showExportOptionsModal}
          handleDownloadExport={handleDownloadExport}
          handleExportDeviceBound={handleExportDeviceBound}
          canExportIdentity={canExportIdentity}
          deviceAuth={deviceAuth}
          handleTransfer={handleTransfer}
          showExportToUsbModal={showExportToUsbModal}
          identityForUsbExport={identityForUsbExport}
          setShowExportToUsbModal={setShowExportToUsbModal}
          setIdentityForUsbExport={setIdentityForUsbExport}
          showSuccessMessage={showSuccessMessage}
          showExportToNfcModal={showExportToNfcModal}
          identityForNfcExport={identityForNfcExport}
          setShowExportToNfcModal={setShowExportToNfcModal}
          setIdentityForNfcExport={setIdentityForNfcExport}
          showTransferSetupModal={showTransferSetupModal}
          setShowTransferSetupModal={setShowTransferSetupModal}
          transferCreated={transferCreated}
          setTransferCreated={setTransferCreated}
          transferPasscode={transferPasscode}
          setTransferPasscode={setTransferPasscode}
          transferUrl={transferUrl}
          handleTransferSetup={handleTransferSetup}
          success={success}
          showTransferReceiver={showTransferReceiver}
          transferId={transferId}
          setShowTransferReceiver={setShowTransferReceiver}
          showTermsOfService={showTermsOfService}
          showPrivacyPolicy={showPrivacyPolicy}
          showDmcaPolicy={showDmcaPolicy}
          setShowDmcaPolicy={setShowDmcaPolicy}
          showDataPointInputModal={showDataPointInputModal}
          currentDataPoint={currentDataPoint}
          setShowDataPointInputModal={setShowDataPointInputModal}
          currentDataPointExistingData={currentDataPointExistingData}
          handleDataPointInputComplete={handleDataPointInputComplete}
          selectedStoredIdentity={selectedStoredIdentity}
          showBiometricPasscodeModal={showBiometricPasscodeModal}
          pendingBiometricIdentity={pendingBiometricIdentity}
          setShowBiometricPasscodeModal={setShowBiometricPasscodeModal}
          setPendingBiometricIdentity={setPendingBiometricIdentity}
          setBiometricPasscodeError={setBiometricPasscodeError}
          handleBiometricPasscodeSubmit={handleBiometricPasscodeSubmit}
          biometricPasscodeError={biometricPasscodeError}
          showDelegationModal={showDelegationModal}
          setShowDelegationModal={setShowDelegationModal}
          apiToken={apiToken}
          refreshAssetDelegations={refreshAssetDelegations}
          showDataPointProposalModal={showDataPointProposalModal}
          setShowDataPointProposalModal={setShowDataPointProposalModal}
          showVerificationModal={showVerificationModal}
          setShowVerificationModal={setShowVerificationModal}
          attestedDataPoints={attestedDataPoints}
          verifiedDataPoints={verifiedDataPoints}
          setAttestedDataPoints={setAttestedDataPoints}
          setVerifiedDataPoints={setVerifiedDataPoints}
          mapDataPointIdToProofType={mapDataPointIdToProofType}
        />

      </main>


      {/* Footer */}
      <footer className="mt-auto py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-center items-center space-x-6 text-sm">
            <a 
              href="https://parnoir.com/terms" 
              className="text-text-secondary hover:text-primary transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </a>
            <span className="text-text-secondary">•</span>
            <a 
              href="https://parnoir.com/privacy" 
              className="text-text-secondary hover:text-primary transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>
            <span className="text-text-secondary">•</span>
            <a 
              href="/dmca" 
              className="text-text-secondary hover:text-primary transition-colors"
              onClick={(e) => {
                e.preventDefault();
                setShowDmcaPolicy(true);
              }}
            >
              DMCA
            </a>
          </div>
        </div>
      </footer>


    </div>
  );
}

export default App;

