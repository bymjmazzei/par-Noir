/**
 * Nickname and profile picture handlers for the unlocked identity.
 *
 * Extracted from App.tsx: App owns the state, this hook owns the behavior.
 */
import type React from 'react';
import type { EncryptedIdentity } from '@par-noir/identity-crypto';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { cloudSyncManager } from '../utils/cloudSync';
import { SecureMetadataStorage } from '../utils/secureMetadataStorage';
import type { SecureStorage } from '../utils/storage';
import type { DIDInfo, SyncedDevice } from '../types/app';
import type { useDeviceAuthState } from './useDeviceAuthState';

export interface UseIdentityProfileHandlersParams {
  storage: SecureStorage;
  authenticatedUser: any;
  setAuthenticatedUser: React.Dispatch<React.SetStateAction<any>>;
  setDids: React.Dispatch<React.SetStateAction<DIDInfo[]>>;
  selectedDID: DIDInfo | null;
  setSelectedDID: React.Dispatch<React.SetStateAction<DIDInfo | null>>;
  currentDevice: SyncedDevice | null;
  generateDeviceFingerprint: () => string;
  pwaState: { isInstalled: boolean };
  canProfileWrite: boolean;
  deviceAuth: ReturnType<typeof useDeviceAuthState>;

  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setShowNicknameEditor: React.Dispatch<React.SetStateAction<boolean>>;
  setShowProfilePictureEditor: React.Dispatch<React.SetStateAction<boolean>>;
  showSuccessMessage: (message: string, duration?: number) => void;
  showErrorMessage: (message: string, duration?: number) => void;
  logDebug: (message: string, ...args: unknown[]) => void;
  logError: (message: string, ...args: unknown[]) => void;
}

export function useIdentityProfileHandlers(params: UseIdentityProfileHandlersParams) {
  const {
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
  } = params;

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

  return {
    handleIncomingNicknameUpdate,
    handleNicknameUpdate,
    handleProfilePictureUpdate,
    handleUpdateNickname
  };
}
