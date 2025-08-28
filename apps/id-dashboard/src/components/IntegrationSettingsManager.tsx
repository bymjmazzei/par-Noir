import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, X, AlertCircle, RefreshCw, TestTube } from 'lucide-react';
import { IntegrationTester } from '../utils/integrationTester';
import { IntegrationConfigManager } from '../utils/integrationConfig';

interface IntegrationConfig {
  name: string;
  description: string;
  category: 'storage' | 'communication' | 'payment' | 'database';
  required: boolean;
  apiKeys: {
    [key: string]: {
      label: string;
      value: string;
      type: 'text' | 'password' | 'url';
      required: boolean;
      description?: string;
    };
  };
  status: 'configured' | 'missing' | 'error' | 'testing';
  testEndpoint?: string;
}

interface IntegrationSettingsManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IntegrationSettingsManager: React.FC<IntegrationSettingsManagerProps> = ({
  isOpen,
  onClose
}) => {
  const [integrations, setIntegrations] = useState<{ [key: string]: IntegrationConfig }>({});
  const [showPasswords, setShowPasswords] = useState<{ [key: string]: boolean }>({});
  const [testingStatus, setTestingStatus] = useState<{ [key: string]: 'idle' | 'testing' | 'success' | 'error' }>({});
  const [testResults, setTestResults] = useState<{ [key: string]: string }>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize integrations from environment variables and stored config
  useEffect(() => {
    const initialIntegrations: { [key: string]: IntegrationConfig } = {
      ipfs: {
        name: 'IPFS Storage',
        description: 'Decentralized file storage for metadata and documents',
        category: 'storage',
        required: true,
        apiKeys: {
          IPFS_PROJECT_ID: {
            label: 'Project ID',
            value: IntegrationConfigManager.getApiKey('ipfs', 'IPFS_PROJECT_ID') || process.env.REACT_APP_IPFS_PROJECT_ID || '',
            type: 'text',
            required: true,
            description: 'Your Infura IPFS project ID'
          },
          IPFS_PROJECT_SECRET: {
            label: 'Project Secret',
            value: IntegrationConfigManager.getApiKey('ipfs', 'IPFS_PROJECT_SECRET') || process.env.REACT_APP_IPFS_PROJECT_SECRET || '',
            type: 'password',
            required: true,
            description: 'Your Infura IPFS project secret'
          },
          IPFS_URL: {
            label: 'IPFS URL',
            value: IntegrationConfigManager.getApiKey('ipfs', 'IPFS_URL') || process.env.REACT_APP_IPFS_URL || 'https://ipfs.infura.io:5001',
            type: 'url',
            required: true,
            description: 'IPFS gateway URL'
          }
        },
        status: 'missing',
        testEndpoint: '/api/test/ipfs'
      },
      sendgrid: {
        name: 'SendGrid Email',
        description: 'Email service for notifications and recovery',
        category: 'communication',
        required: false,
        apiKeys: {
          SENDGRID_API_KEY: {
            label: 'API Key',
            value: IntegrationConfigManager.getApiKey('sendgrid', 'SENDGRID_API_KEY') || process.env.REACT_APP_SENDGRID_API_KEY || '',
            type: 'password',
            required: true,
            description: 'Your SendGrid API key'
          },
          FROM_EMAIL: {
            label: 'From Email',
            value: IntegrationConfigManager.getApiKey('sendgrid', 'FROM_EMAIL') || process.env.REACT_APP_FROM_EMAIL || '',
            type: 'text',
            required: true,
            description: 'Sender email address'
          }
        },
        status: 'missing',
        testEndpoint: '/api/test/email'
      },
      twilio: {
        name: 'Twilio SMS',
        description: 'SMS service for 2FA and recovery',
        category: 'communication',
        required: false,
        apiKeys: {
          TWILIO_ACCOUNT_SID: {
            label: 'Account SID',
            value: IntegrationConfigManager.getApiKey('twilio', 'TWILIO_ACCOUNT_SID') || process.env.REACT_APP_TWILIO_ACCOUNT_SID || '',
            type: 'text',
            required: true,
            description: 'Your Twilio Account SID'
          },
          TWILIO_AUTH_TOKEN: {
            label: 'Auth Token',
            value: IntegrationConfigManager.getApiKey('twilio', 'TWILIO_AUTH_TOKEN') || process.env.REACT_APP_TWILIO_AUTH_TOKEN || '',
            type: 'password',
            required: true,
            description: 'Your Twilio Auth Token'
          },
          TWILIO_FROM_NUMBER: {
            label: 'From Number',
            value: IntegrationConfigManager.getApiKey('twilio', 'TWILIO_FROM_NUMBER') || process.env.REACT_APP_TWILIO_FROM_NUMBER || '',
            type: 'text',
            required: true,
            description: 'Your Twilio phone number'
          }
        },
        status: 'missing',
        testEndpoint: '/api/test/sms'
      },
      coinbase: {
        name: 'Coinbase Commerce',
        description: 'Cryptocurrency payment processing',
        category: 'payment',
        required: false,
        apiKeys: {
          COINBASE_COMMERCE_API_KEY: {
            label: 'API Key',
            value: IntegrationConfigManager.getApiKey('coinbase', 'COINBASE_COMMERCE_API_KEY') || process.env.REACT_APP_COINBASE_COMMERCE_API_KEY || '',
            type: 'password',
            required: true,
            description: 'Your Coinbase Commerce API key'
          },
          COINBASE_WEBHOOK_SECRET: {
            label: 'Webhook Secret',
            value: IntegrationConfigManager.getApiKey('coinbase', 'COINBASE_WEBHOOK_SECRET') || process.env.REACT_APP_COINBASE_WEBHOOK_SECRET || '',
            type: 'password',
            required: false,
            description: 'Webhook secret for payment verification'
          }
        },
        status: 'missing',
        testEndpoint: '/api/test/payment'
      }
    };

    // Update status based on configuration
    Object.keys(initialIntegrations).forEach(key => {
      const integration = initialIntegrations[key];
      const hasRequiredKeys = Object.values(integration.apiKeys)
        .filter(apiKey => apiKey.required)
        .every(apiKey => apiKey.value.trim() !== '');
      
      integration.status = hasRequiredKeys ? 'configured' : 'missing';
    });

    setIntegrations(initialIntegrations);
  }, []);

  const handleApiKeyChange = (integrationKey: string, apiKeyName: string, value: string) => {
    // Validate API key format
    const validation = IntegrationTester.validateApiKey(integrationKey, apiKeyName, value);
    
    // Save the API key immediately to the config manager
    IntegrationConfigManager.setApiKey(integrationKey, apiKeyName, value);
    
    setIntegrations(prev => ({
      ...prev,
      [integrationKey]: {
        ...prev[integrationKey],
        apiKeys: {
          ...prev[integrationKey].apiKeys,
          [apiKeyName]: {
            ...prev[integrationKey].apiKeys[apiKeyName],
            value
          }
        }
      }
    }));
    setHasChanges(true);
  };

  const togglePasswordVisibility = (integrationKey: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [integrationKey]: !prev[integrationKey]
    }));
  };

  const testIntegration = async (integrationKey: string) => {
    const integration = integrations[integrationKey];
    if (!integration) return;

    setTestingStatus(prev => ({ ...prev, [integrationKey]: 'testing' }));
    setTestResults(prev => ({ ...prev, [integrationKey]: '' }));

    try {
      // Prepare test data
      const testData = {
        integration: integrationKey,
        config: Object.fromEntries(
          Object.entries(integration.apiKeys).map(([key, apiKey]) => [key, apiKey.value])
        )
      };

      // Use the IntegrationTester utility
      const result = await IntegrationTester.testIntegration(testData);
      
      setTestResults(prev => ({ ...prev, [integrationKey]: result.message }));
      setTestingStatus(prev => ({ 
        ...prev, 
        [integrationKey]: result.success ? 'success' : 'error' 
      }));
    } catch (error) {
      console.error(`Error testing ${integrationKey}:`, error);
      setTestResults(prev => ({ 
        ...prev, 
        [integrationKey]: error instanceof Error ? error.message : 'Test failed' 
      }));
      setTestingStatus(prev => ({ ...prev, [integrationKey]: 'error' }));
    }
  };

  const saveConfiguration = async () => {
    try {
      // Save configuration using the IntegrationConfigManager
      const configToSave = Object.fromEntries(
        Object.entries(integrations).map(([key, integration]) => [
          key,
          Object.fromEntries(
            Object.entries(integration.apiKeys).map(([apiKey, config]) => [apiKey, config.value])
          )
        ])
      );

      IntegrationConfigManager.setAllConfig(configToSave);

      setHasChanges(false);
      alert('Configuration saved successfully! Your API keys are now available throughout the application.');
    } catch (error) {
      console.error('Error saving configuration:', error);
      alert('Failed to save configuration. Please try again.');
    }
  };

  const resetConfiguration = () => {
    if (confirm('Are you sure you want to reset all configuration? This will clear all API keys.')) {
      // Clear configuration using the IntegrationConfigManager
      IntegrationConfigManager.clearAllConfig();
      
      setIntegrations(prev => {
        const reset = { ...prev };
        Object.keys(reset).forEach(key => {
          Object.keys(reset[key].apiKeys).forEach(apiKey => {
            reset[key].apiKeys[apiKey].value = '';
          });
          reset[key].status = 'missing';
        });
        return reset;
      });
      setHasChanges(true);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'configured':
        return <Check className="w-4 h-4 text-green-500" />;
      case 'missing':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <X className="w-4 h-4 text-red-500" />;
      case 'testing':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
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
        return 'Testing...';
      default:
        return 'Unknown';
    }
  };

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-full overflow-hidden">
        {/* Header */}
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

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(100vh-200px)]">
          <div className="space-y-6">
            {Object.entries(integrations).map(([integrationKey, integration]) => (
              <div
                key={integrationKey}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-6"
              >
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
                    <div key={apiKeyName} className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {apiKey.label}
                        {apiKey.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <div className="relative">
                        <input
                          type={apiKey.type === 'password' && !showPasswords[integrationKey] ? 'password' : 'text'}
                          value={apiKey.value}
                          onChange={(e) => handleApiKeyChange(integrationKey, apiKeyName, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder={`Enter ${apiKey.label.toLowerCase()}`}
                        />
                        {apiKey.type === 'password' && (
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(integrationKey)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            {showPasswords[integrationKey] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                      {apiKey.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {apiKey.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Test Button */}
                <div className="mt-4 flex items-center justify-between">
                  <button
                    onClick={() => testIntegration(integrationKey)}
                    disabled={testingStatus[integrationKey] === 'testing'}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <TestTube className="w-4 h-4" />
                    <span>
                      {testingStatus[integrationKey] === 'testing' ? 'Testing...' : 'Test Integration'}
                    </span>
                  </button>
                  
                  {testResults[integrationKey] && (
                    <div className={`text-sm ${
                      testingStatus[integrationKey] === 'success' 
                        ? 'text-green-600 dark:text-green-400' 
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {testResults[integrationKey]}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
          <div className="flex space-x-3">
            <button
              onClick={resetConfiguration}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              Reset All
            </button>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={saveConfiguration}
              disabled={!hasChanges}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntegrationSettingsManager;
