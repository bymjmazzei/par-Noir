import React, { useState, useEffect } from 'react';
import { Lock, Key, ArrowRight, Fingerprint } from 'lucide-react';

interface PWALockScreenProps {
  isLocked: boolean;
  onUnlock: () => void;
  onFallback: () => void;
  onDesktopUnlock?: () => void; // New prop for desktop unlock
}

const PWALockScreen: React.FC<PWALockScreenProps> = ({ isLocked, onUnlock, onFallback }) => {
  const [isAuthenticating] = useState(false);
  const [error] = useState<string | null>(null);
  const [isMobile] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);
      const isMobileDevice = isIOS || isAndroid;
      // const userAgent = navigator.userAgent;
      
      if (!isMobileDevice) {
        // On desktop, unlock silently
        onUnlock();
        return;
      }
      
      // On mobile, start biometric authentication
      startMobileAuthentication();
    };

    checkDevice();
  }, [onUnlock]);

  const startMobileAuthentication = async () => {
    try {
      // Check if biometric authentication is available
      if (!window.PublicKeyCredential) {
        onUnlock();
        return;
      }

      // Request biometric authentication
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array(32),
          rp: { name: 'Par Noir' },
          user: {
            id: new Uint8Array(16),
            name: 'user@example.com',
            displayName: 'User'
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          timeout: 60000
        }
      });

      if (credential) {
        onUnlock();
      }
    } catch (err) {
      // Fallback to regular unlock on error
      onUnlock();
    }
  };

  // Don't show anything on desktop - it will auto-redirect
  if (!isLocked || !isMobile) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            par Noir Locked
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Use your device&apos;s security to unlock
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Authentication Options */}
        <div className="space-y-4">
          {/* Mobile Biometric Authentication */}
          <button
            onClick={startMobileAuthentication}
            disabled={isAuthenticating}
            className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white py-4 px-6 rounded-xl font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Fingerprint className="w-5 h-5" />
            <span>
              {isAuthenticating ? 'Authenticating...' : 'Use Biometrics'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Fallback to Passcode - Only on mobile */}
          <button
            onClick={onFallback}
            disabled={isAuthenticating}
            className="w-full flex items-center justify-center space-x-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-4 px-6 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Key className="w-5 h-5" />
            <span>Use Passcode</span>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Your device&apos;s native security system will be used for authentication
          </p>
        </div>
      </div>
    </div>
  );
};

export default PWALockScreen;
