import React, { useState, useEffect, lazy, useRef, useCallback } from 'react';
import { SecureStorage } from './utils/storage';
import { UnifiedAuth } from './components/UnifiedAuth';

import { EncryptedIdentity } from '@par-noir/identity-crypto';

import usePWA from './hooks/usePWA';
import { GlobalPrivacySettings } from './types/privacy';
import { useRecoveryVaultState } from './hooks/useRecoveryVaultState';
import { useDeviceAuthState } from './hooks/useDeviceAuthState';
import { DEVICE_CAPABILITIES } from '@par-noir/device-auth';
import { ownerGet } from './services/ownerApiService';
import { getRecoveryAuthSession } from './services/recoveryAuthSession';

import { MigrationResult } from './utils/migration';

import { SecureCredentialManager } from '@par-noir/identity-crypto';

import { API_ENDPOINT } from './config/api';

import SimpleStorage from './utils/simpleStorage';

import {
  listAllDelegations,
  revokeAssetDelegation,
  type AssetDelegation
} from './services/ownedAssetService';
import { AuthenticatedShell } from './App/AuthenticatedShell';
import { AppModals } from './App/AppModals';
import { UnlockGate } from './App/UnlockGate';
import { CreateDidModal } from './App/CreateDidModal';
import { ImportDidModal } from './App/ImportDidModal';
import { AppChrome } from './App/AppChrome';
import { CloudReconnectHost } from './components/storage/CloudReconnectHost';
import { UnkeyedUnlockAlertEmitter } from './components/UnkeyedUnlockAlertEmitter';

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
import { usePwaSyncHelpers } from './hooks/usePwaSyncHelpers';
import { useAppBootstrapEffects } from './hooks/useAppBootstrapEffects';

// Lazy load heavy components
const BiometricSetup = lazy(() => import('./components/BiometricSetup').then(module => ({ default: module.BiometricSetup })));
const PWALockScreen = lazy(() => import('./components/PWALockScreen').then(module => ({ default: module.default })));


function App() {
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
    sessionId: authenticatedUser?.id ?? null,
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
        }).then(async (token) => {
          if (!token || cancelled) return;
          try {
            const { migrateAndFlushOnUnlock } = await import('./services/deviceCloudCredentials');
            const { derivePnIdentifierForToken } = await import('./services/parNoirOAuthInline');
            const pnIdentifier = await derivePnIdentifierForToken(
              credentials.pnName,
              credentials.passcode,
              authenticatedUser.publicKey || identityKey
            );
            await migrateAndFlushOnUnlock({
              identityId: pnIdentifier,
              authToken: token,
              session: {
                sessionId: authenticatedUser.id,
                pnName: credentials.pnName,
                passcode: credentials.passcode
              }
            });
          } catch {
            /* device cloud migrate best-effort */
          }
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

  const handleOfflineModeChange = () => {
    // This function is no longer needed since we removed the offline mode state
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
    isKeyedSession: deviceAuth.isKeyedSession,
    hasKeyedDevices: deviceAuth.hasKeyedDevices,
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








  const {
    generateDeviceFingerprint,
    generateQRCode,
    checkForCloudUpdates,
    getOfflineSyncStatus,
    generateSyncKey,
    syncFromWebappStorage
  } = usePwaSyncHelpers({
    setSuccessWithTimeout,
    logDebug,
    logError
  });

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
    handleContinueReadyRecovery,
    handleResendCustodianNotify,
    handleCancelActiveRecovery,
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





  // Note: Success notifications are now managed by showSuccessMessage() function
  // which properly handles timeout management with successTimeoutRef

  useAppBootstrapEffects({
    storage,
    authenticatedUser,
    setAuthenticatedUser,
    setSelectedDID,
    setShowTransferReceiver,
    setTransferId,
    setShowTermsOfService,
    setShowPrivacyPolicy,
    setShowDmcaPolicy,
    setShowCreateForm,
    pendingCustodianInvitationData,
    setPendingCustodianInvitationData,
    setShowCustodianAcceptanceModal,
    migrationChecked,
    setMigrationChecked,
    setPendingMigrations,
    setShowMigrationModal,
    pwaState,
    isPWALocked,
    setIsPWALocked,
    error,
    setError,
    setSuccessWithTimeout,
    showSuccessMessage,
    checkForCloudUpdates,
    syncFromWebappStorage,
    logDebug,
    logError
  });

  return (
    <AppChrome
      networkIdentityRetired={networkIdentityRetired}
      authenticatedUser={authenticatedUser}
      pwaState={pwaState}
      pwaHandlers={pwaHandlers}
      handleLogout={handleLogout}
      handleOfflineModeChange={handleOfflineModeChange}
      handleExportData={handleExportData}
      success={success}
      setSuccessWithTimeout={setSuccessWithTimeout}
      successTimeoutRef={successTimeoutRef}
      error={error}
      getOfflineSyncStatus={getOfflineSyncStatus}
      setShowDmcaPolicy={setShowDmcaPolicy}
      apiToken={apiToken}
      pnIdentifier={recoveryVaultPnId}
      isKeyedSession={deviceAuth.isKeyedSession}
      onOpenRecoveryForPairing={() => setActiveTab('recovery')}
    >
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
          getEncryptedIdentityForApiToken={getEncryptedIdentityForApiToken}
          showErrorMessage={showErrorMessage}
          showSuccessMessage={showSuccessMessage}
          refreshAssetDelegations={refreshAssetDelegations}
          handleRemoveDelegation={handleRemoveDelegation}
        />

        <CloudReconnectHost
          apiToken={apiToken}
          pnIdentifier={recoveryVaultPnId}
          sessionId={authenticatedUser?.id ?? null}
          isKeyedSession={deviceAuth.isKeyedSession}
          hasKeyedDevices={deviceAuth.hasKeyedDevices}
          onPaired={() => deviceAuth.refresh()}
          onCloudReady={() => {
            /* Storage tab hydrates on next focus / MultiCloud refresh */
          }}
        />
        <UnkeyedUnlockAlertEmitter
          apiToken={apiToken}
          pnIdentifier={recoveryVaultPnId}
          hasKeyedDevices={deviceAuth.hasKeyedDevices}
          isKeyedSession={deviceAuth.isKeyedSession}
          registryReady={!deviceAuth.loading && !!apiToken && !!recoveryVaultPnId}
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
          handleContinueReadyRecovery={handleContinueReadyRecovery}
          handleResendCustodianNotify={handleResendCustodianNotify}
          handleCancelActiveRecovery={handleCancelActiveRecovery}
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
    </AppChrome>
  );
}

export default App;

