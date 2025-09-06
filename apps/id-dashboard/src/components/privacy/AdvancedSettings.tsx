import React from 'react';
import { Lock, Eye } from 'lucide-react';

interface AdvancedSettingsProps {
  privacySettings: {
    crossPlatformSync: boolean;
    auditLogging: boolean;
  };
  onSettingUpdate: (key: string, value: any) => void;
}

export const AdvancedSettings: React.FC<AdvancedSettingsProps> = React.memo(({ 
  privacySettings, 
  onSettingUpdate 
}) => {
  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Advanced Privacy Settings
      </h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Lock className="w-5 h-5 text-gray-500" />
            <span className="text-gray-700 dark:text-gray-300">Cross-Platform Sync</span>
          </div>
          <button
            onClick={() => onSettingUpdate('crossPlatformSync', !privacySettings.crossPlatformSync)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              privacySettings.crossPlatformSync ? 'bg-purple-600' : 'bg-gray-200'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              privacySettings.crossPlatformSync ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Eye className="w-5 h-5 text-gray-500" />
            <span className="text-gray-700 dark:text-gray-300">Audit Logging</span>
          </div>
          <button
            onClick={() => onSettingUpdate('auditLogging', !privacySettings.auditLogging)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              privacySettings.auditLogging ? 'bg-purple-600' : 'bg-gray-200'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              privacySettings.auditLogging ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>
    </div>
  );
});

AdvancedSettings.displayName = 'AdvancedSettings';
