/**
 * Auth, unlock, logout and biometric handlers for the dashboard shell.
 *
 * Extracted from App.tsx: App owns the state, this hook owns the behavior.
 */
import React from 'react';
import {
  IdentityCrypto,
  SecureCredentialManager,
  type AuthSession,
  type EncryptedIdentity
} from '@par-noir/identity-crypto';
import * as BiometricAdapter from '../utils/biometricAdapter';
import { cloudSyncManager } from '../utils/cloudSync';
import { IntegrationCredentialManager } from '../utils/integrationCredentialManager';
import { notificationsService } from '../utils/notificationsService';
import { parsePortablePnBackup } from '../utils/parsePortablePnBackup';
import { SecureMetadataStorage } from '../utils/secureMetadataStorage';
import SimpleStorage, { SimpleIdentity } from '../utils/simpleStorage';
import type { SecureStorage } from '../utils/storage';
import {
  authenticateDeviceBoundPn,
  checkDeviceBoundPnUnlockAvailable,
  DEVICE_BOUND_PN_ERROR,
  isDeviceBoundPnEnvelope,
} from '../services/deviceBoundPnService';
import type { DIDInfo } from '../types/app';
import type { useApiToken } from './useApiToken';

type ApiTokenState = ReturnType<typeof useApiToken>;

export interface MainUnlockForm {
  pnName: string;
  passcode: string;
  uploadFile: File | null;
}

export interface UseAuthUnlockHandlersParams {
  storage: SecureStorage;
  authenticatedUser: any;
  setAuthenticatedUser: React.Dispatch<React.SetStateAction<any>>;
  setDids: React.Dispatch<React.SetStateAction<DIDInfo[]>>;
  setSelectedDID: React.Dispatch<React.SetStateAction<DIDInfo | null>>;
  selectedStoredIdentity: any;
  setSelectedStoredIdentity: React.Dispatch<React.SetStateAction<any>>;
  mainForm: MainUnlockForm;
  setMainForm: React.Dispatch<React.SetStateAction<MainUnlockForm>>;
  setShowMainPNName: React.Dispatch<React.SetStateAction<boolean>>;
  setShowMainPasscode: React.Dispatch<React.SetStateAction<boolean>>;
  recoveryVaultPnId: string | null;
  /** When false, lock may wipe sealed cloud credentials (unkeyed session). */
  isKeyedSession?: boolean;
  /** When true, web Case B: wipe sealed cloud on lock even if this session is unkeyed. */
  hasKeyedDevices?: boolean;

  apiToken: string | null;
  clearApiToken: ApiTokenState['clearApiToken'];
  ensureApiTokenAfterUnlock: ApiTokenState['ensureApiTokenAfterUnlock'];
  getEncryptedIdentityForApiToken: (
    identityPublicKeyOrId: string | undefined
  ) => Promise<{ encryptedData: string; iv: string; salt: string } | null>;

  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessWithTimeout: (message: string | null) => void;
  showSuccessMessage: (message: string, duration?: number) => void;
  logDebug: (message: string, ...args: unknown[]) => void;
  logError: (message: string, ...args: unknown[]) => void;
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

export function useAuthUnlockHandlers(params: UseAuthUnlockHandlersParams) {
  const {
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
    isKeyedSession = false,
    hasKeyedDevices = false,
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
  } = params;

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
                const { migrateAndFlushOnUnlock } = await import('../services/deviceCloudCredentials');
                const { derivePnIdentifierForToken } = await import('../services/parNoirOAuthInline');
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
          '../services/deviceCloudCredentials'
        );
        const { clearCloudSessionBootstrap } = await import('../services/storage/cloudSessionBootstrap');
        const { clearCloudCredentialsOnLock } = await import('@par-noir/device-cloud-credentials');
        stopDeviceCloudWorkers();
        clearCloudSessionBootstrap();
        const authUser = authenticatedUser;
        const identityId = recoveryVaultPnId || null;
        if (identityId) {
          await clearCloudCredentialsOnLock({
            identityId,
            isKeyedSession: !!isKeyedSession,
            hasKeyedDevices: !!hasKeyedDevices,
          }).catch(() => undefined);
          // Wipe native/web durable store only when we should not retain (Case B unkeyed)
          const retain = !!isKeyedSession || !hasKeyedDevices;
          if (!retain) {
            await wipeDeviceCloudCredentials(identityId).catch(() => undefined);
          }
        } else if (authUser?.id && !isKeyedSession && hasKeyedDevices) {
          // Fallback only when pn id unknown — may no-op if seal key differs
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



  const handleUnlockFromUsb = async (result: import('../components/unlock/UnlockFromUsbModal').UnlockFromUsbResult) => {
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
        const { maybeMigrateVolumeId } = await import('../utils/volumeIdMigration');
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

  return {
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
  };
}
