import React, { useState, useEffect } from 'react';
import { Lock, User, Smartphone, CheckCircle } from 'lucide-react';
import { BiometricAuth } from '../utils/biometric';

interface BiometricSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  identityId: string;
  username: string;
}

export const BiometricSetup: React.FC<BiometricSetupProps> = ({
  isOpen,
  onClose,
  onSuccess,
  identityId,
  username
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'check' | 'setup' | 'success'>('check');
  const [biometricInfo, setBiometricInfo] = useState<{
    available: boolean;
    deviceName: string;
    supportedFeatures: string[];
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      checkBiometricAvailability();
    }
  }, [isOpen]);

  const checkBiometricAvailability = async () => {
    try {
      setIsLoading(true);
      const info = await BiometricAuth.getCapabilityInfo();
      setBiometricInfo(info);
      
      if (info.available) {
        setStep('setup');
      } else {
        setError('Biometric authentication is not available on this device');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to check biometric availability');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupBiometric = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const credential = await BiometricAuth.registerCredential(identityId, username);
      
      if (credential) {
        setStep('success');
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
      } else {
        throw new Error('Failed to set up biometric authentication');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to set up biometric authentication');
    } finally {
      setIsLoading(false);
    }
  };

  const getBiometricIcon = () => {
    if (!biometricInfo) return <Lock className="w-4 h-4" />;
    
    const deviceName = biometricInfo.deviceName.toLowerCase();
    if (deviceName.includes('iphone') || deviceName.includes('ipad')) {
      return <Smartphone className="w-4 h-4" />; // Touch ID or Face ID
    } else if (deviceName.includes('android')) {
      return <Smartphone className="w-4 h-4" />; // Fingerprint
    } else if (deviceName.includes('mac')) {
      return <Smartphone className="w-4 h-4" />; // Touch ID
    } else if (deviceName.includes('windows')) {
              return <User className="w-4 h-4" />; // Windows Hello
    }
            return <Lock className="w-4 h-4" />;
  };

  const getBiometricName = () => {
    if (!biometricInfo) return 'Biometric Authentication';
    
    const deviceName = biometricInfo.deviceName.toLowerCase();
    if (deviceName.includes('iphone') || deviceName.includes('ipad')) {
      return 'Touch ID / Face ID';
    } else if (deviceName.includes('android')) {
      return 'Fingerprint / Face Unlock';
    } else if (deviceName.includes('mac')) {
      return 'Touch ID';
    } else if (deviceName.includes('windows')) {
      return 'Windows Hello';
    }
    return 'Biometric Authentication';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Set Up Biometric Unlock</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        {step === 'check' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-text-secondary">Checking biometric availability...</p>
          </div>
        )}

        {step === 'setup' && biometricInfo && (
          <div className="space-y-6">
            {/* Biometric Info */}
            <div className="text-center">
              <div className="flex justify-center mb-4">
                {getBiometricIcon()}
              </div>
              <h3 className="text-lg font-semibold mb-2">{getBiometricName()}</h3>
              <p className="text-text-secondary text-sm">
                Use your device&apos;s built-in biometric authentication to unlock your identity quickly and securely.
              </p>
            </div>

            {/* Device Info */}
            <div className="bg-secondary rounded-lg p-4">
              <h4 className="font-medium mb-2">Device Information</h4>
              <div className="text-sm text-text-secondary space-y-1">
                <div>Device: {biometricInfo.deviceName}</div>
                <div>Features: {biometricInfo.supportedFeatures.join(', ')}</div>
              </div>
            </div>

            {/* Security Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <Lock className="w-4 h-4 text-blue-600 mt-0.5" />
                <div className="text-blue-800 text-sm">
                  <div className="font-medium mb-1">Secure & Private</div>
                  <div>
                    Your biometric data never leaves your device. We only store a cryptographic key that works with your biometric authentication.
                  </div>
                </div>
              </div>
            </div>

            {/* Setup Button */}
            <button
              onClick={handleSetupBiometric}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isLoading ? 'Setting up...' : `Set Up ${getBiometricName()}`}
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-8">
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Biometric Unlock Enabled!</h3>
            <p className="text-text-secondary">
              You can now unlock your identity using {getBiometricName()}.
            </p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <span className="text-red-600 mt-0.5">⚠️</span>
              <div className="text-red-800 text-sm">
                <div className="font-medium mb-1">Setup Failed</div>
                <div>{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Not Available */}
        {biometricInfo && !biometricInfo.available && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">❌</div>
            <h3 className="text-lg font-semibold mb-2">Not Available</h3>
            <p className="text-text-secondary text-sm mb-4">
              Biometric authentication is not available on this device or browser.
            </p>
            <div className="bg-secondary rounded-lg p-4 text-sm text-text-secondary">
              <div className="font-medium mb-2">Requirements:</div>
              <ul className="list-disc list-inside space-y-1">
                <li>Device with biometric sensor (fingerprint, face recognition)</li>
                <li>Modern browser with WebAuthn support</li>
                <li>HTTPS connection (required for security)</li>
              </ul>
            </div>
          </div>
        )}

        {/* Close Button */}
        {(error || (biometricInfo && !biometricInfo.available)) && (
          <div className="mt-6">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-secondary transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};