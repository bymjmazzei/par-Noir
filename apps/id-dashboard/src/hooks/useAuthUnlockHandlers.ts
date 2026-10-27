/**
 * Auth, unlock and logout handlers for the dashboard shell.
 *
 * Extracted from App.tsx: App owns the state, this hook owns the behavior.
 */
import React from 'react';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import type { HostedShellSession } from '@par-noir/oauth-ui';
import { exchangeCodeForToken, setStoredToken } from '../services/parNoirOAuthInline';
import { IntegrationCredentialManager } from '../utils/integrationCredentialManager';
import { notificationsService } from '../utils/notificationsService';
import SimpleStorage, { SimpleIdentity } from '../utils/simpleStorage';
import type { SecureStorage } from '../utils/storage';
import type { DIDInfo } from '../types/app';
import type { useApiToken } from './useApiToken';

type ApiTokenState = ReturnType<typeof useApiToken>;

export interface UseAuthUnlockHandlersParams {
  storage: SecureStorage;
  authenticatedUser: any;
  setAuthenticatedUser: React.Dispatch<React.SetStateAction<any>>;
  setDids: React.Dispatch<React.SetStateAction<DIDInfo[]>>;
  setSelectedDID: React.Dispatch<React.SetStateAction<DIDInfo | null>>;
  selectedStoredIdentity: any;
  setSelectedStoredIdentity: React.Dispatch<React.SetStateAction<any>>;
  recoveryVaultPnId: string | null;
  /** When false, lock may wipe sealed cloud credentials (unkeyed session). */
  isKeyedSession?: boolean;
  /** When true, web Case B: wipe sealed cloud on lock even if this session is unkeyed. */
  hasKeyedDevices?: boolean;

  apiToken: string | null;
  clearApiToken: ApiTokenState['clearApiToken'];
  ensureApiTokenAfterUnlock: ApiTokenState['ensureApiTokenAfterUnlock'];
  adoptShellAccessToken: ApiTokenState['adoptShellAccessToken'];
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

export function useAuthUnlockHandlers(params: UseAuthUnlockHandlersParams) {
  const {
    storage,
    authenticatedUser,
    setAuthenticatedUser,
    setDids,
    setSelectedDID,
    selectedStoredIdentity,
    setSelectedStoredIdentity,
    recoveryVaultPnId,
    isKeyedSession = false,
    hasKeyedDevices = false,
    apiToken,
    clearApiToken,
    ensureApiTokenAfterUnlock,
    adoptShellAccessToken,
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
                const { deriveCanonicalPnIdentifier } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');
                const pnIdentifier = deriveCanonicalPnIdentifier(session.publicKey);
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
          nickname: identity.nickname || '',
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
      
      try {
        const { wipeDashboardSessionVaultOnLogout } = await import(
          '../components/DashboardSessionVaultHost'
        );
        await wipeDashboardSessionVaultOnLogout();
      } catch {
        /* ignore */
      }

      // SECURITY: Clear all credentials from memory
      SecureCredentialManager.clearAll();
      try {
        const { clearShellMlKem } = await import('../services/shellMlKem');
        clearShellMlKem();
      } catch {
        /* ignore */
      }
      
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
  };



  const handleDeleteIdentity = async (identity: SimpleIdentity) => {
    try {
      const storage = SimpleStorage.getInstance();
      await storage.deleteIdentity(identity.id);
      
      // Clear selection if the deleted identity was selected
      if (selectedStoredIdentity?.id === identity.id) {
        setSelectedStoredIdentity(null);
      }
      
      setSuccessWithTimeout(`Identity "${identity.nickname}" deleted successfully`);
      setTimeout(() => setSuccessWithTimeout(null), 3000);
    } catch (error) {
      setError('Failed to delete identity');
      setTimeout(() => setError(null), 3000);
    }
  };



  const handleUnlockFromUsb = async (result: import('../components/unlock/UnlockFromUsbModal').UnlockFromUsbResult) => {
    const { authSession, identityToUnlock, identityData, publicKey, nickname, identityId } = result;
    await storage.storeSession(authSession);

    const data = identityData as Record<string, unknown>;
    const didInfo: DIDInfo = {
      id: identityId,
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
    showSuccessMessage('pN unlocked from USB successfully!');
  };

  const handleShellSession = async (session: HostedShellSession) => {
    if (!session.code && !session.accessToken && session.op !== 'seal_vault') return;
    setLoading(true);
    setError(null);
    try {
      let accessToken = session.accessToken;
      if (session.code) {
        const redirectUri = `${window.location.origin}${window.location.pathname}${window.location.search}`;
        accessToken = await exchangeCodeForToken(session.code, redirectUri);
      }
      if (!accessToken) {
        throw new Error('Unlock did not return a session');
      }
      if (session.op === 'seal_vault' && session.result?.sealedVault) {
        const { publishSealedVault } = await import('../services/sealVaultHandoff');
        await publishSealedVault(session, accessToken);
      }
      const mlKemSecretKey = session.result?.mlKemSecretKey;
      if (mlKemSecretKey && session.publicKey) {
        const { rememberShellMlKem } = await import('../services/shellMlKem');
        const { deriveCanonicalPnIdentifier } = await import(
          '@par-noir/pqc-crypto/oauth-unlock-proof'
        );
        rememberShellMlKem(
          [session.publicKey, session.did, deriveCanonicalPnIdentifier(session.publicKey)],
          mlKemSecretKey
        );
      }
      const authenticatedAt = new Date().toISOString();
      await storage.storeSession({
        id: session.did,
        nickname: session.nickname || 'pN',
        accessToken,
        expiresIn: 3600,
        authenticatedAt,
        publicKey: session.publicKey,
      });
      if (session.publicKey) {
        await adoptShellAccessToken(accessToken, session.publicKey);
      } else {
        setStoredToken({
          accessToken,
          expiresAt: Date.now() + 60 * 60 * 1000,
        });
      }
      setAuthenticatedUser({
        id: session.did,
        nickname: session.nickname || 'pN',
        accessToken,
        expiresIn: 3600,
        authenticatedAt,
        publicKey: session.publicKey,
      });
    } catch (error: any) {
      logError('Shell unlock error:', error);
      setError(error.message || 'Failed to open unlock session');
    } finally {
      setLoading(false);
    }
  };

  const shellSessionRef = React.useRef(handleShellSession);
  shellSessionRef.current = handleShellSession;
  React.useEffect(() => {
    const onShell = (event: Event) => {
      const session = (event as CustomEvent<HostedShellSession>).detail;
      if (session) void shellSessionRef.current(session);
    };
    window.addEventListener('pn-hosted-shell-session', onShell);
    return () => window.removeEventListener('pn-hosted-shell-session', onShell);
  }, []);

  return {
    handleShellSession,
    handleAuthSuccess,
    handleAuthError,
    handleLogout,
    handleIdentitySelect,
    handleDeleteIdentity,
    handleUnlockFromUsb,
  };
}
