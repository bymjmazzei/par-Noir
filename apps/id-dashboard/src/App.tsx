import React, { useState, useEffect, lazy, useRef, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import Header from './components/Header';
import { SecureStorage } from './utils/storage';
import { UnifiedAuth } from './components/UnifiedAuth';
import QRCode from 'qrcode';

import { EncryptedIdentity } from '@par-noir/identity-crypto';

import { analytics } from './utils/analytics';
import usePWA from './hooks/usePWA';
import { GlobalPrivacySettings } from './types/privacy';
import { useRecoveryVaultState } from './hooks/useRecoveryVaultState';
import { useDeviceAuthState } from './hooks/useDeviceAuthState';
import { DEVICE_CAPABILITIES } from '@par-noir/device-auth';
import { ownerGet } from './services/ownerApiService';
import { getRecoveryAuthSession } from './services/recoveryAuthSession';

import { MigrationManager, WebIdentityData, MigrationResult } from './utils/migration';

import { cloudSyncManager } from './utils/cloudSync';
import { SecureMetadataStorage } from './utils/secureMetadataStorage';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { SessionDataMigration } from './utils/sessionDataMigration';
import { IntegrationCredentialManager } from './utils/integrationCredentialManager';

import { API_ENDPOINT } from './config/api';

import SimpleStorage from './utils/simpleStorage';

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
import { CreateDidModal } from './App/CreateDidModal';
import { ImportDidModal } from './App/ImportDidModal';
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
import { useExportTransferHandlers } from './hooks/useExportTransferHandlers';
import { useAuthUnlockHandlers } from './hooks/useAuthUnlockHandlers';
import { useCreateImportHandlers } from './hooks/useCreateImportHandlers';
import { useIdentityProfileHandlers } from './hooks/useIdentityProfileHandlers';
import { useToolPrivacyHandlers } from './hooks/useToolPrivacyHandlers';
import {
  useRecoveryCustodianHandlers,
  type PendingRecoveryCompletion
} from './hooks/useRecoveryCustodianHandlers';

// Lazy load heavy components
const BiometricSetup = lazy(() => import('./components/BiometricSetup').then(module => ({ default: module.BiometricSetup })));
const PWALockScreen = lazy(() => import('./components/PWALockScreen').then(module => ({ default: module.default })));


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

  const [pendingRecoveryCompletion, setPendingRecoveryCompletion] =
    useState<PendingRecoveryCompletion | null>(null);
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

  const { handleCreateDID, handleImportDID } = useCreateImportHandlers({
    storage,
    recoveryVaultPnId,
    createForm,
    setCreateForm,
    createStep,
    setCreateStep,
    setShowCreateForm,
    importForm,
    setImportForm,
    setShowImportForm,
    setDids,
    setSelectedDID,
    setAuthenticatedUser,
    setIsNewUser,
    setShowOnboardingWizard,
    setLoading,
    setError,
    setSuccessWithTimeout,
    showSuccessMessage,
    logDebug,
    logError
  });

  const {
    handleAuthSuccess,
    handleAuthError,
    handleLogout,
    handleIdentitySelect,
    handleDeleteIdentity,
    handleUnlockFromUsb,
    handleMainFormSubmit,
    handleSimpleUnlock,
    handleBiometricAuth,
    handleBiometricPasscodeSubmit,
    handleBiometricSetupSuccess,
    showBiometricPasscodeModal,
    setShowBiometricPasscodeModal,
    pendingBiometricIdentity,
    setPendingBiometricIdentity,
    biometricPasscodeError,
    setBiometricPasscodeError
  } = useAuthUnlockHandlers({
    storage,
    authenticatedUser,
    setAuthenticatedUser,
    setDids,
    setSelectedDID,
    selectedStoredIdentity,
    setSelectedStoredIdentity,
    mainForm,
    setMainForm,
    setShowMainPNName,
    setShowMainPasscode,
    recoveryVaultPnId,
    apiToken,
    clearApiToken,
    ensureApiTokenAfterUnlock,
    getEncryptedIdentityForApiToken,
    setLoading,
    setError,
    setSuccessWithTimeout,
    showSuccessMessage,
    logDebug,
    logError
  });








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

  const {
    handleExportData,
    handleExportAuth,
    handleDownloadExport,
    handleExportDeviceBound,
    handleExportToNfc,
    handleExportToUsb,
    handleTransfer,
    handleTransferSetup
  } = useExportTransferHandlers({
    storage,
    authenticatedUser,
    selectedDID,
    recoveryVaultPnId,
    canExportIdentity,
    deviceAuth,
    exportAuthData,
    setExportAuthData,
    pendingExportAction,
    setPendingExportAction,
    setShowExportAuthModal,
    setShowExportOptionsModal,
    setShowExportToUsbModal,
    setShowExportToNfcModal,
    setIdentityForUsbExport,
    setIdentityForNfcExport,
    setShowTransferSetupModal,
    transferPasscode,
    setTransferUrl,
    setTransferId,
    setTransferPasscode,
    setTransferCreated,
    generateQRCode,
    setError,
    showSuccessMessage,
    logError
  });

  const {
    handleNicknameUpdate,
    handleProfilePictureUpdate,
    handleUpdateNickname
  } = useIdentityProfileHandlers({
    storage,
    authenticatedUser,
    setAuthenticatedUser,
    setDids,
    selectedDID,
    setSelectedDID,
    currentDevice,
    generateDeviceFingerprint,
    pwaState,
    canProfileWrite,
    deviceAuth,
    setLoading,
    setError,
    setShowNicknameEditor,
    setShowProfilePictureEditor,
    showSuccessMessage,
    showErrorMessage,
    logDebug,
    logError
  });

  const toolPrivacyHandlers = useToolPrivacyHandlers({
    authenticatedUser,
    selectedDID,
    currentDevice,
    generateDeviceFingerprint,
    privacySettings,
    setPrivacySettings,
    setSelectedToolId,
    setShowToolSettingsModal,
    currentDataPoint,
    setCurrentDataPoint,
    setCurrentDataPointExistingData,
    setShowDataPointInputModal,
    setAttestedDataPoints,
    setError,
    setSuccessWithTimeout,
    logDebug,
    logError
  });

  const {
    generateCustodianQRCode,
    handleContactAction,
    handleAddCustodian,
    handleCustodianAcceptance,
    handleApproveRecovery,
    handleInitiateRecoveryFromPn,
    handleRecoveryPasscodeSubmit,
    handleGenerateRecoveryKey,
    handleDownloadRecoveryKey,
    handleInitiateRecoveryWithKey,
    handleRemoveCustodian,
    handleDownloadRecoveredPn,
    handleRecoveryComplete,
    handleOpenCustodianApprovalModal,
    handleCustodianInvitationAcceptance
  } = useRecoveryCustodianHandlers({
    storage,
    apiToken,
    authenticatedUser,
    setAuthenticatedUser,
    selectedDID,
    dids,
    recoveryVaultPnId,
    recoveryVaultSummary,
    refreshRecoveryVault,
    getEncryptedIdentityForApiToken,
    canManageCustodians,
    canExportIdentity,
    deviceAuth,
    recoveryThreshold,
    custodians,
    setCustodians,
    recoveryRequests,
    setRecoveryRequests,
    recoveryKeys,
    setRecoveryKeys,
    custodianships,
    setCustodianships,
    custodianContactInfo,
    setCustodianContactInfo,
    setCustodianQRCode,
    selectedCustodianForInvitation,
    custodianAcceptanceData,
    setCustodianAcceptanceData,
    pendingCustodianInvitationData,
    setPendingCustodianInvitationData,
    setShowCustodianAcceptanceModal,
    setShowCustodianInvitationModal,
    setPendingCustodianInvitation,
    setShowAddCustodianModal,
    setShowRecoveryModal,
    setShowRecoveryKeyModal,
    setShowRecoveryKeyInputModal,
    setRecoveryKeyInput,
    setRecoveryKeyContactInfo,
    pendingRecoveryCompletion,
    setPendingRecoveryCompletion,
    setShowRecoveryPasscodeModal,
    recoveredIdentityExport,
    setRecoveredIdentityExport,
    recoveredDID,
    setRecoveredDID,
    setShowRecoveryCompleteModal,
    setSelectedRecoveryRequest,
    setSelectedCustodianship,
    setShowCustodianApprovalModal,
    currentDevice,
    setCurrentDevice,
    generateDeviceFingerprint,
    generateSyncKey,
    setLicenseKey,
    setLicenseInfo,
    setLicenseProof,
    setLoading,
    setError,
    setSuccessWithTimeout,
    logDebug,
    logError
  });





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


    

  // Note: Success notifications are now managed by showSuccessMessage() function
  // which properly handles timeout management with successTimeoutRef




  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 9000);
      return () => clearTimeout(timer);
    }
  }, [error]);

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






        <CreateDidModal
          showCreateForm={showCreateForm}
          setShowCreateForm={setShowCreateForm}
          createStep={createStep}
          setCreateStep={setCreateStep}
          createForm={createForm}
          setCreateForm={setCreateForm}
          showPNName={showPNName}
          setShowPNName={setShowPNName}
          showPasscode={showPasscode}
          setShowPasscode={setShowPasscode}
          showConfirmPNName={showConfirmPNName}
          setShowConfirmPNName={setShowConfirmPNName}
          showConfirmPasscode={showConfirmPasscode}
          setShowConfirmPasscode={setShowConfirmPasscode}
          error={error}
          handleCreateDID={handleCreateDID}
        />

        <ImportDidModal
          showImportForm={showImportForm}
          setShowImportForm={setShowImportForm}
          importForm={importForm}
          setImportForm={setImportForm}
          loading={loading}
          handleImportDID={handleImportDID}
        />




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
          handleRequestDataPoint={toolPrivacyHandlers.handleRequestDataPoint}
          handleToggleToolDataPoint={toolPrivacyHandlers.handleToggleToolDataPoint}
          handleOpenToolSettings={toolPrivacyHandlers.handleOpenToolSettings}
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
          handleDataPointInputComplete={toolPrivacyHandlers.handleDataPointInputComplete}
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
          mapDataPointIdToProofType={toolPrivacyHandlers.mapDataPointIdToProofType}
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

