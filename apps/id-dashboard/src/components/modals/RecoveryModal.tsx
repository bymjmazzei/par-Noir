import React, { useRef, useState } from 'react';

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRecoveryMethod: 'pn' | 'key';
  setActiveRecoveryMethod: (method: 'pn' | 'key') => void;
  onInitiateRecoveryFromPn: (file: File, emailOrPhone: string) => void;
  onInitiateRecoveryWithKey: (
    recoveryKey: string,
    contactInfo: { contactValue?: string }
  ) => void;
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
  recoveryBlocked = false,
  recoveryBlockedMessage,
}: RecoveryModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [keyText, setKeyText] = useState('');
  const [keyContact, setKeyContact] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-semibold">Recover pN</h2>
          <button type="button" onClick={onClose} className="modal-close-button">
            ×
          </button>
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
            <div
              className={`font-medium ${activeRecoveryMethod === 'pn' ? 'text-bg-primary' : 'text-text-primary'}`}
            >
              Upload .pn file
            </div>
            <div
              className={`text-sm ${activeRecoveryMethod === 'pn' ? 'text-bg-primary' : 'text-text-secondary'}`}
            >
              File + recovery contact — custodians approve, then set a new passcode
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveRecoveryMethod('key')}
            className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
              activeRecoveryMethod === 'key'
                ? 'border-primary bg-primary text-bg-primary shadow-lg'
                : 'border-border bg-secondary text-text-primary hover:bg-hover'
            }`}
          >
            <div
              className={`font-medium ${activeRecoveryMethod === 'key' ? 'text-bg-primary' : 'text-text-primary'}`}
            >
              Use a recovery key
            </div>
            <div
              className={`text-sm ${activeRecoveryMethod === 'key' ? 'text-bg-primary' : 'text-text-secondary'}`}
            >
              Failsafe if you lost your .pn file or recovery contact
            </div>
          </button>
        </div>

        {activeRecoveryMethod === 'pn' && (
          <div className="mt-4 p-4 bg-secondary rounded-lg">
            {recoveryBlocked && (
              <div className="mb-4 p-3 border border-yellow-500 rounded text-sm text-yellow-700 bg-yellow-50">
                {recoveryBlockedMessage ||
                  'Recovery is not available for this identity until the owner configures a protected custodian.'}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (recoveryBlocked) return;
                const formData = new FormData(e.currentTarget);
                const file = fileInputRef.current?.files?.[0];
                if (!file) return;
                onInitiateRecoveryFromPn(file, formData.get('emailOrPhone') as string);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Your .pn identity file
                </label>
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
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Recovery contact (email or phone)
                </label>
                <input
                  name="emailOrPhone"
                  type="text"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
                  required
                />
              </div>
              <p className="text-xs text-text-secondary">
                Custodians approve with Shamir shares. After the threshold is met, set a new passcode on
                this device. Lost the file or contact? Use a recovery key instead.
              </p>
              <button
                type="submit"
                disabled={recoveryBlocked}
                className="w-full px-4 py-2 modal-button rounded-md font-medium disabled:opacity-50"
              >
                Start recovery
              </button>
            </form>
          </div>
        )}

        {activeRecoveryMethod === 'key' && (
          <div className="mt-4 p-4 bg-secondary rounded-lg">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const raw = keyText.trim();
                if (!raw) return;
                let recoveryKey = raw;
                try {
                  const parsed = JSON.parse(raw) as { recoveryKey?: string };
                  if (parsed?.recoveryKey) recoveryKey = parsed.recoveryKey;
                } catch {
                  /* plain key string */
                }
                onInitiateRecoveryWithKey(recoveryKey, {
                  contactValue: keyContact.trim() || undefined,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Recovery key
                </label>
                <textarea
                  value={keyText}
                  onChange={(e) => setKeyText(e.target.value)}
                  rows={4}
                  placeholder="Paste your recovery key or the downloaded failsafe JSON"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Contact (optional)
                </label>
                <input
                  type="text"
                  value={keyContact}
                  onChange={(e) => setKeyContact(e.target.value)}
                  placeholder="Email or phone if you still have it"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
                />
              </div>
              <p className="text-xs text-text-secondary">
                Starts custodian recovery without your passcode or pn name. Does not unlock by itself.
              </p>
              <button type="submit" className="w-full px-4 py-2 modal-button rounded-md font-medium">
                Start recovery with key
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
