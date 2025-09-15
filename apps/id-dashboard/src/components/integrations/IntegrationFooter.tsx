import React from 'react';

interface IntegrationFooterProps {
  hasChanges: boolean;
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export const IntegrationFooter: React.FC<IntegrationFooterProps> = React.memo(({ 
  hasChanges, 
  onReset, 
  onCancel, 
  onSave 
}) => {
  return (
    <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
      <div className="flex space-x-3">
        <button
          onClick={onReset}
          className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
        >
          Reset All
        </button>
      </div>
      <div className="flex space-x-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!hasChanges}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Configuration
        </button>
      </div>
    </div>
  );
});

IntegrationFooter.displayName = 'IntegrationFooter';
