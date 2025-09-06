import { cryptoWorkerManager } from '../utils/cryptoWorkerManager';
import React, { useState, useEffect } from 'react';
import { logger } from '../utils/logger';
import {
  TransferReceiverHeader,
  TransferInfoCard,
  TransferPasscodeInput,
  TransferActions,
  TransferStatus
} from '../components/transfer';

interface TransferData {
  id: string;
  ipfsCid: string;
  nickname: string;
  transferPasscode: string;
  expiresAt: string;
  directData?: any;
}

interface TransferReceiverProps {
  transferId: string;
  onClose: () => void;
}

const TransferReceiver: React.FC<TransferReceiverProps> = ({ transferId, onClose }) => {
  const [transferData, setTransferData] = useState<TransferData | null>(null);
  const [transferPasscode, setTransferPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [unlockedIdentityData, setUnlockedIdentityData] = useState<any>(null);

  useEffect(() => {
    const loadTransferData = async () => {
      logger.debug('TransferReceiver: Loading transfer data for ID:', transferId);
      
      if (transferId) {
        // First, try to get transfer data from URL parameters (for direct transfers)
        const urlParams = new URLSearchParams(window.location.search);
        const urlData = urlParams.get('data');
        
        logger.debug('TransferReceiver: URL data found:', !!urlData);
        
        if (urlData) {
          try {
            const data = JSON.parse(decodeURIComponent(urlData));
            logger.debug('TransferReceiver: Parsed URL data:', data);
            setTransferData(data);
            return;
          } catch (err) {
            logger.error('TransferReceiver: Error parsing URL data:', err);
            setError('Invalid transfer data in URL');
            return;
          }
        }
        
        // Try to get transfer metadata from localStorage (same device)
        const storedMetadata = localStorage.getItem(`transfer-${transferId}`);
        logger.debug('TransferReceiver: Stored metadata found:', !!storedMetadata);
        
        if (storedMetadata) {
          try {
            const metadata = JSON.parse(storedMetadata);
            logger.debug('TransferReceiver: Parsed stored metadata:', metadata);
            // Create transfer data object with metadata
            const transferData = {
              id: metadata.id,
              ipfsCid: metadata.ipfsCid,
              nickname: metadata.nickname,
              transferPasscode: metadata.transferPasscode,
              expiresAt: metadata.expiresAt
            };
            setTransferData(transferData);
          } catch (err) {
            logger.error('TransferReceiver: Error parsing stored metadata:', err);
            setError('Invalid transfer metadata');
          }
        } else {
          logger.debug('TransferReceiver: No stored metadata found, checking URL params again');
          // If not found in localStorage, this is a cross-device transfer
          // We need to get the transfer metadata from the URL or from IPFS
          const urlParams = new URLSearchParams(window.location.search);
          const urlData = urlParams.get('data');
          
          if (urlData) {
            try {
              const metadata = JSON.parse(decodeURIComponent(urlData));
              logger.debug('TransferReceiver: Parsed URL metadata:', metadata);
              if (metadata && metadata.id === transferId) {
                // Create transfer data object with metadata from URL
                const transferData = {
                  id: metadata.id,
                  ipfsCid: metadata.ipfsCid,
                  nickname: metadata.nickname,
                  transferPasscode: metadata.transferPasscode,
                  expiresAt: metadata.expiresAt
                };
                setTransferData(transferData);
              } else {
                logger.error('TransferReceiver: Transfer ID mismatch');
                setError('Invalid transfer data in URL');
              }
            } catch (err) {
              logger.error('TransferReceiver: Error parsing URL metadata:', err);
              setError('Invalid transfer data in URL');
            }
          } else {
            logger.error('TransferReceiver: No transfer data found anywhere');
            setError('Transfer not found. The transfer may have expired or the link is invalid.');
          }
        }
      }
    };

    loadTransferData();
  }, [transferId]);

  const handleUnlock = async () => {
    if (!transferData || !transferPasscode) {
      setError('Please enter the transfer passcode');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Verify transfer passcode
      if (transferPasscode !== transferData.transferPasscode) {
        throw new Error('Invalid transfer passcode');
      }

      // Check if transfer has expired
      if (new Date() > new Date(transferData.expiresAt)) {
        throw new Error('Transfer has expired');
      }

      let identityData;
      
      if (transferData.directData) {
        // Use direct data if available
        identityData = transferData.directData;
      } else {
        // Download from IPFS using direct Pinata gateway
        try {
          logger.debug('Downloading from IPFS:', transferData.ipfsCid);
          
          // Try multiple IPFS gateways
          const gateways = [
            `https://gateway.pinata.cloud/ipfs/${transferData.ipfsCid}`,
            `https://ipfs.io/ipfs/${transferData.ipfsCid}`,
            `https://cloudflare-ipfs.com/ipfs/${transferData.ipfsCid}`
          ];
          
          let response = null;
          for (const gateway of gateways) {
            try {
              response = await fetch(gateway);
              if (response.ok) break;
            } catch (error) {
              logger.debug('Gateway failed:', gateway, error);
              continue;
            }
          }
          
          if (!response || !response.ok) {
            throw new Error('Failed to download from IPFS gateways');
          }
          
          identityData = await response.json();
          logger.debug('Successfully downloaded from IPFS');
          
        } catch (ipfsError) {
          logger.error('IPFS download failed:', ipfsError);
          throw new Error('Failed to download identity data from IPFS');
        }
      }

      // The downloaded data is the encrypted pN file - decrypt it with transfer passcode
      const { IdentityCrypto } = await import('../utils/crypto');
      const decryptedPnFile = await IdentityCrypto.decryptData(
        identityData,
        transferPasscode
      );
      
      // Parse the decrypted pN file
      const pnFile = JSON.parse(decryptedPnFile);
      
      // Verify it has the correct structure
      if (!pnFile.version || !pnFile.identities || !pnFile.identities[0]) {
        throw new Error('Invalid pN file structure after decryption');
      }
      
      // Store the complete pN file for export
      setUnlockedIdentityData(pnFile);
      
      // Clean up the file from IPFS after successful decryption
      if (transferData.ipfsCid) {
        try {
          logger.debug('Cleaning up IPFS file:', transferData.ipfsCid);
          const pinataApiKey = import.meta.env.VITE_PINATA_API_KEY || process.env.REACT_APP_PINATA_API_KEY;
          const pinataSecretKey = import.meta.env.VITE_PINATA_SECRET_API_KEY || process.env.REACT_APP_PINATA_SECRET_API_KEY;
          
          if (!pinataApiKey || !pinataSecretKey) {
            logger.warn('Pinata API credentials not configured, skipping IPFS cleanup');
            return;
          }

          const response = await fetch(`https://api.pinata.cloud/pinning/unpin/${transferData.ipfsCid}`, {
            method: 'DELETE',
            headers: {
              'pinata_api_key': pinataApiKey,
              'pinata_secret_api_key': pinataSecretKey
            }
          });

          if (response.ok) {
            logger.debug('Successfully cleaned up IPFS file');
          } else {
            logger.warn('Failed to clean up IPFS file:', response.status);
          }
        } catch (cleanupError) {
          logger.warn('Error during IPFS cleanup:', cleanupError);
        }
      }
      
      setSuccess('Identity unlocked successfully! You can now export it to this device.');
      
    } catch (error: any) {
      setError(error.message || 'Failed to unlock identity');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!unlockedIdentityData) return;
    
    setLoading(true);
    
    try {
      // Create a download link for the pN file
      const dataStr = JSON.stringify(unlockedIdentityData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `identity-${transferData?.nickname || 'transfer'}.pn`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      setSuccess('Identity exported successfully!');
      
    } catch (error: any) {
      setError('Failed to export identity: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!transferData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full text-text-primary">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-semibold">Loading Transfer...</h1>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <p className="text-text-secondary">Please wait while we load the transfer data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto text-text-primary">
        
        {/* Header */}
        <TransferReceiverHeader onClose={onClose} />
        
        <div className="space-y-4">
          {/* Transfer Info */}
          <TransferInfoCard transferData={transferData} />

          {/* Status Messages */}
          <TransferStatus error={error} success={success} />

          {/* Passcode Input */}
          <TransferPasscodeInput
            transferPasscode={transferPasscode}
            onPasscodeChange={setTransferPasscode}
            loading={loading}
          />

          {/* Actions */}
          <TransferActions
            loading={loading}
            transferPasscode={transferPasscode}
            unlockedIdentityData={unlockedIdentityData}
            onUnlock={handleUnlock}
            onExport={handleExport}
            onClose={onClose}
            success={success}
          />
        </div>
      </div>
    </div>
  );
};

export default TransferReceiver;
