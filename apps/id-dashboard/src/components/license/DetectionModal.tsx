import React from 'react';
import { UsagePattern } from '../utils/licenseVerification';

interface DetectionModalProps {
  isOpen: boolean;
  usagePattern: UsagePattern | null;
  onClose: () => void;
  onUpgrade: () => void;
}

export const DetectionModal: React.FC = ({ isOpen, onClose, settings, onSettingsChange }) => {
  isOpen,
  usagePattern,
  onClose,
  onUpgrade
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-xl font-semibold mb-4 text-white">Commercial Usage Detected</h3>
        <p className="text-gray-300 mb-4">
          Our system has detected commercial usage patterns in your activity. You have a 3-day grace period to upgrade to a commercial license before restrictions are applied.
        </p>
        <div className="text-sm text-gray-400 mb-4">
          <p><strong>Detected Patterns:</strong></p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            {usagePattern?.apiCallFrequency && usagePattern.apiCallFrequency > 100 && (
              <li>High API call frequency ({usagePattern.apiCallFrequency} calls/hour)</li>
            )}
            {usagePattern?.enterpriseFeatureAccess && (
              <li>Enterprise feature access detected</li>
            )}
            {usagePattern?.scaleIndicators && (
              <li>Scale indicators detected (multi-user, integrations, white-label, etc.)</li>
            )}
          </ul>
          {usagePattern?.gracePeriodActive && (
            <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-700 rounded">
              <p className="text-yellow-400 text-xs">
                <strong>Grace Period Active:</strong> You have {Math.ceil((usagePattern.gracePeriodExpires! - Date.now()) / (24 * 60 * 60 * 1000))} days remaining to upgrade your license.
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            Dismiss
          </button>
          <button
            onClick={onUpgrade}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500"
          >
            Upgrade License
          </button>
        </div>
      </div>
    </div>
  );
};
