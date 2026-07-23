import React from 'react';

interface RecoveryKeyInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  recoveryKeyInput: string;
  setRecoveryKeyInput: (input: string) => void;
  recoveryKeyContactInfo: {
    claimantName: string;
    contactType: 'email' | 'phone';
    contactValue: string;
  };
  setRecoveryKeyContactInfo: React.Dispatch<React.SetStateAction<{
    claimantName: string;
    contactType: 'email' | 'phone';
    contactValue: string;
  }>>;
  onInitiateRecoveryWithKey: (recoveryKey: string, contactInfo: {
    contactType: 'email' | 'phone';
    contactValue: string;
    claimantName: string;
  }) => void;
}

export function RecoveryKeyInputModal({
  isOpen,
  onClose,
  recoveryKeyInput,
  setRecoveryKeyInput,
  recoveryKeyContactInfo,
  setRecoveryKeyContactInfo,
  onInitiateRecoveryWithKey
}: RecoveryKeyInputModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-semibold">Recover with Key</h2>
          <button
            onClick={onClose}
            className="modal-close-button"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Recovery Key
            </label>
            <textarea
              value={recoveryKeyInput}
              onChange={(e) => setRecoveryKeyInput(e.target.value)}
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Paste your recovery key here"
              rows={4}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Your Name
            </label>
            <input
              type="text"
              value={recoveryKeyContactInfo.claimantName}
              onChange={(e) => setRecoveryKeyContactInfo(prev => ({
                ...prev,
                claimantName: e.target.value
              }))}
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter your full name"
              required
            />
            <p className="text-xs text-text-secondary mt-1">
              This is who will be claiming the identity
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Contact Type
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="contactType"
                  value="email"
                  checked={recoveryKeyContactInfo.contactType === 'email'}
                  onChange={(e) => setRecoveryKeyContactInfo(prev => ({
                    ...prev,
                    contactType: e.target.value as 'email' | 'phone'
                  }))}
                  className="mr-2"
                />
                <span className="text-sm text-text-primary">Email</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="contactType"
                  value="phone"
                  checked={recoveryKeyContactInfo.contactType === 'phone'}
                  onChange={(e) => setRecoveryKeyContactInfo(prev => ({
                    ...prev,
                    contactType: e.target.value as 'email' | 'phone'
                  }))}
                  className="mr-2"
                />
                <span className="text-sm text-text-primary">Phone</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Contact Value
            </label>
            <input
              type="text"
              value={recoveryKeyContactInfo.contactValue}
              onChange={(e) => setRecoveryKeyContactInfo(prev => ({
                ...prev,
                contactValue: e.target.value
              }))}
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter your email or phone number"
              required
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => {
                onInitiateRecoveryWithKey(recoveryKeyInput, {
                  contactType: recoveryKeyContactInfo.contactType,
                  contactValue: recoveryKeyContactInfo.contactValue,
                  claimantName: recoveryKeyContactInfo.claimantName,
                });
                onClose();
              }}
              className="flex-1 px-4 py-2 modal-button rounded-md"
            >
              Submit Recovery Request
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 modal-button rounded-md"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
