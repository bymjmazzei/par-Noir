import React, { useState, useEffect } from 'react';
import { Smartphone, Laptop, Tablet, Copy, CheckCircle, RefreshCw, QrCode } from 'lucide-react';

interface WebBasedSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncInitiated: (syncData: SyncData) => void;
}

interface SyncData {
  syncCode: string;
  syncUrl: string;
  expiresAt: string;
  deviceInfo: {
    name: string;
    type: 'mobile' | 'desktop' | 'tablet' | 'other';
  };
}

export const WebBasedSyncModal: React.FC<WebBasedSyncModalProps> = ({
  isOpen,
  onClose,
  onSyncInitiated
}) => {
  const [step, setStep] = useState<'device-selection' | 'sync-code' | 'qr-code'>('device-selection');
  const [selectedDevice, setSelectedDevice] = useState<{ name: string; type: 'mobile' | 'desktop' | 'tablet' | 'other' } | null>(null);
  const [syncCode, setSyncCode] = useState('');
  const [syncUrl, setSyncUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleDeviceSelect = (device: { name: string; type: 'mobile' | 'desktop' | 'tablet' | 'other' }) => {
    setSelectedDevice(device);
    generateSyncCode(device);
  };

  const generateSyncCode = async (device: { name: string; type: 'mobile' | 'desktop' | 'tablet' | 'other' }) => {
    try {
      setIsLoading(true);
      setError('');

      // Generate a unique sync code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const expiresIn = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      
      const syncData: SyncData = {
        syncCode: code,
        syncUrl: `${window.location.origin}/sync/${code}`,
        expiresAt: expiresIn.toISOString(),
        deviceInfo: device
      };

      setSyncCode(code);
      setSyncUrl(syncData.syncUrl);
      setExpiresAt(expiresIn.toLocaleString());
      
      // Store sync data for the receiving device
      localStorage.setItem(`sync-${code}`, JSON.stringify(syncData));
      
      setStep('sync-code');
      
    } catch (err) {
      setError('Failed to generate sync code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(syncCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('Failed to copy code. Please copy manually.');
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(syncUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('Failed to copy URL. Please copy manually.');
    }
  };

  const handleBack = () => {
    if (step === 'sync-code' || step === 'qr-code') {
      setStep('device-selection');
      setSelectedDevice(null);
      setSyncCode('');
      setSyncUrl('');
      setExpiresAt('');
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
            {step === 'device-selection' && 'Select Target Device'}
            {step === 'sync-code' && 'Sync Code Generated'}
            {step === 'qr-code' && 'QR Code'}
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
                  <div className="text-2xl">🌐</div>
                  <div>
                    <div className="font-medium text-text-primary">
                      Web-Based pN Transfer
                    </div>
                    <div className="text-sm text-text-secondary">
                      Works on any device with a web browser - no app required
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Device Selection */}
            <div className="space-y-3 mb-6">
              <button
                onClick={() => handleDeviceSelect({ name: 'iPhone', type: 'mobile' })}
                disabled={isLoading}
                className="w-full p-4 border border-border rounded-lg hover:bg-modal-bg transition-colors text-left disabled:opacity-50"
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
                disabled={isLoading}
                className="w-full p-4 border border-border rounded-lg hover:bg-modal-bg transition-colors text-left disabled:opacity-50"
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
                disabled={isLoading}
                className="w-full p-4 border border-border rounded-lg hover:bg-modal-bg transition-colors text-left disabled:opacity-50"
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
                disabled={isLoading}
                className="w-full p-4 border border-border rounded-lg hover:bg-modal-bg transition-colors text-left disabled:opacity-50"
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
                disabled={isLoading}
                className="w-full p-4 border border-border rounded-lg hover:bg-modal-bg transition-colors text-left disabled:opacity-50"
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

            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400">
                <strong>Advantage:</strong> Works on any device with a web browser. No app installation required!
              </p>
            </div>
          </>
        )}

        {step === 'sync-code' && selectedDevice && (
          <>
            <div className="mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
                <div className="flex items-center space-x-3">
                  {getDeviceIcon(selectedDevice.type)}
                  <div>
                    <div className="font-medium text-text-primary">
                      Sync Code for {selectedDevice.name}
                    </div>
                    <div className="text-sm text-text-secondary">
                      Share this code with the target device
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
                    onClick={handleCopyCode}
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
                    onClick={handleCopyUrl}
                    className="px-3 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="text-xs text-text-secondary">
                <p>• Code expires: {expiresAt}</p>
                <p>• Share via text, email, or any messaging app</p>
                <p>• Target device opens the link and enters the code</p>
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
                onClick={() => setStep('qr-code')}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium flex items-center justify-center space-x-2"
              >
                <QrCode className="w-4 h-4" />
                <span>Show QR Code</span>
              </button>
            </div>

            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-600 dark:text-blue-400">
                <strong>Instructions:</strong> Send this code to the target device. They can open any web browser and go to the link, then enter the code to receive your pN.
              </p>
            </div>
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
                      QR Code for Easy Access
                    </div>
                    <div className="text-sm text-text-secondary">
                      Scan this QR code with the target device
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* QR Code Placeholder */}
            <div className="flex justify-center mb-6">
              <div className="w-48 h-48 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <QrCode className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">QR Code: {syncCode}</p>
                  <p className="text-xs text-gray-400 mt-1">Scan to open sync link</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors font-medium"
              >
                Back to Code
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                Print QR Code
              </button>
            </div>
          </>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};
