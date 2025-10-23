import React from 'react';
import { PartyPopper, RefreshCw, Info } from 'lucide-react';

interface RecoveryCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  recoveredDID: {
    nickname: string;
  };
  onRecoveryComplete: (recoveredDID: { nickname: string }) => void;
}

export function RecoveryCompletionModal({
  isOpen,
  onClose,
  recoveredDID,
  onRecoveryComplete
}: RecoveryCompletionModalProps) {
  if (!isOpen || !recoveredDID) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-semibold">Recovery Successful!</h2>
          <button
            onClick={onClose}
            className="modal-close-button"
          >
            ×
          </button>
        </div>
        
        <div className="space-y-6">
          <div className="text-center">
            <div className="text-6xl mb-4 flex justify-center">
              <PartyPopper className="w-16 h-16 text-green-500" />
            </div>
            <h3 className="text-lg font-medium mb-2">Identity Recovered!</h3>
            <p className="text-sm text-gray-600 mb-4">
              Your identity <strong>{recoveredDID.nickname}</strong> has been successfully recovered.
            </p>
          </div>
          
          <div className="bg-secondary p-4 rounded-lg">
            <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Primary Device Setup
            </h4>
            <div className="text-sm text-text-secondary space-y-2">
              <p>• <strong>Current Device:</strong> {navigator.platform} - {navigator.userAgent.split(' ').pop()?.split('/')[0] || 'Unknown'}</p>
              <p>• <strong>Action:</strong> This device will become your new primary device</p>
              <p>• <strong>Security:</strong> All previous devices will be disconnected</p>
              <p>• <strong>Sync:</strong> Your data will sync to this device</p>
            </div>
          </div>
          
          <div className="bg-gray-100 p-4 rounded-lg">
            <h4 className="font-medium text-black mb-2 flex items-center gap-2">
              <Info className="w-5 h-5" />
              What Happens Next
            </h4>
            <div className="text-sm text-black space-y-1">
              <p>• This device becomes your new primary device</p>
              <p>• All previous synced devices will be disconnected</p>
              <p>• You can add new devices using QR codes</p>
              <p>• Your identity data will be restored to this device</p>
              <p>• <strong>Automatic License Transfer:</strong> All licenses will be transferred to the new identity</p>
              <p>• <strong>ZK Proof Validation:</strong> Recovery was validated using zero-knowledge proofs</p>
              <p>• <strong>Security:</strong> Previous devices lose access immediately</p>
            </div>
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 modal-button rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onRecoveryComplete(recoveredDID);
                onClose();
              }}
              className="flex-1 px-4 py-2 modal-button rounded-md"
            >
              Set as Primary Device
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
