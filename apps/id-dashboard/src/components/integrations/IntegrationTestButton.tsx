import React from 'react';
import { TestTube } from 'lucide-react';

interface IntegrationTestButtonProps {
  integrationKey: string;
  testingStatus: 'idle' | 'testing' | 'success' | 'error';
  testResult?: string;
  onTest: (integrationKey: string) => void;
}

export const IntegrationTestButton: React.FC<IntegrationTestButtonProps> = React.memo(({ 
  integrationKey, 
  testingStatus, 
  testResult, 
  onTest 
}) => {
  return (
    <div className="mt-4 flex items-center justify-between">
      <button
        onClick={() => onTest(integrationKey)}
        disabled={testingStatus === 'testing'}
        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <TestTube className="w-4 h-4" />
        <span>
          {testingStatus === 'testing' ? 'Testing...' : 'Test Integration'}
        </span>
      </button>
      
      {testResult && (
        <div className={`text-sm ${
          testingStatus === 'success' 
            ? 'text-green-600 dark:text-green-400' 
            : 'text-red-600 dark:text-red-400'
        }`}>
          {testResult}
        </div>
      )}
    </div>
  );
});

IntegrationTestButton.displayName = 'IntegrationTestButton';
