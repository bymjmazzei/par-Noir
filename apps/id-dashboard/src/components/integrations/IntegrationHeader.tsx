import React from 'react';
import { X } from 'lucide-react';

interface IntegrationHeaderProps {
  onClose: () => void;
}

export const IntegrationHeader: React.FC<IntegrationHeaderProps> = React.memo(({ onClose }) => {
  return (
    <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Integration Settings
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Manage API keys and test integrations
        </p>
      </div>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <X className="w-6 h-6" />
      </button>
    </div>
  );
});

IntegrationHeader.displayName = 'IntegrationHeader';
