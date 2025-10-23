import React from 'react';

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRecoveryMethod: 'key' | 'factor';
  setActiveRecoveryMethod: (method: 'key' | 'factor') => void;
  onInitiateRecoveryWithKey: (recoveryKey: string, contactInfo: {
    contactType: 'email' | 'phone';
    contactValue: string;
    claimantName: string;
  }) => void;
  onInitiateRecovery: (recoveryData: {
    pnName: string;
    passcode: string;
    nickname: string;
    emailOrPhone: string;
  }) => void;
}

export function RecoveryModal({
  isOpen,
  onClose,
  activeRecoveryMethod,
  setActiveRecoveryMethod,
  onInitiateRecoveryWithKey,
  onInitiateRecovery
}: RecoveryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-semibold">Recover pN</h2>
          <button 
            onClick={onClose}
            className="modal-close-button"
          >
            ×
          </button>
        </div>

        {/* Recovery Method Selection */}
        <div className="space-y-4 mb-6">
          <button
            type="button"
            onClick={() => setActiveRecoveryMethod('key')}
            className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
              activeRecoveryMethod === 'key'
                ? 'border-primary bg-primary text-bg-primary shadow-lg'
                : 'border-border bg-secondary text-text-primary hover:bg-hover'
            }`}
          >
            <div className={`font-medium ${activeRecoveryMethod === 'key' ? 'text-bg-primary' : 'text-text-primary'}`}>Use Recovery Key</div>
            <div className={`text-sm ${activeRecoveryMethod === 'key' ? 'text-bg-primary' : 'text-text-secondary'}`}>I have a recovery key</div>
          </button>
          
          <button
            type="button"
            onClick={() => setActiveRecoveryMethod('factor')}
            className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
              activeRecoveryMethod === 'factor'
                ? 'border-primary bg-primary text-bg-primary shadow-lg'
                : 'border-border bg-secondary text-text-primary hover:bg-hover'
            }`}
          >
            <div className={`font-medium ${activeRecoveryMethod === 'factor' ? 'text-bg-primary' : 'text-text-primary'}`}>4-Factor Verification</div>
            <div className={`text-sm ${activeRecoveryMethod === 'factor' ? 'text-bg-primary' : 'text-text-secondary'}`}>Use pnName, passcode, nickname, and contact</div>
          </button>
        </div>

        {/* Recovery Key Form */}
        {activeRecoveryMethod === 'key' && (
          <div className="mt-4 p-4 bg-secondary rounded-lg">
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              onInitiateRecoveryWithKey(
                formData.get('recoveryKey') as string,
                {
                  contactType: formData.get('contactType') as 'email' | 'phone',
                  contactValue: formData.get('contactValue') as string,
                  claimantName: formData.get('claimantName') as string,
                }
              );
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Recovery Key
                </label>
                <textarea
                  name="recoveryKey"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Paste your recovery key here"
                  rows={3}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Your Name
                </label>
                <input
                  name="claimantName"
                  type="text"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter your full name"
                  required
                />
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
                      defaultChecked
                      className="mr-2"
                    />
                    <span className="text-sm text-text-primary">Email</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="contactType"
                      value="phone"
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
                  name="contactValue"
                  type="text"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter your email or phone number"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full px-4 py-2 modal-button rounded-md font-medium"
              >
                Submit Recovery Request
              </button>
            </form>
          </div>
        )}

        {/* 4-Factor Form */}
        {activeRecoveryMethod === 'factor' && (
          <div className="mt-4 p-4 bg-secondary rounded-lg">
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              onInitiateRecovery({
                pnName: formData.get('pnName') as string,
                passcode: formData.get('passcode') as string,
                nickname: formData.get('nickname') as string,
                emailOrPhone: formData.get('emailOrPhone') as string,
              });
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  pN Name
                </label>
                <input
                  name="pnName"
                  type="text"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter your pN Name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Passcode
                </label>
                <input
                  name="passcode"
                  type="password"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter your passcode"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Nickname
                </label>
                <input
                  name="nickname"
                  type="text"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter your nickname"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Recovery Contact
                </label>
                <input
                  name="emailOrPhone"
                  type="text"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter your email or phone number"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full px-4 py-2 modal-button rounded-md font-medium"
              >
                Submit Recovery Request
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
