// Cloudflare R2 Setup Walkthrough Modal
// Guides users through setting up their own Cloudflare R2 storage

import React, { useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, ExternalLink, Copy, RefreshCw, ArrowRight, ArrowLeft } from 'lucide-react';
import { cloudflareR2Service, CloudflareR2Config } from '../../services/cloudflareR2Service';
import { IntegrationConfigManager } from '../../utils/integrationConfig';

interface CloudflareSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSetupComplete: (config: CloudflareR2Config) => void;
}

interface SetupStep {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  error?: string;
}

export const CloudflareSetupModal: React.FC<CloudflareSetupModalProps> = ({
  isOpen,
  onClose,
  onSetupComplete
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [steps, setSteps] = useState<SetupStep[]>([
    { id: 1, title: 'Create Cloudflare Account', description: 'Sign up for a free Cloudflare account', completed: false },
    { id: 2, title: 'Create R2 Bucket', description: 'Set up your storage bucket', completed: false },
    { id: 3, title: 'Generate API Keys', description: 'Create API tokens for access', completed: false },
    { id: 4, title: 'Test Connection', description: 'Verify your setup works', completed: false },
    { id: 5, title: 'Complete Setup', description: 'Save your configuration', completed: false }
  ]);

  const [config, setConfig] = useState<Partial<CloudflareR2Config>>({
    apiKey: '',
    apiSecret: '',
    accountId: '',
    bucketName: '',
    region: 'auto'
  });

  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateStep = useCallback((stepId: number, completed: boolean, error?: string) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, completed, error }
        : step
    ));
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, steps.length]);

  const handlePrevious = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleConfigChange = useCallback((field: keyof CloudflareR2Config, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setError(null);
  }, []);

  const testConnection = useCallback(async () => {
    if (!config.apiKey || !config.apiSecret || !config.accountId || !config.bucketName) {
      setError('Please fill in all required fields');
      return;
    }

    setTesting(true);
    setError(null);

    try {
      const fullConfig: CloudflareR2Config = {
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        accountId: config.accountId,
        bucketName: config.bucketName,
        region: config.region || 'auto'
      };

      await cloudflareR2Service.initialize(fullConfig);
      updateStep(4, true);
      setTesting(false);
    } catch (err: any) {
      setError(err.message || 'Connection test failed');
      updateStep(4, false, err.message);
      setTesting(false);
    }
  }, [config, updateStep]);

  const completeSetup = useCallback(async () => {
    if (!config.apiKey || !config.apiSecret || !config.accountId || !config.bucketName) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      const fullConfig: CloudflareR2Config = {
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        accountId: config.accountId,
        bucketName: config.bucketName,
        region: config.region || 'auto'
      };

      // Store configuration in Integration Settings
      IntegrationConfigManager.setApiKey('cloudflare-r2', 'API_KEY', config.apiKey);
      IntegrationConfigManager.setApiKey('cloudflare-r2', 'API_SECRET', config.apiSecret);
      IntegrationConfigManager.setApiKey('cloudflare-r2', 'ACCOUNT_ID', config.accountId);
      IntegrationConfigManager.setApiKey('cloudflare-r2', 'BUCKET_NAME', config.bucketName);
      IntegrationConfigManager.setApiKey('cloudflare-r2', 'REGION', config.region || 'auto');

      updateStep(5, true);
      onSetupComplete(fullConfig);
    } catch (err: any) {
      setError(err.message || 'Setup completion failed');
      updateStep(5, false, err.message);
    }
  }, [config, updateStep, onSetupComplete]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Create Your Cloudflare Account</h3>
              <p className="text-text-secondary">You'll need a free Cloudflare account to store your media permanently.</p>
            </div>
            
            <div className="bg-bg-light p-4 rounded-lg">
              <h4 className="font-medium text-text-primary mb-3">Steps:</h4>
              <ol className="list-decimal list-inside space-y-2 text-text-secondary">
                <li>Go to <a href="https://cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">cloudflare.com</a></li>
                <li>Click "Sign Up" in the top right</li>
                <li>Enter your email and create a password</li>
                <li>Verify your email address</li>
                <li>Complete your profile setup</li>
              </ol>
            </div>

            <div className="flex justify-center">
              <a 
                href="https://cloudflare.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                Go to Cloudflare
              </a>
            </div>

            <div className="text-center">
              <p className="text-sm text-text-secondary">
                Once you've created your account, click "Next" to continue.
              </p>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Create Your R2 Storage Bucket</h3>
              <p className="text-text-secondary">Set up a storage bucket to hold your media files.</p>
            </div>
            
            <div className="bg-bg-light p-4 rounded-lg">
              <h4 className="font-medium text-text-primary mb-3">Steps:</h4>
              <ol className="list-decimal list-inside space-y-2 text-text-secondary">
                <li>Log into your Cloudflare dashboard</li>
                <li>Go to "R2 Object Storage" in the sidebar</li>
                <li>Click "Create bucket"</li>
                <li>Name your bucket (e.g., "par-noir-media")</li>
                <li>Choose your preferred region</li>
                <li>Click "Create bucket"</li>
              </ol>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Bucket Name
                </label>
                <input
                  type="text"
                  value={config.bucketName || ''}
                  onChange={(e) => handleConfigChange('bucketName', e.target.value)}
                  placeholder="par-noir-media"
                  className="w-full p-3 border border-border rounded-lg bg-input-bg text-text-primary focus:ring-primary focus:border-primary"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Account ID
                </label>
                <input
                  type="text"
                  value={config.accountId || ''}
                  onChange={(e) => handleConfigChange('accountId', e.target.value)}
                  placeholder="Your Cloudflare Account ID"
                  className="w-full p-3 border border-border rounded-lg bg-input-bg text-text-primary focus:ring-primary focus:border-primary"
                />
                <p className="text-xs text-text-tertiary mt-1">
                  Find this in your Cloudflare dashboard under "Account ID"
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <a 
                href="https://dash.cloudflare.com/r2/buckets" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                Go to R2 Buckets
              </a>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Generate API Keys</h3>
              <p className="text-text-secondary">Create API tokens so pN can access your storage bucket.</p>
            </div>
            
            <div className="bg-bg-light p-4 rounded-lg">
              <h4 className="font-medium text-text-primary mb-3">Steps:</h4>
              <ol className="list-decimal list-inside space-y-2 text-text-secondary">
                <li>Go to "My Profile" → "API Tokens"</li>
                <li>Click "Create Token"</li>
                <li>Use "Custom token" template</li>
                <li>Set permissions: "Cloudflare R2:Edit"</li>
                <li>Set account resources: "Include - All accounts"</li>
                <li>Set zone resources: "Include - All zones"</li>
                <li>Click "Continue to summary"</li>
                <li>Click "Create Token"</li>
                <li>Copy the token (you won't see it again!)</li>
              </ol>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  API Token
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={config.apiKey || ''}
                    onChange={(e) => handleConfigChange('apiKey', e.target.value)}
                    placeholder="Your Cloudflare API Token"
                    className="w-full p-3 pr-12 border border-border rounded-lg bg-input-bg text-text-primary focus:ring-primary focus:border-primary"
                  />
                  {config.apiKey && (
                    <button
                      onClick={() => copyToClipboard(config.apiKey || '')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-primary"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <a 
                href="https://dash.cloudflare.com/profile/api-tokens" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                Go to API Tokens
              </a>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Test Your Connection</h3>
              <p className="text-text-secondary">Let's verify that your Cloudflare R2 setup is working correctly.</p>
            </div>

            <div className="bg-bg-light p-4 rounded-lg">
              <h4 className="font-medium text-text-primary mb-3">Configuration Summary:</h4>
              <div className="space-y-2 text-sm text-text-secondary">
                <div>Account ID: <span className="font-mono">{config.accountId || 'Not set'}</span></div>
                <div>Bucket Name: <span className="font-mono">{config.bucketName || 'Not set'}</span></div>
                <div>API Token: <span className="font-mono">{config.apiKey ? '••••••••' : 'Not set'}</span></div>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/20 text-red-400 p-3 rounded-lg flex items-center space-x-2">
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-center">
              <button
                onClick={testConnection}
                disabled={testing || !config.apiKey || !config.accountId || !config.bucketName}
                className="inline-flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testing ? (
                  <>
                    <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                    Testing Connection...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Test Connection
                  </>
                )}
              </button>
            </div>

            {steps[3].completed && (
              <div className="bg-green-500/20 text-green-400 p-3 rounded-lg flex items-center space-x-2">
                <CheckCircle size={20} />
                <span>Connection successful! Your Cloudflare R2 setup is working.</span>
              </div>
            )}
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Complete Setup</h3>
              <p className="text-text-secondary">Save your configuration and start using permanent storage!</p>
            </div>

            <div className="bg-bg-light p-4 rounded-lg">
              <h4 className="font-medium text-text-primary mb-3">What happens next:</h4>
              <ul className="list-disc list-inside space-y-2 text-text-secondary">
                <li>Your API keys will be securely stored in your pN metadata</li>
                <li>All your media will be encrypted and stored in your Cloudflare bucket</li>
                <li>You'll have complete control over your data</li>
                <li>Your files will be accessible across all pN platforms</li>
              </ul>
            </div>

            {error && (
              <div className="bg-red-500/20 text-red-400 p-3 rounded-lg flex items-center space-x-2">
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-center">
              <button
                onClick={completeSetup}
                disabled={!steps[3].completed}
                className="inline-flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-5 h-5 mr-2" />
                Complete Setup
              </button>
            </div>

            {steps[4].completed && (
              <div className="bg-green-500/20 text-green-400 p-3 rounded-lg flex items-center space-x-2">
                <CheckCircle size={20} />
                <span>Setup complete! You can now use permanent storage.</span>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-2xl font-bold text-text-primary">Setup Permanent Storage</h2>
            <p className="text-text-secondary">Configure your own Cloudflare R2 storage</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                  step.completed 
                    ? 'bg-green-500 border-green-500 text-white' 
                    : step.id === currentStep 
                      ? 'bg-primary border-primary text-white' 
                      : 'border-border text-text-secondary'
                }`}>
                  {step.completed ? (
                    <CheckCircle size={16} />
                  ) : (
                    <span className="text-sm font-medium">{step.id}</span>
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-12 h-0.5 mx-2 ${
                    step.completed ? 'bg-green-500' : 'bg-border'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6">
          {renderStepContent()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between p-6 border-t border-border">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 1}
            className="inline-flex items-center px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-bg-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </button>

          <div className="text-sm text-text-secondary">
            Step {currentStep} of {steps.length}
          </div>

          {currentStep < steps.length ? (
            <button
              onClick={handleNext}
              disabled={currentStep === 4 && !steps[3].completed}
              className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          ) : (
            <button
              onClick={onClose}
              disabled={!steps[4].completed}
              className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
