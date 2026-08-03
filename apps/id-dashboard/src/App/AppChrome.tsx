import React from 'react';
import { RefreshCw } from 'lucide-react';
import Header from '../components/Header';
import { ExtensionWarningBanner } from '../components/security/ExtensionWarningBanner';
import { SecureMetadataStorage } from '../utils/secureMetadataStorage';
import type { OfflineSyncStatus } from '../hooks/usePwaSyncHelpers';

export interface AppChromeProps {
  networkIdentityRetired: boolean;
  authenticatedUser: any;
  pwaState: any;
  pwaHandlers: any;
  handleLogout: any;
  handleOfflineModeChange: any;
  handleExportData: any;
  success: string | null;
  setSuccessWithTimeout: (message: string | null) => void;
  successTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  error: string | null;
  getOfflineSyncStatus: () => OfflineSyncStatus;
  setShowDmcaPolicy: React.Dispatch<React.SetStateAction<boolean>>;
  apiToken?: string | null;
  pnIdentifier?: string | null;
  isKeyedSession?: boolean;
  onOpenRecoveryForPairing?: () => void;
  children: React.ReactNode;
}

export function AppChrome(props: AppChromeProps) {
  const {
    networkIdentityRetired,
    authenticatedUser,
    pwaState,
    pwaHandlers,
    handleLogout,
    handleOfflineModeChange,
    handleExportData,
    success,
    setSuccessWithTimeout,
    successTimeoutRef,
    error,
    getOfflineSyncStatus,
    setShowDmcaPolicy,
    apiToken = null,
    pnIdentifier = null,
    isKeyedSession = false,
    onOpenRecoveryForPairing,
    children
  } = props;

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
        apiToken={apiToken}
        pnIdentifier={pnIdentifier}
        isKeyedSession={isKeyedSession}
        onOpenRecoveryForPairing={onOpenRecoveryForPairing}
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

      <main className="flex-1">{children}</main>

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
