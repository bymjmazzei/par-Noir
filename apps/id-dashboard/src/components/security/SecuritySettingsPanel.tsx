import React from 'react';

interface SecuritySettings {
  autoLock: boolean;
  biometricRequired: boolean;
  sessionTimeout: number;
  threatNotifications: boolean;
}

interface SecuritySettingsPanelProps {
  settings: SecuritySettings;
  onSettingUpdate: (key: keyof SecuritySettings, value: any) => void;
}

export const SecuritySettingsPanel: React.FC<SecuritySettingsPanelProps> = React.memo(({ 
  settings, 
  onSettingUpdate 
}) => {
  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Security Settings
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">Auto Lock</span>
          <button
            onClick={() => onSettingUpdate('autoLock', !settings.autoLock)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.autoLock ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.autoLock ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">Biometric Required</span>
          <button
            onClick={() => onSettingUpdate('biometricRequired', !settings.biometricRequired)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.biometricRequired ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.biometricRequired ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">Session Timeout</span>
          <select
            value={settings.sessionTimeout}
            onChange={(e) => onSettingUpdate('sessionTimeout', parseInt(e.target.value))}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm"
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
            <option value={120}>2 hours</option>
          </select>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">Threat Notifications</span>
          <button
            onClick={() => onSettingUpdate('threatNotifications', !settings.threatNotifications)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.threatNotifications ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.threatNotifications ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>
    </div>
  );
});

SecuritySettingsPanel.displayName = 'SecuritySettingsPanel';
