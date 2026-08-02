/**
 * Export, device-bound export, USB/NFC export and Bluetooth transfer handlers.
 *
 * Extracted from App.tsx: App owns the state, this hook owns the behavior.
 */
import type React from 'react';
import { IdentityCrypto } from '@par-noir/identity-crypto';
import SimpleStorage from '../utils/simpleStorage';
import { createDeviceBoundPnExport } from '../services/deviceBoundPnService';
import type { SecureStorage } from '../utils/storage';
import type { DIDInfo } from '../types/app';
import type { useDeviceAuthState } from './useDeviceAuthState';

export type ExportAction = 'download' | 'usb' | 'nfc' | 'device-bound' | null;

export interface ExportIdentityPayload {
  encryptedData: string;
  iv: string;
  salt: string;
  publicKey?: string;
}

export interface UseExportTransferHandlersParams {
  storage: SecureStorage;
  authenticatedUser: any;
  selectedDID: DIDInfo | null;
  recoveryVaultPnId: string | null;
  canExportIdentity: boolean;
  deviceAuth: ReturnType<typeof useDeviceAuthState>;

  exportAuthData: { pnName: string; passcode: string };
  setExportAuthData: React.Dispatch<React.SetStateAction<{ pnName: string; passcode: string }>>;
  pendingExportAction: ExportAction;
  setPendingExportAction: React.Dispatch<React.SetStateAction<ExportAction>>;
  setShowExportAuthModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowExportOptionsModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowExportToUsbModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowExportToNfcModal: React.Dispatch<React.SetStateAction<boolean>>;
  setIdentityForUsbExport: React.Dispatch<React.SetStateAction<ExportIdentityPayload | null>>;
  setIdentityForNfcExport: React.Dispatch<React.SetStateAction<ExportIdentityPayload | null>>;

  setShowTransferSetupModal: React.Dispatch<React.SetStateAction<boolean>>;
  transferPasscode: string;
  setTransferUrl: React.Dispatch<React.SetStateAction<string>>;
  setTransferId: React.Dispatch<React.SetStateAction<string>>;
  setTransferPasscode: React.Dispatch<React.SetStateAction<string>>;
  setTransferCreated: React.Dispatch<React.SetStateAction<boolean>>;
  generateQRCode: (url: string) => Promise<void>;

  setError: React.Dispatch<React.SetStateAction<string | null>>;
  showSuccessMessage: (message: string, duration?: number) => void;
  logError: (message: string, ...args: unknown[]) => void;
}

export function useExportTransferHandlers(params: UseExportTransferHandlersParams) {
  const {
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
  } = params;

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

  return {
    handleExportData,
    handleExportAuth,
    handleDownloadExport,
    handleExportDeviceBound,
    handleDeviceBoundDownload,
    handleExportToNfc,
    handleExportToUsb,
    handleTransfer,
    handleTransferSetup
  };
}
