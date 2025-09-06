import React from 'react';
import { UsagePattern } from '../utils/licenseVerification';

interface UsagePatternDetectionProps {
  usagePattern: UsagePattern | null;
  licenseInfo: any;
  onTestDetection: () => void;
  onTestEnforcement: () => void;
  onTestGracePeriod: () => void;
  onSimulateExpiration: () => void;
  onResetAll: () => void;
}

export const UsagePatternDetection: React.FC = ({ isOpen, onClose, settings, onSettingsChange }) => {
  usagePattern,
  licenseInfo,
  onTestDetection,
  onTestEnforcement,
  onTestGracePeriod,
  onSimulateExpiration,
  onResetAll
}) => {
  if (!usagePattern) return null;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded p-3">
      <h4 className="font-medium mb-3 text-white">Usage Pattern Detection</h4>
      <div className="text-sm text-gray-300 space-y-2">
        <div className="flex justify-between">
          <span>API Call Frequency (last hour):</span>
          <span className={usagePattern.apiCallFrequency > 100 ? 'text-red-400' : 'text-green-400'}>
            {usagePattern.apiCallFrequency} calls
          </span>
        </div>
        <div className="flex justify-between">
          <span>Enterprise Feature Access:</span>
          <span className={usagePattern.enterpriseFeatureAccess ? 'text-red-400' : 'text-green-400'}>
            {usagePattern.enterpriseFeatureAccess ? 'Detected' : 'None'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Scale Indicators:</span>
          <span className={usagePattern.scaleIndicators ? 'text-red-400' : 'text-green-400'}>
            {usagePattern.scaleIndicators ? 'Detected' : 'None'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Commercial Usage Detected:</span>
          <span className={usagePattern.isCommercial ? 'text-red-400 font-semibold' : 'text-green-400'}>
            {usagePattern.isCommercial ? 'YES - License Upgrade Required' : 'No'}
          </span>
        </div>
        {usagePattern.isCommercial && (
          <div className="flex justify-between">
            <span>Grace Period Status:</span>
            <span className={usagePattern.gracePeriodActive ? 'text-yellow-400' : 'text-red-400'}>
              {usagePattern.gracePeriodActive 
                ? `Active (${Math.ceil((usagePattern.gracePeriodExpires! - Date.now()) / (24 * 60 * 60 * 1000))} days left)`
                : 'Expired - Restrictions Active'
              }
            </span>
          </div>
        )}
      </div>
      {usagePattern.isCommercial && !licenseInfo?.isCommercial && (
        <div className="mt-3 p-2 bg-red-900/20 border border-red-700 rounded">
          <p className="text-red-400 text-xs">
            {usagePattern.gracePeriodActive 
              ? `Commercial usage detected. You have ${Math.ceil((usagePattern.gracePeriodExpires! - Date.now()) / (24 * 60 * 60 * 1000))} days remaining in your grace period to upgrade to a commercial license.`
              : 'Grace period expired. Please upgrade to a commercial license to continue using enterprise features.'
            }
          </p>
        </div>
      )}
      
      {/* Test Detection Mechanisms */}
      <div className="mt-3 pt-3 border-t border-gray-700">
        <h5 className="text-sm font-medium text-white mb-2">Test Detection & Enforcement</h5>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onTestDetection}
            className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-500"
          >
            Test Detection
          </button>
          <button
            onClick={onTestEnforcement}
            className="bg-purple-600 text-white px-3 py-1 rounded text-xs hover:bg-purple-500"
          >
            Test Enforcement
          </button>
          <button
            onClick={onTestGracePeriod}
            className="bg-yellow-600 text-white px-3 py-1 rounded text-xs hover:bg-yellow-500"
          >
            Test Grace Period
          </button>
          <button
            onClick={onSimulateExpiration}
            className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-500"
          >
            Simulate Expiration
          </button>
          <button
            onClick={onResetAll}
            className="bg-gray-600 text-white px-3 py-1 rounded text-xs hover:bg-gray-500"
          >
            Reset All
          </button>
        </div>
      </div>
    </div>
  );
};
