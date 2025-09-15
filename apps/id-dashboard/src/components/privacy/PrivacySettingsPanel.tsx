import React from 'react';
import { Globe, Smartphone, Users, UserCheck } from 'lucide-react';

interface PrivacySettingsPanelProps {
  privacySettings: {
    dataSharing: 'private' | 'selective' | 'public';
    analytics: boolean;
    thirdPartyAccess: boolean;
    locationSharing: boolean;
    biometricData: boolean;
    dataRetention: 'minimal' | 'standard' | 'extended';
    transparency: 'low' | 'medium' | 'high';
  };
  onSettingUpdate: (key: string, value: any) => void;
}

export const PrivacySettingsPanel: React.FC<PrivacySettingsPanelProps> = React.memo(({ 
  privacySettings, 
  onSettingUpdate 
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Data Sharing Settings */}
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Data Sharing
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Data Sharing Level
            </label>
            <select
              value={privacySettings.dataSharing}
              onChange={(e) => onSettingUpdate('dataSharing', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="private">Private - No sharing</option>
              <option value="selective">Selective - Choose what to share</option>
              <option value="public">Public - Share with everyone</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Data Retention
            </label>
            <select
              value={privacySettings.dataRetention}
              onChange={(e) => onSettingUpdate('dataRetention', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="minimal">Minimal - Delete quickly</option>
              <option value="standard">Standard - Keep for reasonable time</option>
              <option value="extended">Extended - Keep for longer</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Transparency Level
            </label>
            <select
              value={privacySettings.transparency}
              onChange={(e) => onSettingUpdate('transparency', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="low">Low - Basic information</option>
              <option value="medium">Medium - Detailed information</option>
              <option value="high">High - Full transparency</option>
            </select>
          </div>
        </div>
      </div>

      {/* Feature Controls */}
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Feature Controls
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Globe className="w-5 h-5 text-gray-500" />
              <span className="text-gray-700 dark:text-gray-300">Analytics & Tracking</span>
            </div>
            <button
              onClick={() => onSettingUpdate('analytics', !privacySettings.analytics)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                privacySettings.analytics ? 'bg-purple-600' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                privacySettings.analytics ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Users className="w-5 h-5 text-gray-500" />
              <span className="text-gray-700 dark:text-gray-300">Third-Party Access</span>
            </div>
            <button
              onClick={() => onSettingUpdate('thirdPartyAccess', !privacySettings.thirdPartyAccess)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                privacySettings.thirdPartyAccess ? 'bg-purple-600' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                privacySettings.thirdPartyAccess ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Smartphone className="w-5 h-5 text-gray-500" />
              <span className="text-gray-700 dark:text-gray-300">Location Sharing</span>
            </div>
            <button
              onClick={() => onSettingUpdate('locationSharing', !privacySettings.locationSharing)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                privacySettings.locationSharing ? 'bg-purple-600' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                privacySettings.locationSharing ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <UserCheck className="w-5 h-5 text-gray-500" />
              <span className="text-gray-700 dark:text-gray-300">Biometric Data</span>
            </div>
            <button
              onClick={() => onSettingUpdate('biometricData', !privacySettings.biometricData)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                privacySettings.biometricData ? 'bg-purple-600' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                privacySettings.biometricData ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

PrivacySettingsPanel.displayName = 'PrivacySettingsPanel';
