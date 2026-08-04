import React from 'react';

interface ExportAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportAuthData: { pnName: string; passcode: string };
  setExportAuthData: React.Dispatch<React.SetStateAction<{ pnName: string; passcode: string }>>;
  showExportPnName: boolean;
  setShowExportPnName: (show: boolean) => void;
  showExportPasscode: boolean;
  setShowExportPasscode: (show: boolean) => void;
  onAuth: () => void;
  /** Shown when auth is for a specific export type */
  purpose?: 'download' | 'usb' | 'nfc' | 'device-bound';
}

export function ExportAuthModal({
  isOpen,
  onClose,
  exportAuthData,
  setExportAuthData,
  showExportPnName,
  setShowExportPnName,
  showExportPasscode,
  setShowExportPasscode,
  onAuth,
  purpose
}: ExportAuthModalProps) {
  if (!isOpen) return null;

  const handleClose = () => {
    setExportAuthData({ pnName: '', passcode: '' });
    setShowExportPnName(false);
    setShowExportPasscode(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">
            {purpose === 'download'
              ? 'Enter credentials for download'
              : purpose === 'usb'
                ? 'Enter credentials for USB export'
                : purpose === 'nfc'
                  ? 'Enter credentials for NFC export'
                  : purpose === 'device-bound'
                    ? 'Enter credentials for device-bound export'
                    : 'Verify Identity'}
          </h2>
          <button 
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        
        <div className="space-y-4">
          {purpose === 'device-bound' && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-text-secondary">
              This backup unlocks only on the keyed device that created it. If you lose or replace
              this device, you will need a portable backup or Shamir recovery. Keep at least one
              portable `.pn` backup or recovery custodians.
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-2">Key 1</label>
            <div className="relative">
              <input
                type={showExportPnName ? "text" : "password"}
                value={exportAuthData.pnName}
                onChange={(e) => setExportAuthData(prev => ({ ...prev, pnName: e.target.value }))}
                className="w-full px-3 py-2 pr-10 border border-border rounded-md bg-input-bg text-text-primary"
                placeholder="Enter Key 1"
              />
              <button
                type="button"
                onClick={() => setShowExportPnName(!showExportPnName)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showExportPnName ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Key 2</label>
            <div className="relative">
              <input
                type={showExportPasscode ? "text" : "password"}
                value={exportAuthData.passcode}
                onChange={(e) => setExportAuthData(prev => ({ ...prev, passcode: e.target.value }))}
                className="w-full px-3 py-2 pr-10 border border-border rounded-md bg-input-bg text-text-primary"
                placeholder="Enter Key 2"
              />
              <button
                type="button"
                onClick={() => setShowExportPasscode(!showExportPasscode)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showExportPasscode ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
          </div>
          
          <div className="flex space-x-3 pt-4">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={onAuth}
              className="flex-1 px-4 py-2 bg-primary text-bg-primary rounded-md hover:bg-hover"
            >
              Verify
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
