import React, { useState, useEffect } from 'react';

interface TransferData {
  id: string;
  /** Legacy field retained for URL shape; direct transfers use `direct-transfer-*`. */
  ipfsCid: string;
  nickname: string;
  transferPasscode: string;
  expiresAt: string;
  directData?: unknown;
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

    const urlParams = new URLSearchParams(window.location.search);
    const encodedData = urlParams.get('data');

    if (!encodedData) {
      setError('Transfer not found or expired');
      return;
    }

    try {
      const decodedData = atob(encodedData);
      const parsed: TransferData = JSON.parse(decodedData);

      const expiresAt = new Date(parsed.expiresAt);
      const now = new Date();

      if (expiresAt < now) {
        setError(`Transfer has expired. Expired at: ${expiresAt.toLocaleTimeString()}, Current time: ${now.toLocaleTimeString()}`);
        return;
      }

      if (!parsed.directData) {
        setError('This transfer link is no longer supported. Ask the sender to create a new transfer.');
        return;
      }

      setTransferData(parsed);
    } catch (err) {
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

      if (transferPasscode !== transferData.transferPasscode) {
        throw new Error('Invalid transfer passcode');
      }

      const originalPnFileData = transferData.directData;
      if (!originalPnFileData) {
        throw new Error('Transfer payload missing');
      }

      const jsonString = JSON.stringify(originalPnFileData, null, 2);
      const pnFileBlob = new Blob([jsonString], { type: 'application/json' });

      const cleanNickname = transferData.nickname
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()
        .substring(0, 20);
      const filename = `${cleanNickname}-backup.json`;

      const downloadUrl = URL.createObjectURL(pnFileBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);

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
            <p className="mt-4 text-text-secondary">Loading transfer…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="bg-modal-bg rounded-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-text-primary mb-2">Receive Transfer</h2>
          <p className="text-text-secondary text-sm">
            From: {transferData.nickname}
          </p>
          <p className="text-text-secondary text-xs mt-1">
            Expires: {new Date(transferData.expiresAt).toLocaleString()}
          </p>
        </div>

        {success ? (
          <div className="text-center">
            <p className="text-green-400 mb-4">{success}</p>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-primary text-white rounded-md"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm text-text-secondary mb-2">Transfer passcode</label>
              <div className="relative">
                <input
                  type={showTransferPasscode ? 'text' : 'password'}
                  value={transferPasscode}
                  onChange={(e) => setTransferPasscode(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-text-primary"
                  placeholder="Enter passcode"
                />
                <button
                  type="button"
                  onClick={() => setShowTransferPasscode(!showTransferPasscode)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary text-xs"
                >
                  {showTransferPasscode ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyTransferPasscode}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-md disabled:opacity-50"
              >
                {loading ? 'Downloading…' : 'Download pN'}
              </button>
            </div>
          </>
        )}

        {showTransferModal && null}
      </div>
    </div>
  );
};

export default TransferReceiver;
