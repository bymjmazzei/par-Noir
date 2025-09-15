import React from 'react';
import { Shield, Settings } from 'lucide-react';

interface PrivacyControlsHeaderProps {
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
}

export const PrivacyControlsHeader: React.FC<PrivacyControlsHeaderProps> = React.memo(({ 
  showAdvanced, 
  onToggleAdvanced 
}) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <Shield className="w-8 h-8 text-purple-600" />
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Privacy Controls
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Control how your data is shared and accessed
          </p>
        </div>
      </div>
      
      <button
        onClick={onToggleAdvanced}
        className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
      >
        <Settings className="w-4 h-4 mr-2" />
        {showAdvanced ? 'Hide Advanced' : 'Advanced Settings'}
      </button>
    </div>
  );
});

PrivacyControlsHeader.displayName = 'PrivacyControlsHeader';
