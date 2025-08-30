import React, { useState, useEffect } from 'react';
import { IntegrationConfigManager } from '../utils/integrationConfig';

interface IntegrationDebuggerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IntegrationDebugger: React.FC<IntegrationDebuggerProps> = ({
  isOpen,
  onClose
}) => {
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (isOpen) {
      updateDebugInfo();
    }
  }, [isOpen, refreshKey]);

  const updateDebugInfo = () => {
    const info = {
      timestamp: new Date().toISOString(),
      localStorage: {
        integration_config: localStorage.getItem('par_noir_integration_config'),
        integration_config_legacy: localStorage.getItem('integration_config'),
      },
      configManager: {
        allConfig: IntegrationConfigManager.getAllConfig(),
        validation: IntegrationConfigManager.validateConfig(),
      },
      environment: {
        REACT_APP_IPFS_PROJECT_ID: process.env.REACT_APP_IPFS_PROJECT_ID,
        REACT_APP_IPFS_PROJECT_SECRET: process.env.REACT_APP_IPFS_PROJECT_SECRET,
        REACT_APP_SENDGRID_API_KEY: process.env.REACT_APP_SENDGRID_API_KEY,
        REACT_APP_TWILIO_ACCOUNT_SID: process.env.REACT_APP_TWILIO_ACCOUNT_SID,
        REACT_APP_COINBASE_COMMERCE_API_KEY: process.env.REACT_APP_COINBASE_COMMERCE_API_KEY,
      },
      window: {
        REACT_APP_IPFS_PROJECT_ID: (window as any).REACT_APP_IPFS_PROJECT_ID,
        REACT_APP_IPFS_PROJECT_SECRET: (window as any).REACT_APP_IPFS_PROJECT_SECRET,
        REACT_APP_SENDGRID_API_KEY: (window as any).REACT_APP_SENDGRID_API_KEY,
        REACT_APP_TWILIO_ACCOUNT_SID: (window as any).REACT_APP_TWILIO_ACCOUNT_SID,
        REACT_APP_COINBASE_COMMERCE_API_KEY: (window as any).REACT_APP_COINBASE_COMMERCE_API_KEY,
      },
      configManagerEnv: {
        IPFS_PROJECT_ID: IntegrationConfigManager.getEnvVar('REACT_APP_IPFS_PROJECT_ID'),
        IPFS_PROJECT_SECRET: IntegrationConfigManager.getEnvVar('REACT_APP_IPFS_PROJECT_SECRET'),
        SENDGRID_API_KEY: IntegrationConfigManager.getEnvVar('REACT_APP_SENDGRID_API_KEY'),
        TWILIO_ACCOUNT_SID: IntegrationConfigManager.getEnvVar('REACT_APP_TWILIO_ACCOUNT_SID'),
        COINBASE_COMMERCE_API_KEY: IntegrationConfigManager.getEnvVar('REACT_APP_COINBASE_COMMERCE_API_KEY'),
      }
    };
    setDebugInfo(info);
  };

  const clearAllStorage = () => {
    if (confirm('Clear all integration storage? This will remove all saved API keys.')) {
      localStorage.removeItem('par_noir_integration_config');
      localStorage.removeItem('integration_config');
      IntegrationConfigManager.clearAllConfig();
      setRefreshKey(prev => prev + 1);
    }
  };

  const exportConfig = () => {
    const config = IntegrationConfigManager.exportConfig();
    const blob = new Blob([config], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'par-noir-integration-config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          if (IntegrationConfigManager.importConfig(content)) {
            alert('Configuration imported successfully!');
            setRefreshKey(prev => prev + 1);
          } else {
            alert('Failed to import configuration. Please check the file format.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl max-h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              🔍 Integration Debugger
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Debug API key storage and configuration issues
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setRefreshKey(prev => prev + 1)}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(100vh-200px)]">
          <div className="space-y-6">
            {/* Actions */}
            <div className="flex space-x-3">
              <button
                onClick={exportConfig}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Export Config
              </button>
              <button
                onClick={importConfig}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Import Config
              </button>
              <button
                onClick={clearAllStorage}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Clear All Storage
              </button>
            </div>

            {/* Debug Information */}
            <div className="space-y-4">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Configuration Manager Status</h3>
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(debugInfo.configManager, null, 2)}
                </pre>
              </div>

              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Local Storage</h3>
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(debugInfo.localStorage, null, 2)}
                </pre>
              </div>

              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Environment Variables (process.env)</h3>
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(debugInfo.environment, null, 2)}
                </pre>
              </div>

              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Window Variables</h3>
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(debugInfo.window, null, 2)}
                </pre>
              </div>

              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Config Manager Environment Variables</h3>
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(debugInfo.configManagerEnv, null, 2)}
                </pre>
              </div>
            </div>

            {/* Troubleshooting Tips */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                🔧 Troubleshooting Tips
              </h3>
              <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                <li>• If API keys are not saving, check if localStorage is available</li>
                <li>• If environment variables are empty, the config manager should provide them</li>
                <li>• Use "Export Config" to backup your settings</li>
                <li>• Use "Clear All Storage" to start fresh if needed</li>
                <li>• Check the browser console for any error messages</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntegrationDebugger;
