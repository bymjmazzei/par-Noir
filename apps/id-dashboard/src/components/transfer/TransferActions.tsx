import React from 'react';

interface TransferActionsProps {
  loading: boolean;
  transferPasscode: string;
  unlockedIdentityData: any;
  onUnlock: () => void;
  onExport: () => void;
  onClose: () => void;
  success: string;
}

export const TransferActions: React.FC<TransferActionsProps> = React.memo(({ 
  loading, 
  transferPasscode, 
  unlockedIdentityData, 
  onUnlock, 
  onExport, 
  onClose, 
  success 
}) => {
  return (
    <div className="space-y-4">
      {!unlockedIdentityData ? (
        <button
          onClick={onUnlock}
          disabled={loading || !transferPasscode}
          className="w-full px-4 py-2 bg-primary text-bg-primary rounded-md hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Unlocking...' : 'Unlock Identity'}
        </button>
      ) : (
        <button
          onClick={onExport}
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
  );
});

TransferActions.displayName = 'TransferActions';
