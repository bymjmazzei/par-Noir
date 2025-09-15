import { cryptoWorkerManager } from '../utils/cryptoWorkerManager';
import React from 'react';
import { Info, CheckCircle } from 'lucide-react';

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: () => void;
  infoContent: string;
  isCompleted?: boolean;
}

interface WizardStepContentProps {
  currentStepData: WizardStep;
  showInfo: boolean;
  nickname: string;
  onNicknameChange: (nickname: string) => void;
  onStepAction: () => void;
  completedSteps: Set<string>;
}

export const WizardStepContent: React.FC = ({ isOpen, onClose, settings, onSettingsChange }) => {
  currentStepData,
  showInfo,
  nickname,
  onNicknameChange,
  onStepAction,
  completedSteps
}) => {
  if (showInfo) {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-700 dark:text-text-primary whitespace-pre-line">
            {currentStepData.infoContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-gray-700 dark:text-text-primary leading-relaxed">
        {currentStepData.description}
      </p>

      {/* Step-specific content */}
      {currentStepData.id === 'nickname' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 dark:text-text-primary mb-2">
              Identity Nickname
            </label>
            <input
              type="text"
              id="nickname"
              value={nickname}
              onChange={(e) => onNicknameChange(e.target.value)}
              placeholder="Enter a friendly nickname for this identity"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-primary focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-text-primary placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>
          <button
            onClick={onStepAction}
            disabled={!nickname.trim()}
            className="w-full bg-blue-600 dark:bg-primary text-white py-2 px-4 rounded-md hover:bg-blue-700 dark:hover:bg-primary-dark disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            Set Nickname
          </button>
        </div>
      )}

      {currentStepData.id === 'custodians' && (
        <div className="space-y-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
            <p className="text-sm text-red-800 dark:text-red-300">
              <strong>🚨 CRITICAL:</strong> Without custodians, you could permanently lose your identity if you lose your device or forget your passcode. 
              You need at least 2 custodians to create your identity.
            </p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <strong>Remember:</strong> This is not like a regular account. There is no "forgot password" or customer support to help you recover your identity.
            </p>
          </div>
          <button
            onClick={onStepAction}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition-colors font-semibold"
          >
            Set Up Custodians (Required)
          </button>
        </div>
      )}

      {currentStepData.id === 'export-id' && (
        <div className="space-y-4">
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
            <p className="text-sm text-orange-800 dark:text-orange-300">
              <strong>💾 ESSENTIAL BACKUP:</strong> This creates an encrypted JSON file that you can use to restore your identity on other devices. 
              Store this file safely - it's your backup if you lose your device.
            </p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>File format:</strong> Your backup will be saved as "your-nickname-backup.json" and can be imported on any device using the "Import Identity" feature.
            </p>
          </div>
          <button
            onClick={onStepAction}
            className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 transition-colors font-semibold"
          >
            Export Identity File (Recommended)
          </button>
        </div>
      )}

      {currentStepData.id === 'recovery-key' && (
        <div className="space-y-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
            <p className="text-sm text-red-800 dark:text-red-300">
              <strong>Additional security:</strong> A recovery key provi another way to recover your identity if needed.
            </p>
          </div>
          <button
            onClick={onStepAction}
            className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors"
          >
            Generate Recovery Key
          </button>
        </div>
      )}

      {currentStepData.id === 'devices' && (
        <div className="space-y-4">
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
            <p className="text-sm text-indigo-800 dark:text-indigo-300">
              <strong>Multi-device access:</strong> Learn how to securely sync your identity across multiple devices using QR co.
            </p>
          </div>
          <button
            onClick={onStepAction}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
          >
            Go to Device Settings
          </button>
        </div>
      )}

      {currentStepData.id === 'privacy' && (
        <div className="space-y-4">
          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
            <p className="text-sm text-teal-800 dark:text-teal-300">
              <strong>Privacy control:</strong> Configure how your identity data is shared and protected across different services.
            </p>
          </div>
          <button
            onClick={onStepAction}
            className="w-full bg-teal-600 text-white py-2 px-4 rounded-md hover:bg-teal-700 transition-colors"
          >
            Go to Privacy Settings
          </button>
        </div>
      )}

      {currentStepData.id === 'complete' && (
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-gray-700 dark:text-text-primary">
            You've successfully completed the setup! Your identity is now ready to use.
          </p>
          {!completedSteps.has('custodians') && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-300">
                <strong>⚠️ WARNING:</strong> You haven't set up custodians yet. Without custodians, you could permanently lose your identity if you lose your device or forget your passcode. We strongly recommend completing this step.
              </p>
            </div>
          )}
          {!completedSteps.has('export-id') && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
              <p className="text-sm text-orange-800 dark:text-orange-300">
                <strong>💾 RECOMMENDED:</strong> You haven't exported your identity file yet. This backup file is essential for restoring your identity on other devices. We strongly recommend completing this step.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
