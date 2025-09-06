import React, { useState, useEffect , useCallback} from 'react';
import { IntegrationTester } from '../utils/integrationTester';
import { IntegrationConfigManager } from '../utils/integrationConfig';
import {
  IntegrationHeader,
  IntegrationCard,
  IntegrationFooter
} from './integrations';

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

export const IntegrationSettingsManager: React.FC = React.memo(({ isOpen, onClose, settings, onSettingsChange }) => {
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
    
    try {
      const result = await IntegrationTester.testIntegration(integrationKey, integration);
      setTestResults(prev => ({ ...prev, [integrationKey]: result.message }));
      setTestingStatus(prev => ({ ...prev, [integrationKey]: result.success ? 'success' : 'error' }));
    } catch (error) {
      setTestResults(prev => ({ ...prev, [integrationKey]: 'Test failed' }));
      setTestingStatus(prev => ({ ...prev, [integrationKey]: 'error' }));
    }
  };

  const resetConfiguration = () => {
    // Reset all integrations to default values
    setIntegrations(prev => {
      const reset = { ...prev };
      Object.keys(reset).forEach(key => {
        Object.keys(reset[key].apiKeys).forEach(apiKeyName => {
          reset[key].apiKeys[apiKeyName].value = '';
        });
        reset[key].status = 'missing';
      });
      return reset;
    });
    setHasChanges(false);
    setTestResults({});
    setTestingStatus({});
  };

  const saveConfiguration = () => {
    // Save all configurations
    Object.entries(integrations).forEach(([key, integration]) => {
      Object.entries(integration.apiKeys).forEach(([apiKeyName, apiKey]) => {
        IntegrationConfigManager.setApiKey(key, apiKeyName, apiKey.value);
      });
    });
    setHasChanges(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-full overflow-hidden">
        {/* Header */}
        <IntegrationHeader onClose={onClose} />

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(100vh-200px)]">
          <div className="space-y-6">
            {Object.entries(integrations).map(([integrationKey, integration]) => (
              <IntegrationCard
                key={integrationKey}
                integrationKey={integrationKey}
                integration={integration}
                showPasswords={showPasswords}
                testingStatus={testingStatus}
                testResults={testResults}
                onApiKeyChange={handleApiKeyChange}
                onTogglePassword={togglePasswordVisibility}
                onTest={testIntegration}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <IntegrationFooter
          hasChanges={hasChanges}
          onReset={resetConfiguration}
          onCancel={onClose}
          onSave={saveConfiguration}
        />
      </div>
    </div>
  );


IntegrationSettingsManager.displayName = 'IntegrationSettingsManager';
}, []);));

export default IntegrationSettingsManager;
