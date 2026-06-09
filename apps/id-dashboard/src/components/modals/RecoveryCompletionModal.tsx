import React from 'react';
import { PartyPopper, RefreshCw, Info, Download } from 'lucide-react';

interface RecoveryCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  recoveredDID: {
    nickname: string;
  } | null;
  onRecoveryComplete: (recoveredDID: { nickname: string }) => void;
  onDownloadPn?: () => void;
  hasRecoveredPn?: boolean;
}

export function RecoveryCompletionModal({
  isOpen,
  onClose,
  recoveredDID,
  onRecoveryComplete,
  onDownloadPn,
  hasRecoveredPn
}: RecoveryCompletionModalProps) {
  if (!isOpen || !recoveredDID) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-semibold">Recovery Successful!</h2>
          <button onClick={onClose} className="modal-close-button">
            ×
          </button>
        </div>

        <div className="space-y-6">
          <div className="text-center">
            <div className="text-6xl mb-4 flex justify-center">
              <PartyPopper className="w-16 h-16 text-green-500" />
            </div>
            <h3 className="text-lg font-medium mb-2">Recovery complete</h3>
            <p className="text-sm text-gray-600 mb-4">
              <strong>{recoveredDID.nickname}</strong> is unlocked on this device with the same cryptographic keys.
              Your new passcode is saved locally.
            </p>
          </div>

          {hasRecoveredPn && onDownloadPn && (
            <div className="bg-secondary p-4 rounded-lg">
              <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
                <Download className="w-5 h-5" />
                Save your updated .pn file
              </h4>
              <p className="text-sm text-text-secondary mb-3">
                Download and store your recovered identity file. You will need it for future recovery or device transfer.
              </p>
              <button
                type="button"
                onClick={onDownloadPn}
                className="w-full px-4 py-2 modal-button rounded-md"
              >
                Download recovered .pn
              </button>
            </div>
          )}

          <div className="bg-secondary p-4 rounded-lg">
            <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Reconnect Google Drive
            </h4>
            <div className="text-sm text-text-secondary space-y-2">
              <p>• Open Storage settings and reconnect Google Drive for this identity</p>
              <p>• Your platform id and messaging keys are unchanged</p>
              <p>• Custodians authorized recovery via ZK proofs — no shares left their devices</p>
            </div>
          </div>

          <div className="bg-gray-100 p-4 rounded-lg">
            <h4 className="font-medium text-black mb-2 flex items-center gap-2">
              <Info className="w-5 h-5" />
              What Happens Next
            </h4>
            <div className="text-sm text-black space-y-1">
              <p>• This device holds your recovered identity</p>
              <p>• Download the .pn file and store it safely</p>
              <p>• Reconnect Google Drive to restore cloud-backed features</p>
              <p>• Shamir shares remain on your Drive vault; custodians hold credentials only</p>
            </div>
          </div>

          <div className="flex space-x-3">
            <button onClick={onClose} className="flex-1 px-4 py-2 modal-button rounded-md">
              Done
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
