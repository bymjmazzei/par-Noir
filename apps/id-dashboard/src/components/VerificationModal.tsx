import React, { useState, useEffect } from 'react';
import { verificationService, VerificationRequest } from '../utils/verificationService';

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataPointId: string;
  dataPointName: string;
  verificationType: 'email' | 'phone' | 'location';
  target: string; // email address, phone number, or device identifier
  identityId: string;
  onVerificationComplete: (success: boolean, verifiedData: any) => void;
}

export const VerificationModal: React.FC<VerificationModalProps> = ({
  isOpen,
  onClose,
  dataPointId,
  dataPointName,
  verificationType,
  target,
  identityId,
  onVerificationComplete
}) => {
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [remainingAttempts, setRemainingAttempts] = useState(3);

  useEffect(() => {
    if (isOpen) {
      setStep('request');
      setVerificationCode('');
      setLoading(false);
      setMessage('');
      setError('');
      setRemainingAttempts(3);
    }
  }, [isOpen]);

  const handleRequestVerification = async () => {
    setLoading(true);
    setError('');

    try {
      const request: VerificationRequest = {
        type: verificationType,
        target,
        dataPointId,
        identityId
      };

      const result = await verificationService.requestVerification(request);

      if (result.success) {
        setMessage(result.message);
        setStep('verify');
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Failed to request verification. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      setError('Please enter the verification code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await verificationService.verifyCode(
        verificationType,
        target,
        dataPointId,
        identityId,
        verificationCode.trim()
      );

      if (result.success && result.verified) {
        setMessage('Verification successful!');
        setTimeout(() => {
          onVerificationComplete(true, {
            type: verificationType,
            target,
            verifiedAt: result.verifiedAt,
            dataPointId
          });
          onClose();
        }, 1500);
      } else {
        setError(result.message);
        setRemainingAttempts(verificationService.getRemainingAttempts(
          verificationType,
          target,
          dataPointId,
          identityId
        ));
      }
    } catch (err) {
      setError('Failed to verify code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setStep('request');
    setVerificationCode('');
    setError('');
    setMessage('');
    setRemainingAttempts(3);
  };

  const getVerificationTypeLabel = () => {
    switch (verificationType) {
      case 'email': return 'Email';
      case 'phone': return 'Phone';
      case 'location': return 'Location';
      default: return 'Unknown';
    }
  };

  const getTargetDisplay = () => {
    if (verificationType === 'location') {
      return 'your device';
    }
    return target;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg max-w-md w-full border border-modal-border shadow-2xl">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-text-primary">
              Verify {dataPointName}
            </h2>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary"
              disabled={loading}
            >
              ✕
            </button>
          </div>

          {/* Content */}
          {step === 'request' && (
            <div>
              <p className="text-text-secondary text-sm mb-6">
                We'll send a verification code to {getTargetDisplay()} to verify your {dataPointName.toLowerCase()}.
              </p>

              <div className="bg-secondary rounded-lg p-4 mb-6">
                <div className="text-sm text-text-primary mb-2">
                  <strong>Verification Type:</strong> {getVerificationTypeLabel()}
                </div>
                <div className="text-sm text-text-secondary">
                  <strong>Target:</strong> {getTargetDisplay()}
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                  <p className="text-red-500 text-sm">{error}</p>
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 text-text-secondary border border-border rounded-md hover:bg-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRequestVerification}
                  disabled={loading}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/80 disabled:opacity-50 font-medium transition-colors border border-primary"
                >
                  {loading ? 'Sending...' : 'Send Verification Code'}
                </button>
              </div>
            </div>
          )}

          {step === 'verify' && (
            <div>
              <p className="text-text-secondary text-sm mb-6">
                Enter the verification code sent to {getTargetDisplay()}.
              </p>

              {message && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-4">
                  <p className="text-green-500 text-sm">{message}</p>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Verification Code *
                </label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="w-full px-3 py-2 border border-input-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-input-bg text-text-primary placeholder-text-secondary"
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  disabled={loading}
                />
                <p className="text-xs text-text-secondary mt-1">
                  {remainingAttempts} attempts remaining
                </p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                  <p className="text-red-500 text-sm">{error}</p>
                </div>
              )}

              <div className="flex justify-between items-center">
                <button
                  onClick={handleResendCode}
                  disabled={loading}
                  className="text-primary hover:text-primary/80 text-sm font-medium"
                >
                  Resend Code
                </button>
                <div className="flex space-x-3">
                  <button
                    onClick={onClose}
                    disabled={loading}
                    className="px-4 py-2 text-text-secondary border border-border rounded-md hover:bg-secondary disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleVerifyCode}
                    disabled={loading || !verificationCode.trim()}
                    className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/80 disabled:opacity-50 font-medium transition-colors border border-primary"
                  >
                    {loading ? 'Verifying...' : 'Verify Code'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
