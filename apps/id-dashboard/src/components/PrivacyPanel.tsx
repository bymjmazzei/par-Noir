import React, { useState } from 'react';

interface PrivacySettings {
  dataRetention: '7days' | '30days' | '90days' | '1year' | 'forever';
  autoBackup: boolean;
  analytics: boolean;
  crashReporting: boolean;
  telemetry: boolean;
  thirdPartySharing: boolean;
}

interface PrivacyPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: PrivacySettings;
  onSettingsChange: (settings: PrivacySettings) => void;
}

export const PrivacyPanel: React.FC<PrivacyPanelProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange
}) => {
  const [localSettings, setLocalSettings] = useState<PrivacySettings>(settings);

  const handleSettingChange = (key: keyof PrivacySettings, value: any) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleSave = () => {
    onSettingsChange(localSettings);
    onClose();
  };

  const handleReset = () => {
    setLocalSettings(settings);
  };

  const handleForgetMe = () => {
    if (confirm('This will permanently delete all your data. This action cannot be undone. Are you sure?')) {
      // Clear all stored data
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear IndexedDB
      const request = indexedDB.deleteDatabase('IdentityDashboardDB');
      request.onsuccess = () => {
        alert('All data has been permanently deleted.');
        window.location.reload();
      };
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Privacy Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {/* Data Retention */}
          <div>
            <h3 className="text-lg font-medium mb-3">Data Retention</h3>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="dataRetention"
                  value="7days"
                  checked={localSettings.dataRetention === '7days'}
                  onChange={(e) => handleSettingChange('dataRetention', e.target.value)}
                  className="mr-2"
                />
                <span>7 days</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="dataRetention"
                  value="30days"
                  checked={localSettings.dataRetention === '30days'}
                  onChange={(e) => handleSettingChange('dataRetention', e.target.value)}
                  className="mr-2"
                />
                <span>30 days</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="dataRetention"
                  value="90days"
                  checked={localSettings.dataRetention === '90days'}
                  onChange={(e) => handleSettingChange('dataRetention', e.target.value)}
                  className="mr-2"
                />
                <span>90 days</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="dataRetention"
                  value="1year"
                  checked={localSettings.dataRetention === '1year'}
                  onChange={(e) => handleSettingChange('dataRetention', e.target.value)}
                  className="mr-2"
                />
                <span>1 year</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="dataRetention"
                  value="forever"
                  checked={localSettings.dataRetention === 'forever'}
                  onChange={(e) => handleSettingChange('dataRetention', e.target.value)}
                  className="mr-2"
                />
                <span>Forever (default)</span>
              </label>
            </div>
          </div>

          {/* Automatic Features */}
          <div>
            <h3 className="text-lg font-medium mb-3">Automatic Features</h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Auto Backup</div>
                  <div className="text-sm text-gray-600">Automatically backup your data</div>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.autoBackup}
                  onChange={(e) => handleSettingChange('autoBackup', e.target.checked)}
                  className="ml-4"
                />
              </label>
            </div>
          </div>

          {/* Analytics & Reporting */}
          <div>
            <h3 className="text-lg font-medium mb-3">Analytics & Reporting</h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Usage Analytics</div>
                  <div className="text-sm text-gray-600">Help improve the app (anonymous)</div>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.analytics}
                  onChange={(e) => handleSettingChange('analytics', e.target.checked)}
                  className="ml-4"
                />
              </label>
              
              <label className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Crash Reporting</div>
                  <div className="text-sm text-gray-600">Report errors to help fix issues</div>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.crashReporting}
                  onChange={(e) => handleSettingChange('crashReporting', e.target.checked)}
                  className="ml-4"
                />
              </label>
              
              <label className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Telemetry</div>
                  <div className="text-sm text-gray-600">Performance and usage data</div>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.telemetry}
                  onChange={(e) => handleSettingChange('telemetry', e.target.checked)}
                  className="ml-4"
                />
              </label>
            </div>
          </div>

          {/* Data Sharing */}
          <div>
            <h3 className="text-lg font-medium mb-3">Data Sharing</h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Third Party Sharing</div>
                  <div className="text-sm text-gray-600">Allow sharing with trusted services</div>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.thirdPartySharing}
                  onChange={(e) => handleSettingChange('thirdPartySharing', e.target.checked)}
                  className="ml-4"
                />
              </label>
            </div>
          </div>

          {/* Privacy Indicators */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Privacy Status</h4>
            <div className="space-y-2 text-sm text-blue-800">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                <span>All data is stored locally on your device</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                <span>No data is sent to external servers</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                <span>End-to-end encryption for all sensitive data</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4 border-t">
            <button
              onClick={handleSave}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Save Settings
            </button>
            <button
              onClick={handleReset}
              className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors"
            >
              Reset
            </button>
            <button
              onClick={handleForgetMe}
              className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors"
            >
              Forget Me
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}; 