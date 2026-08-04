/**
 * Biometric Passcode Modal
 * 
 * Prompts user for passcode after successful biometric authentication.
 * Biometric auth proves identity ownership, but passcode is still needed to decrypt.
 */

import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';

interface BiometricPasscodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (pnName: string, passcode: string) => void; // SECURITY: Require BOTH secrets
  identityName?: string;
  error?: string | null;
}

export const BiometricPasscodeModal: React.FC<BiometricPasscodeModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  identityName,
  error
}) => {
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [showPnName, setShowPnName] = useState(false);
  const [showPasscode, setShowPasscode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // SECURITY: Require BOTH pnName and passcode
    if (!pnName.trim() || !passcode.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(pnName, passcode);
      setPnName(''); // Clear pnName after submission
      setPasscode(''); // Clear passcode after submission
    } catch (err) {
      // Error handling is done by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setPnName('');
    setPasscode('');
    setShowPnName(false);
    setShowPasscode(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Lock className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-semibold text-text-primary">
              Enter Key 2
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-text-secondary mb-6">
          Biometric authentication successful! Please enter your Key 1 and Key 2 to decrypt your identity.
          {identityName && (
            <span className="block mt-2 font-medium text-text-primary">
              Identity: {identityName}
            </span>
          )}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* SECURITY: Require BOTH pnName and passcode - both are secrets */}
          <div>
            <label htmlFor="biometric-pnname" className="block text-sm font-medium text-text-primary mb-2">
              pN Name
            </label>
            <div className="relative">
              <input
                id="biometric-pnname"
                type={showPnName ? 'text' : 'password'}
                value={pnName}
                onChange={(e) => setPnName(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                placeholder="Enter Key 1"
                autoFocus
                required
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPnName(!showPnName)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                disabled={isSubmitting}
              >
                {showPnName ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="biometric-passcode" className="block text-sm font-medium text-text-primary mb-2">
              Passcode
            </label>
            <div className="relative">
              <input
                id="biometric-passcode"
                type={showPasscode ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                placeholder="Enter Key 2"
                autoFocus
                required
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPasscode(!showPasscode)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                disabled={isSubmitting}
              >
                {showPasscode ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-input-border rounded-md text-text-primary hover:bg-secondary transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!pnName.trim() || !passcode.trim() || isSubmitting}
              className="flex-1 px-4 py-2 bg-primary text-bg-primary rounded-md hover:bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Decrypting...' : 'Decrypt Identity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

