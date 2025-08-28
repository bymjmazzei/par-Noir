import React, { useState } from 'react';
import { Smartphone, Laptop, Tablet, QrCode, Copy, CheckCircle } from 'lucide-react';

interface DeviceSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncInitiated: (syncData: SyncData) => void;
}

interface SyncData {
  deviceType: string;
  pnName: string;
  passcode: string;
  syncCode: string;
  syncUrl: string;
}

export const DeviceSyncModal: React.FC<DeviceSyncModalProps> = ({
  isOpen,
  onClose,
  onSyncInitiated
}) => {
  const [step, setStep] = useState<'device-selection' | 'verification' | 'qr-code'>('device-selection');
  const [selectedDevice, setSelectedDevice] = useState<{ name: string; type: 'mobile' | 'desktop' | 'tablet' | 'other' } | null>(null);
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [syncCode, setSyncCode] = useState('');
  const [syncUrl, setSyncUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleDeviceSelect = (device: { name: string; type: 'mobile' | 'desktop' | 'tablet' | 'other' }) => {
    setSelectedDevice(device);
    setStep('verification');
  };

  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pnName || !passcode) {
      setError('Please enter both pN Name and passcode');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      // Generate sync code and URL
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const url = `${window.location.origin}/sync/${code}`;
      
      setSyncCode(code);
      setSyncUrl(url);
      setStep('qr-code');
      
    } catch (err) {
      setError('Failed to generate sync code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(syncUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('Failed to copy link. Please copy manually.');
    }
  };

  const handleBack = () => {
    if (step === 'verification') {
      setStep('device-selection');
      setSelectedDevice(null);
      setPnName('');
      setPasscode('');
      setError('');
    } else if (step === 'qr-code') {
      setStep('verification');
      setSyncCode('');
      setSyncUrl('');
      setError('');
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile':
        return <Smartphone className="w-6 h-6" />;
      case 'desktop':
        return <Laptop className="w-6 h-6" />;
      case 'tablet':
        return <Tablet className="w-6 h-6" />;
      default:
        return <Smartphone className="w-6 h-6" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            {step === 'device-selection' && 'Select Device'}
            {step === 'verification' && 'Verify pN'}
            {step === 'qr-code' && 'Sync Code'}
          </h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors font-medium"
          >
            Cancel
          </button>
        </div>

        {step === 'device-selection' && (
          <>
            <div className="mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">📱</div>
                  <div>
                    <div className="font-medium text-text-primary">
                      Sync pN to Another Device
                    </div>
                    <div className="text-sm text-text-secondary">
                      Select the device you want to sync to
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Device Selection */}
            <div className="space-y-3 mb-6">
              <button
                onClick={() => handleDeviceSelect({ name: 'iPhone', type: 'mobile' })}
                className="w-full p-4 border border-border rounded-lg hover:bg-modal-bg transition-colors text-left"
              >
                <div className="flex items-center space-x-3">
                  <Smartphone className="w-6 h-6 text-text-secondary" />
                  <div>
                    <div className="font-medium text-text-primary">iPhone</div>
                    <div className="text-sm text-text-secondary">Mobile device</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleDeviceSelect({ name: 'Android Phone', type: 'mobile' })}
                className="w-full p-4 border border-border rounded-lg hover:bg-modal-bg transition-colors text-left"
              >
                <div className="flex items-center space-x-3">
                  <Smartphone className="w-6 h-6 text-text-secondary" />
                  <div>
                    <div className="font-medium text-text-primary">Android Phone</div>
                    <div className="text-sm text-text-secondary">Mobile device</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleDeviceSelect({ name: 'MacBook', type: 'desktop' })}
                className="w-full p-4 border border-border rounded-lg hover:bg-modal-bg transition-colors text-left"
              >
                <div className="flex items-center space-x-3">
                  <Laptop className="w-6 h-6 text-text-secondary" />
                  <div>
                    <div className="font-medium text-text-primary">MacBook</div>
                    <div className="text-sm text-text-secondary">Desktop computer</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleDeviceSelect({ name: 'Windows PC', type: 'desktop' })}
                className="w-full p-4 border border-border rounded-lg hover:bg-modal-bg transition-colors text-left"
              >
                <div className="flex items-center space-x-3">
                  <Laptop className="w-6 h-6 text-text-secondary" />
                  <div>
                    <div className="font-medium text-text-primary">Windows PC</div>
                    <div className="text-sm text-text-secondary">Desktop computer</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleDeviceSelect({ name: 'iPad', type: 'tablet' })}
                className="w-full p-4 border border-border rounded-lg hover:bg-modal-bg transition-colors text-left"
              >
                <div className="flex items-center space-x-3">
                  <Tablet className="w-6 h-6 text-text-secondary" />
                  <div>
                    <div className="font-medium text-text-primary">iPad</div>
                    <div className="text-sm text-text-secondary">Tablet device</div>
                  </div>
                </div>
              </button>
            </div>
          </>
        )}

        {step === 'verification' && selectedDevice && (
          <>
            <div className="mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
                <div className="flex items-center space-x-3">
                  {getDeviceIcon(selectedDevice.type)}
                  <div>
                    <div className="font-medium text-text-primary">
                      Sync to {selectedDevice.name}
                    </div>
                    <div className="text-sm text-text-secondary">
                      Enter your pN credentials to verify and generate sync code
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Verification Form */}
            <form onSubmit={handleVerification} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  pN Name
                </label>
                <input
                  type="text"
                  value={pnName}
                  onChange={(e) => setPnName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter your pN Name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Passcode
                </label>
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter your passcode"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors font-medium disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  <QrCode className="w-4 h-4" />
                  <span>{isLoading ? 'Generating...' : 'Generate Sync Code'}</span>
                </button>
              </div>
            </form>
          </>
        )}

        {step === 'qr-code' && (
          <>
            <div className="mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
                <div className="flex items-center space-x-3">
                  <QrCode className="w-6 h-6" />
                  <div>
                    <div className="font-medium text-text-primary">
                      Sync Code Generated
                    </div>
                    <div className="text-sm text-text-secondary">
                      Share this with the target device
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sync Code Display */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Sync Code
                </label>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg font-mono text-lg text-center">
                    {syncCode}
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className="px-3 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Direct Link
                </label>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm break-all">
                    {syncUrl}
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className="px-3 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="text-xs text-text-secondary">
                <p>• Share the code or link with the target device</p>
                <p>• They scan QR code or go to the link</p>
                <p>• Enter their pN/passcode to confirm</p>
                <p>• File transfers from this device to theirs</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors font-medium"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  // Store sync data for the receiving device
                  const syncData = {
                    deviceType: selectedDevice?.type,
                    pnName,
                    passcode,
                    syncCode,
                    syncUrl
                  };
                  onSyncInitiated(syncData);
                  onClose();
                }}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
