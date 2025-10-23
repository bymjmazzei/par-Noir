import React from 'react';

interface TransferSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  transferCreated: boolean;
  setTransferCreated: (created: boolean) => void;
  transferPasscode: string;
  setTransferPasscode: (passcode: string) => void;
  transferUrl: string;
  onTransferSetup: () => void;
  onCopyUrl: () => void;
  success: string | null;
}

export function TransferSetupModal({
  isOpen,
  onClose,
  transferCreated,
  setTransferCreated,
  transferPasscode,
  setTransferPasscode,
  transferUrl,
  onTransferSetup,
  onCopyUrl,
  success
}: TransferSetupModalProps) {
  if (!isOpen) return null;

  const handleClose = () => {
    setTransferCreated(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">
            {transferCreated ? 'Transfer Created' : 'Setup Transfer'}
          </h2>
          <button 
            onClick={handleClose}
            className="modal-close-button"
          >
            ×
          </button>
        </div>
        
        {!transferCreated ? (
          <div className="space-y-4">
            <div className="text-sm text-text-secondary mb-4">
              Create a transfer passcode to secure the pN file transfer:
            </div>
            
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Transfer Passcode
              </label>
              <input
                type="password"
                value={transferPasscode}
                onChange={(e) => setTransferPasscode(e.target.value)}
                className="w-full px-3 py-2 bg-input-bg border border-border rounded-md text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Enter a transfer passcode (min 4 characters)"
              />
              <p className="text-xs text-text-secondary mt-1">
                This passcode will be required to download the pN file on the target device.
              </p>
            </div>
            
            <div className="flex space-x-3 pt-4">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={onTransferSetup}
                disabled={!transferPasscode || transferPasscode.length < 4}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Transfer
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-text-secondary mb-4">
              Share this URL or QR code with the target device:
            </div>
            
            <div className="bg-secondary p-3 rounded-lg">
              <div className="text-xs text-text-secondary mb-1">Transfer URL:</div>
              <div className="text-sm font-mono break-all text-text-primary">{transferUrl}</div>
            </div>
            
            <div className="text-center">
              <div className="bg-secondary p-4 rounded-lg inline-block">
                <div id="qr-code-container" className="w-48 h-48 bg-white flex items-center justify-center">
                  {/* QR Code will be generated here */}
                </div>
              </div>
            </div>
            
            <div className="bg-secondary p-3 rounded-lg">
              <div className="text-sm text-text-primary">
                <strong>Transfer Instructions:</strong>
                <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                  <li>• Target device opens the URL</li>
                  <li>• Enters the transfer passcode</li>
                  <li>• Downloads the pN file</li>
                  <li>• Uses normal unlock flow with the file</li>
                  <li>• Transfer expires in 30 minutes</li>
                </ul>
              </div>
            </div>
            
            <div className="flex space-x-3 pt-4">
              <button
                onClick={onCopyUrl}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
              >
                Copy URL
              </button>
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
