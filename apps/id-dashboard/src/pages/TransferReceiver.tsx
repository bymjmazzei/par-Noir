import React, { useState, useEffect } from 'react';

interface TransferData {
  id: string;
  ipfsCid: string;
  nickname: string;
  transferPasscode: string;
  expiresAt: string;
}

interface TransferReceiverProps {
  transferId: string;
  onClose: () => void;
}

const TransferReceiver: React.FC<TransferReceiverProps> = ({ transferId, onClose }) => {
  const [transferData, setTransferData] = useState<TransferData | null>(null);
  const [transferPasscode, setTransferPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showTransferPasscode, setShowTransferPasscode] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  useEffect(() => {
    if (!transferId) {
      setError('Invalid transfer ID');
      return;
    }

    // Get transfer data from URL parameters (cross-device compatible)
    const urlParams = new URLSearchParams(window.location.search);
    const encodedData = urlParams.get('data');
    console.log('TransferReceiver: Looking for transfer ID:', transferId);
    console.log('TransferReceiver: Encoded data found:', !!encodedData);
    
    if (!encodedData) {
      setError('Transfer not found or expired');
      return;
    }
    
    try {
      const decodedData = atob(encodedData);
      const transferData: TransferData = JSON.parse(decodedData);
      console.log('TransferReceiver: Transfer data loaded:', transferData);
      console.log('TransferReceiver: Expires at:', transferData.expiresAt);
      console.log('TransferReceiver: Current time:', new Date().toISOString());
      
      // Check if transfer has expired
      const expiresAt = new Date(transferData.expiresAt);
      const now = new Date();
      console.log('TransferReceiver: Expires at (parsed):', expiresAt);
      console.log('TransferReceiver: Current time (parsed):', now);
      console.log('TransferReceiver: Has expired:', expiresAt < now);
      
      if (expiresAt < now) {
        setError(`Transfer has expired. Expired at: ${expiresAt.toLocaleTimeString()}, Current time: ${now.toLocaleTimeString()}`);
        return;
      }

      setTransferData(transferData);
    } catch (err) {
      console.error('TransferReceiver: Error parsing transfer data:', err);
      setError('Invalid transfer data');
    }
  }, [transferId]);

  const handleVerifyTransferPasscode = async () => {
    if (!transferData) return;

    setLoading(true);
    setError(null);

    try {
      if (!transferPasscode) {
        throw new Error('Transfer passcode is required');
      }

      // Verify transfer passcode
      if (transferPasscode !== transferData.transferPasscode) {
        throw new Error('Invalid transfer passcode');
      }

      // Download original pN file from IPFS
      const { IPFSMetadataService } = await import('../utils/ipfsMetadataService');
      const ipfsService = new IPFSMetadataService();
      const originalPnFileData = await ipfsService.downloadIdentityData(transferData.ipfsCid);
      console.log('Original pN file downloaded from IPFS:', transferData.ipfsCid);
      console.log('Downloaded data:', JSON.stringify(originalPnFileData, null, 2));

      // Create downloadable pN file with the proper backup format
      const jsonString = JSON.stringify(originalPnFileData, null, 2);
      console.log('JSON string for file:', jsonString);
      console.log('JSON string length:', jsonString.length);
      
      // Create the file with JSON MIME type for cross-platform compatibility
      const pnFileBlob = new Blob([jsonString], { type: 'application/json' });
      console.log('Blob size:', pnFileBlob.size);
      
      // Create filename with .json extension for cross-platform compatibility
      const cleanNickname = transferData.nickname
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()
        .substring(0, 20);
      const filename = `${cleanNickname}-backup.json`;
      
      console.log('File size:', pnFileBlob.size);

      // Trigger file download exactly like the export function
      const downloadUrl = URL.createObjectURL(pnFileBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);

      // Delete the IPFS file after successful download
      await ipfsService.deleteIdentityData(transferData.ipfsCid);
      console.log('IPFS file deleted after successful download:', transferData.ipfsCid);

      setSuccess('pN file downloaded successfully! You can now unlock it using the normal unlock flow.');
      setShowTransferModal(false);
      
    } catch (err: any) {
      setError(err.message || 'Failed to verify transfer passcode');
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-modal-bg rounded-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">Transfer Error</h2>
            <p className="text-text-secondary">{error}</p>
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!transferData) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-modal-bg rounded-lg p-8 max-w-md w-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-text-secondary mt-4">Loading transfer...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      {/* Main unlock screen */}
      <div className="bg-modal-bg rounded-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Unlock pN</h1>
          <p className="text-text-secondary">Access your pN identity</p>
        </div>

        {/* Transfer info */}
        <div className="bg-secondary p-4 rounded-lg mb-6">
          <div className="text-sm text-text-primary">
            <strong>Transfer Available:</strong>
            <div className="mt-2 space-y-1 text-xs text-text-secondary">
              <div>• pN: {transferData.nickname}</div>
              <div>• Expires: {new Date(transferData.expiresAt).toLocaleTimeString()}</div>
            </div>
          </div>
        </div>

        {/* Transfer button */}
        <div className="space-y-4">
          <button
            onClick={() => setShowTransferModal(true)}
            className="w-full px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            Download pN File
          </button>
          
          <div className="text-center">
            <p className="text-xs text-text-secondary">
              Click above to download the pN file, then use the normal unlock flow
            </p>
          </div>
        </div>

        {success && (
          <div className="mt-4 bg-green-500/10 border border-green-500/20 rounded-lg p-3">
            <p className="text-green-400 text-sm">{success}</p>
          </div>
        )}
      </div>

      {/* Transfer Passcode Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full text-text-primary">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Enter Transfer Passcode</h2>
              <button 
                onClick={() => setShowTransferModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="text-sm text-text-secondary mb-4">
                Enter the transfer passcode to download the pN file:
              </div>
              
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Transfer Passcode
                </label>
                <div className="relative">
                  <input
                    type={showTransferPasscode ? "text" : "password"}
                    value={transferPasscode}
                    onChange={(e) => setTransferPasscode(e.target.value)}
                    className="w-full px-3 py-2 bg-input-bg border border-border rounded-md text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Enter the transfer passcode"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowTransferPasscode(!showTransferPasscode)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-secondary hover:text-text-primary"
                    disabled={loading}
                  >
                    {showTransferPasscode ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleVerifyTransferPasscode}
                  disabled={loading || !transferPasscode}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Downloading...
                    </div>
                  ) : (
                    'Download pN File'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransferReceiver;
