import React, { useState, useEffect } from 'react';
import { logger } from '../utils/logger';

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
          const cleanupResponse = await fetch(`https://api.pinata.cloud/pinning/unpin/${transferData.ipfsCid}`, {
            method: 'DELETE',
            headers: {
              'pinata_api_key': '6c557a6d433e0ad1de47',
              'pinata_secret_api_key': '600492827bbfa45b4a9d506faf50a88059b06965b70fefe0856be509b0fe4d87'
            }
          });
          
          if (cleanupResponse.ok) {
            logger.debug('IPFS file cleaned up successfully');
          } else {
            logger.warn('IPFS cleanup failed with status:', cleanupResponse.status);
          }
        } catch (cleanupError) {
          logger.warn('Failed to cleanup IPFS file:', cleanupError);
          // Don't fail the transfer if cleanup fails
        }
      }
      
      setSuccess('Transfer unlocked successfully! You can now export the pN file to this device.');
      
    } catch (err: any) {
      setError(err.message || 'Unlock failed');
    } finally {
      setLoading(false);
    }
  };



  const handleExport = async () => {
    if (!unlockedIdentityData) {
      setError('No unlocked identity data available');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Create a downloadable file
      const blob = new Blob([JSON.stringify(unlockedIdentityData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${transferData?.nickname || 'identity'}-backup.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess('Identity file exported successfully! You can now import it using the "Import Identity" feature.');
      
      // Auto-close after 3 seconds
      setTimeout(() => {
        onClose();
      }, 3000);
      
    } catch (err: any) {
      setError(err.message || 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  if (!transferId) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full text-text-primary">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-semibold">Invalid Transfer Link</h1>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <p className="text-text-secondary">This transfer link is invalid.</p>
        </div>
      </div>
    );
  }

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
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-semibold">Unlock Identity Transfer</h1>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        
        <div className="space-y-4">
          <div className="bg-secondary p-3 rounded-lg">
            <div className="text-sm text-text-primary">
              <strong>From:</strong> {transferData.nickname}
            </div>
            <div className="text-xs text-text-secondary mt-1">
              Expires: {new Date(transferData.expiresAt).toLocaleString()}
            </div>
            <div className="text-xs text-text-secondary mt-2">
              {transferData.ipfsCid.startsWith('direct-transfer-') 
                ? '📱 Direct Transfer (Data included in URL)'
                : '🌐 IPFS Transfer (Decentralized storage)'
              }
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Transfer Passcode
            </label>
            <input
              type="password"
              value={transferPasscode}
              onChange={(e) => setTransferPasscode(e.target.value)}
              className="w-full px-3 py-2 bg-input-bg border border-border rounded-md text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Enter the transfer passcode"
              disabled={loading}
            />
          </div>

          {!unlockedIdentityData ? (
            <button
              onClick={handleUnlock}
              disabled={loading || !transferPasscode}
              className="w-full px-4 py-2 bg-primary text-bg-primary rounded-md hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Unlocking...' : 'Unlock Identity'}
            </button>
          ) : (
            <button
              onClick={handleExport}
              disabled={loading}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Exporting...' : 'Export Identity File'}
            </button>
          )}

          <div className="text-xs text-text-secondary text-center">
            <p>Enter the transfer passcode to unlock this identity. After unlocking, you can export it to this device.</p>
          </div>

          {success && (
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransferReceiver;