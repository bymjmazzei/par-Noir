/**
 * Biometric Passcode Modal
 * 
 * Prompts user for passcode after successful biometric authentication.
 * Biometric auth proves identity ownership, but passcode is still needed to decrypt.
 */

import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';
import { HostedShellLaunch } from '@par-noir/oauth-ui';

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
          <HostedShellLaunch op="session" onSession={() => undefined} />

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

