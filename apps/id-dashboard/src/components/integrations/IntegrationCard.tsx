import React from 'react';
import { Check, X, AlertCircle, RefreshCw } from 'lucide-react';
import { ApiKeyInput } from './ApiKeyInput';
import { IntegrationTestButton } from './IntegrationTestButton';

interface ApiKey {
  label: string;
  value: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  description?: string;
}

interface IntegrationConfig {
  name: string;
  description: string;
  category: 'storage' | 'communication' | 'payment' | 'database';
  required: boolean;
  apiKeys: {
    [key: string]: ApiKey;
  };
  status: 'configured' | 'missing' | 'error' | 'testing';
  testEndpoint?: string;
}

interface IntegrationCardProps {
  integrationKey: string;
  integration: IntegrationConfig;
  showPasswords: { [key: string]: boolean };
  testingStatus: { [key: string]: 'idle' | 'testing' | 'success' | 'error' };
  testResults: { [key: string]: string };
  onApiKeyChange: (integrationKey: string, apiKeyName: string, value: string) => void;
  onTogglePassword: (integrationKey: string) => void;
  onTest: (integrationKey: string) => void;
}

export const IntegrationCard: React.FC<IntegrationCardProps> = React.memo(({ 
  integrationKey, 
  integration, 
  showPasswords, 
  testingStatus, 
  testResults, 
  onApiKeyChange, 
  onTogglePassword, 
  onTest 
}) => {
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'storage':
        return 'bg-blue-100 text-blue-800';
      case 'communication':
        return 'bg-green-100 text-green-800';
      case 'payment':
        return 'bg-purple-100 text-purple-800';
      case 'database':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'configured':
        return <Check className="w-5 h-5 text-green-500" />;
      case 'missing':
        return <X className="w-5 h-5 text-red-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'testing':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'configured':
        return 'Configured';
      case 'missing':
        return 'Missing Keys';
      case 'error':
        return 'Error';
      case 'testing':
        return 'Testing';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      {/* Integration Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(integration.category)}`}>
            {integration.category}
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              {integration.name}
              {integration.required && (
                <span className="ml-2 text-red-500 text-sm">*</span>
              )}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {integration.description}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {getStatusIcon(integration.status)}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {getStatusText(integration.status)}
          </span>
        </div>
      </div>

      {/* API Keys */}
      <div className="space-y-4">
        {Object.entries(integration.apiKeys).map(([apiKeyName, apiKey]) => (
          <ApiKeyInput
            key={apiKeyName}
            apiKey={apiKey}
            value={apiKey.value}
            showPassword={showPasswords[integrationKey] || false}
            onChange={(value) => onApiKeyChange(integrationKey, apiKeyName, value)}
            onTogglePassword={() => onTogglePassword(integrationKey)}
          />
        ))}
      </div>

      {/* Test Button */}
      <IntegrationTestButton
        integrationKey={integrationKey}
        testingStatus={testingStatus[integrationKey] || 'idle'}
        testResult={testResults[integrationKey]}
        onTest={onTest}
      />
    </div>
  );
});

IntegrationCard.displayName = 'IntegrationCard';
