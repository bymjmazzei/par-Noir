import React, { useState } from 'react';
import { Smartphone, Laptop, Tablet, CheckCircle, XCircle } from 'lucide-react';

interface SyncRequest {
  fromDevice: {
    id: string;
    name: string;
    type: 'mobile' | 'desktop' | 'tablet' | 'other';
  };
  identityName: string;
  timestamp: string;
}

interface SyncRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAcceptSync: (pnName: string, passcode: string) => void;
  syncRequest: SyncRequest | null;
}

export const SyncRequestModal: React.FC<SyncRequestModalProps> = ({
  isOpen,
  onClose,
  onAcceptSync,
  syncRequest
}) => {
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAcceptSync = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pnName || !passcode) {
      setError('Please enter both pN Name and passcode');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      await onAcceptSync(pnName, passcode);
    } catch (err) {
      setError('Failed to accept sync request');
    } finally {
      setIsLoading(false);
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

  if (!isOpen || !syncRequest) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">pN Transfer Request</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        {/* Sync Request Info */}
        <div className="mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
            <div className="flex items-center space-x-3">
              <div className="text-2xl">📱</div>
              <div>
                <div className="font-medium text-text-primary">
                  pN Transfer Request from {syncRequest.fromDevice.name}
                </div>
                <div className="text-sm text-text-secondary">
                  {syncRequest.identityName} wants to transfer pN file to this device
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-3">
              {getDeviceIcon(syncRequest.fromDevice.type)}
              <div>
                <div className="font-medium text-text-primary">
                  {syncRequest.fromDevice.name}
                </div>
                <div className="text-sm text-text-secondary capitalize">
                  {syncRequest.fromDevice.type}
                </div>
              </div>
            </div>
            <div className="text-sm text-text-secondary">
              Requested at: {new Date(syncRequest.timestamp).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Authentication Form */}
        <form onSubmit={handleAcceptSync} className="space-y-4">
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
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isLoading ? 'Accepting...' : 'Accept Transfer'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              <XCircle className="w-4 h-4" />
              <span>Decline</span>
            </button>
          </div>
        </form>

        <div className="mt-4 text-xs text-text-secondary space-y-1">
          <p>• This will transfer the pN file to this device</p>
          <p>• Your passcode is required for security verification</p>
          <p>• You'll be able to unlock and access the pN dashboard</p>
          <p>• The device will be added to your synced devices list</p>
        </div>
      </div>
    </div>
  );
};
