/**
 * Boot-time effects for the dashboard shell: deep-link/route handling, system
 * initialization, storage + cloud sync bring-up, and PWA lock management.
 *
 * Extracted from App.tsx: App owns the state, this hook owns the behavior.
 */
import type React from 'react';
import { useEffect } from 'react';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { analytics } from '../utils/analytics';
import { MigrationManager, WebIdentityData } from '../utils/migration';
import { cloudSyncManager } from '../utils/cloudSync';
import { SessionDataMigration } from '../utils/sessionDataMigration';
import { IntegrationCredentialManager } from '../utils/integrationCredentialManager';
import { ScreenProtection } from '../utils/security/screenProtection';
import { ExtensionDetector } from '../utils/security/extensionDetector';
import SimpleStorage from '../utils/simpleStorage';
import type { SecureStorage } from '../utils/storage';
import type { DIDInfo } from '../types/app';

export interface UseAppBootstrapEffectsParams {
  storage: SecureStorage;

  authenticatedUser: any;
  setAuthenticatedUser: React.Dispatch<React.SetStateAction<any>>;
  setSelectedDID: React.Dispatch<React.SetStateAction<DIDInfo | null>>;

  setShowTransferReceiver: React.Dispatch<React.SetStateAction<boolean>>;
  setTransferId: React.Dispatch<React.SetStateAction<string>>;
  setShowTermsOfService: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPrivacyPolicy: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDmcaPolicy: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCreateForm: React.Dispatch<React.SetStateAction<boolean>>;

  pendingCustodianInvitationData: any;
  setPendingCustodianInvitationData: React.Dispatch<React.SetStateAction<any>>;
  setShowCustodianAcceptanceModal: React.Dispatch<React.SetStateAction<boolean>>;

  migrationChecked: boolean;
  setMigrationChecked: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingMigrations: React.Dispatch<React.SetStateAction<WebIdentityData[]>>;
  setShowMigrationModal: React.Dispatch<React.SetStateAction<boolean>>;

  pwaState: any;
  isPWALocked: boolean;
  setIsPWALocked: React.Dispatch<React.SetStateAction<boolean>>;

  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessWithTimeout: (message: string | null) => void;
  showSuccessMessage: (message: string) => void;

  checkForCloudUpdates: () => Promise<void>;
  syncFromWebappStorage: () => Promise<{ identities: any[] } | null>;

  logDebug: (message: string, ...args: unknown[]) => void;
  logError: (message: string, ...args: unknown[]) => void;
}

export function useAppBootstrapEffects(params: UseAppBootstrapEffectsParams) {
  const {
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
  } = params;

  // Hide native splash screen when app is ready
  useEffect(() => {
    SplashScreen.hide().catch(() => {});
  }, []);

  // SECURITY: Migrate SimpleStorage from localStorage to IndexedDB on app start
  useEffect(() => {
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

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 9000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    logDebug('PWA State:', pwaState);
  }, [pwaState]);

  return {
    checkForMigration,
    handlePWAUnlock,
    handlePWAFallback
  };
}
