import React, { useRef } from 'react';

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRecoveryMethod: 'pn' | 'legacy';
  setActiveRecoveryMethod: (method: 'pn' | 'legacy') => void;
  onInitiateRecoveryFromPn: (file: File, claimantName: string, emailOrPhone: string) => void;
  onInitiateRecoveryWithKey: (recoveryKey: string, contactInfo: {
    contactType: 'email' | 'phone';
    contactValue: string;
    claimantName: string;
  }) => void;
  hasLegacyRecoveryKey?: boolean;
  recoveryBlocked?: boolean;
  recoveryBlockedMessage?: string;
}

export function RecoveryModal({
  isOpen,
  onClose,
  activeRecoveryMethod,
  setActiveRecoveryMethod,
  onInitiateRecoveryFromPn,
  onInitiateRecoveryWithKey,
  hasLegacyRecoveryKey = false,
  recoveryBlocked = false,
  recoveryBlockedMessage,
}: RecoveryModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-semibold">Recover pN</h2>
          <button onClick={onClose} className="modal-close-button">×</button>
        </div>

        <div className="space-y-4 mb-6">
          <button
            type="button"
            onClick={() => setActiveRecoveryMethod('pn')}
            className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
              activeRecoveryMethod === 'pn'
                ? 'border-primary bg-primary text-bg-primary shadow-lg'
                : 'border-border bg-secondary text-text-primary hover:bg-hover'
            }`}
          >
            <div className={`font-medium ${activeRecoveryMethod === 'pn' ? 'text-bg-primary' : 'text-text-primary'}`}>Upload .pn file</div>
            <div className={`text-sm ${activeRecoveryMethod === 'pn' ? 'text-bg-primary' : 'text-text-secondary'}`}>
              Shamir custodian recovery — no passcode required to start
            </div>
          </button>

          {hasLegacyRecoveryKey && (
            <button
              type="button"
              onClick={() => setActiveRecoveryMethod('legacy')}
              className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
                activeRecoveryMethod === 'legacy'
                  ? 'border-primary bg-primary text-bg-primary shadow-lg'
                  : 'border-border bg-secondary text-text-primary hover:bg-hover'
              }`}
            >
              <div className={`font-medium ${activeRecoveryMethod === 'legacy' ? 'text-bg-primary' : 'text-text-primary'}`}>Legacy recovery key</div>
              <div className={`text-sm ${activeRecoveryMethod === 'legacy' ? 'text-bg-primary' : 'text-text-secondary'}`}>
                Pre-Shamir identities only
              </div>
            </button>
          )}
        </div>

        {activeRecoveryMethod === 'pn' && (
          <div className="mt-4 p-4 bg-secondary rounded-lg">
            {recoveryBlocked && (
              <div className="mb-4 p-3 border border-yellow-500 rounded text-sm text-yellow-700 bg-yellow-50">
                {recoveryBlockedMessage || 'Recovery is not available for this identity until the owner configures a protected custodian.'}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (recoveryBlocked) return;
                const formData = new FormData(e.currentTarget);
                const file = fileInputRef.current?.files?.[0];
                if (!file) return;
                onInitiateRecoveryFromPn(
                  file,
                  formData.get('claimantName') as string,
                  formData.get('emailOrPhone') as string
                );
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Your .pn identity file</label>
                <input
                  ref={fileInputRef}
                  name="pnFile"
                  type="file"
                  accept=".pn,application/json"
                  className="w-full text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Your name</label>
                <input
                  name="claimantName"
                  type="text"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Recovery contact (email or phone)</label>
                <input
                  name="emailOrPhone"
                  type="text"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
                  required
                />
              </div>
              <p className="text-xs text-text-secondary">
                Custodians will approve with Shamir shares. After threshold is met, set a new passcode on this device.
                Reconnect your storage provider (e.g. Google Drive or your social cloud) afterward; messaging keys stay the same.
              </p>
              <button type="submit" disabled={recoveryBlocked} className="w-full px-4 py-2 modal-button rounded-md font-medium disabled:opacity-50">
                Start recovery
              </button>
            </form>
          </div>
        )}

        {activeRecoveryMethod === 'legacy' && hasLegacyRecoveryKey && (
          <div className="mt-4 p-4 bg-secondary rounded-lg">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                onInitiateRecoveryWithKey(formData.get('recoveryKey') as string, {
                  contactType: formData.get('contactType') as 'email' | 'phone',
                  contactValue: formData.get('contactValue') as string,
                  claimantName: formData.get('claimantName') as string
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Recovery key</label>
                <textarea name="recoveryKey" rows={3} className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md" required />
              </div>
              <button type="submit" className="w-full px-4 py-2 modal-button rounded-md font-medium">
                Submit legacy recovery request
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
