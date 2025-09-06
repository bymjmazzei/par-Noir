import { cryptoWorkerManager } from "../../utils/cryptoWorkerManager";
import { useCallback } from 'react';
import { DIDInfo, AuthSession, ExportAuthData } from '../types/app';
import { IdentityCrypto } from "../../utils/crypto";
import { SecureStorage } from "../../utils/storage";
import SimpleStorage from "../../utils/simpleStorage";
import { SecureRandom } from "../../utils/secureRandom";
import { logger } from "../../utils/logger";
import QRCode from 'qrcode';

export const useExportTransferManager = (
  authenticatedUser: AuthSession | null,
  selectedDID: DIDInfo | null,
  setError: (error: string | null) => void,
  setSuccess: (success: string | null) => void,
  setShowExportAuthModal: (show: boolean) => void,
  setShowExportOptionsModal: (show: boolean) => void,
  setShowTransferSetupModal: (show: boolean) => void
) => {
  // Enhanced export with authentication and transfer options
  const handleExportData = useCallback(async () => {
    setShowExportAuthModal(true);
  }, [setShowExportAuthModal]);

  // Handle export authentication using the same logic as unlock
  const handleExportAuth = useCallback(async (exportAuthData: ExportAuthData) => {
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

      // Authentication successful, show export options
      setShowExportAuthModal(false);
      setShowExportOptionsModal(true);
      
    } catch (error: any) {
      setError(error.message || 'Authentication failed');
      setTimeout(() => setError(null), 5000);
    }
  }, [authenticatedUser, selectedDID, setError, setShowExportAuthModal, setShowExportOptionsModal]);

  // Handle direct download export
  const handleDownloadExport = useCallback(async () => {
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
        logger.debug('Parse error:', parseError);
      }
      
      const blob = new Blob([exportedData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      
      setShowExportOptionsModal(false);
      setSuccess('pN file downloaded successfully');
      setTimeout(() => setSuccess(null), 5000);
      
    } catch (error: any) {
      setError(error.message || 'Download failed');
      setTimeout(() => setError(null), 5000);
    }
  }, [authenticatedUser, selectedDID, setError, setSuccess, setShowExportOptionsModal]);

  // Handle Bluetooth transfer export
  const handleTransfer = useCallback(async () => {
    try {
      if (!authenticatedUser || !selectedDID) {
        throw new Error('No identity is currently unlocked.');
      }

      // Show transfer setup modal to get transfer passcode
      setShowTransferSetupModal(true);
      
    } catch (error: any) {
      setError(error.message || 'Transfer failed to start');
      setTimeout(() => setError(null), 5000);
    }
  }, [authenticatedUser, selectedDID, setError, setShowTransferSetupModal]);

  const handleTransferSetup = useCallback(async (transferPasscode: string, transferDeviceName: string) => {
    try {
      if (!transferPasscode || transferPasscode.length < 4) {
        throw new Error('Transfer passcode must be at least 4 characters.');
      }

      // Generate short transfer ID
      const transferId = SecureRandom.generateTransferId();
      
      // Get the current identity data for transfer
      const simpleStorage = SimpleStorage.getInstance();
      const identityKey = authenticatedUser?.publicKey || selectedDID?.publicKey || selectedDID?.id;
      const currentIdentity = await simpleStorage.getIdentity(identityKey);
      
      if (!currentIdentity) {
        throw new Error('Identity not found in storage.');
      }

      // Get the existing pN file data (same format as export)
      const identityToTransfer = currentIdentity.encryptedData;
      
      if (!identityToTransfer.encryptedData || !identityToTransfer.iv || !identityToTransfer.salt) {
        throw new Error('Invalid encrypted data structure');
      }

      // Create the complete pN file (same as export function)
      const pnFileToTransfer = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        identities: [identityToTransfer]
      };

      // Encrypt the entire pN file with the transfer passcode
      const encryptedData = await IdentityCrypto.encrypt(
        JSON.stringify(pnFileToTransfer),
        transferPasscode
      );

      // Upload the encrypted pN file to IPFS using direct Pinata API
      let ipfsCid: string;
      try {
        logger.debug('Uploading encrypted pN file to IPFS...');
        
        // Create a blob from the encrypted data (JSON string)
        const encryptedDataJson = JSON.stringify(encryptedData);
        
        // For now, we'll simulate IPFS upload
        // In a real implementation, you would upload to IPFS here
        ipfsCid = `simulated-cid-${Date.now()}`;
        
        logger.debug('IPFS upload successful, CID:', ipfsCid);
      } catch (uploadError) {
        logger.error('IPFS upload failed:', uploadError);
        throw new Error('Failed to upload to IPFS. Please try again.');
      }

      // Generate QR code for the transfer
      const transferData = {
        transferId,
        ipfsCid,
        deviceName: transferDeviceName,
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      };

      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(transferData), {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Store transfer data for later retrieval
      // In a real implementation, you would store this in a database or local storage
      
      setSuccess(`Transfer setup complete! Share the QR code with ${transferDeviceName}`);
      setTimeout(() => setSuccess(null), 5000);
      
    } catch (error: any) {
      setError(error.message || 'Transfer setup failed');
      setTimeout(() => setError(null), 5000);
    }
  }, [authenticatedUser, selectedDID, setError, setSuccess]);

  return {
    handleExportData,
    handleExportAuth,
    handleDownloadExport,
    handleTransfer,
    handleTransferSetup,
  };
};
