/**
 * QR generation, cloud-update polling, offline sync status, and webapp -> PWA
 * storage sync helpers for the dashboard shell.
 *
 * Extracted from App.tsx: App owns the state, this hook owns the behavior.
 */
import QRCode from 'qrcode';
import { cloudSyncManager } from '../utils/cloudSync';
import { SecureMetadataStorage } from '../utils/secureMetadataStorage';
import { getTimeAgo } from '../utils/helpers';

export interface UsePwaSyncHelpersParams {
  setSuccessWithTimeout: (message: string | null) => void;
  logDebug: (message: string, ...args: unknown[]) => void;
  logError: (message: string, ...args: unknown[]) => void;
}

export interface OfflineSyncStatus {
  hasPending: boolean;
  pendingCount: number;
  lastSync: string;
}

export function usePwaSyncHelpers(params: UsePwaSyncHelpersParams) {
  const { setSuccessWithTimeout, logDebug, logError } = params;

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

  // Get offline sync status
  const getOfflineSyncStatus = (): OfflineSyncStatus => {
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

  return {
    generateDeviceFingerprint,
    generateQRCode,
    checkForCloudUpdates,
    getOfflineSyncStatus,
    generateSyncKey,
    syncFromWebappStorage
  };
}
