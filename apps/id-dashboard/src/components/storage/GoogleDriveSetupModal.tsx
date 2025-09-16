// Google Drive OAuth Setup Modal
// Handles OAuth authentication for Google Drive storage

import React, { useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, ExternalLink, RefreshCw, ArrowRight, ArrowLeft } from 'lucide-react';
import { googleDriveService, GoogleDriveConfig } from '../../services/googleDriveService';
import { IntegrationConfigManager } from '../../utils/integrationConfig';

interface GoogleDriveSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSetupComplete: (config: GoogleDriveConfig) => void;
}

interface SetupStep {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  error?: string;
}

export const GoogleDriveSetupModal: React.FC<GoogleDriveSetupModalProps> = ({
  isOpen,
  onClose,
  onSetupComplete
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [steps, setSteps] = useState<SetupStep[]>([
    { id: 1, title: 'Google Account', description: 'Sign in with your Google account', completed: false },
    { id: 2, title: 'Grant Permissions', description: 'Allow par Noir to access your Google Drive', completed: false },
    { id: 3, title: 'Test Connection', description: 'Verify your Google Drive is connected', completed: false },
    { id: 4, title: 'Complete Setup', description: 'Save your configuration', completed: false }
  ]);

  const [config, setConfig] = useState<Partial<GoogleDriveConfig>>({
    clientId: process.env.REACT_APP_GOOGLE_CLIENT_ID || '',
    accessToken: '',
    refreshToken: ''
  });

  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

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

  const handleGoogleAuth = useCallback(async () => {
    if (!config.clientId) {
      setError('Google Client ID not configured. Please contact support.');
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      // Google OAuth 2.0 flow
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', window.location.origin + '/auth/google/callback');
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');

      // Open OAuth popup
      const popup = window.open(
        authUrl.toString(),
        'google-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      // Listen for OAuth callback
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
          const { accessToken, refreshToken } = event.data;
          setConfig(prev => ({
            ...prev,
            accessToken,
            refreshToken
          }));
          updateStep(1, true);
          updateStep(2, true);
          setIsAuthenticating(false);
          popup.close();
          window.removeEventListener('message', handleMessage);
        } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
          setError(event.data.error || 'Authentication failed');
          updateStep(1, false, event.data.error);
          setIsAuthenticating(false);
          popup.close();
          window.removeEventListener('message', handleMessage);
        }
      };

      window.addEventListener('message', handleMessage);

      // Handle popup close
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
          setIsAuthenticating(false);
          if (!config.accessToken) {
            setError('Authentication cancelled');
          }
        }
      }, 1000);

    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      updateStep(1, false, err.message);
      setIsAuthenticating(false);
    }
  }, [config.clientId, config.accessToken, updateStep]);

  const testConnection = useCallback(async () => {
    if (!config.accessToken) {
      setError('Please complete Google authentication first');
      return;
    }

    setTesting(true);
    setError(null);

    try {
      const fullConfig: GoogleDriveConfig = {
        clientId: config.clientId || '',
        accessToken: config.accessToken,
        refreshToken: config.refreshToken
      };

      await googleDriveService.initialize(fullConfig);
      updateStep(3, true);
      setTesting(false);
    } catch (err: any) {
      setError(err.message || 'Connection test failed');
      updateStep(3, false, err.message);
      setTesting(false);
    }
  }, [config, updateStep]);

  const completeSetup = useCallback(async () => {
    if (!config.accessToken) {
      setError('Please complete Google authentication first');
      return;
    }

    try {
      const fullConfig: GoogleDriveConfig = {
        clientId: config.clientId || '',
        accessToken: config.accessToken,
        refreshToken: config.refreshToken
      };

      // Store configuration in Integration Settings
      IntegrationConfigManager.setApiKey('google-drive', 'CLIENT_ID', config.clientId || '');
      IntegrationConfigManager.setApiKey('google-drive', 'ACCESS_TOKEN', config.accessToken);
      IntegrationConfigManager.setApiKey('google-drive', 'REFRESH_TOKEN', config.refreshToken || '');

      updateStep(4, true);
      onSetupComplete(fullConfig);
    } catch (err: any) {
      setError(err.message || 'Setup completion failed');
      updateStep(4, false, err.message);
    }
  }, [config, updateStep, onSetupComplete]);

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Connect Your Google Account</h3>
              <p className="text-text-secondary">Sign in with your Google account to access Google Drive storage.</p>
            </div>
            
            <div className="bg-bg-light p-4 rounded-lg">
              <h4 className="font-medium text-text-primary mb-3">What this enables:</h4>
              <ul className="list-disc list-inside space-y-2 text-text-secondary">
                <li>Permanent storage in your Google Drive</li>
                <li>Files encrypted with pN standard (Google can't read them)</li>
                <li>Fast loading and streaming via Google's CDN</li>
                <li>Automatic thumbnails and previews</li>
                <li>Reliable access from anywhere</li>
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
                onClick={handleGoogleAuth}
                disabled={isAuthenticating || !config.clientId}
                className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAuthenticating ? (
                  <>
                    <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-5 h-5 mr-2" />
                    Sign in with Google
                  </>
                )}
              </button>
            </div>

            <div className="text-center">
              <p className="text-sm text-text-secondary">
                A popup will open for Google authentication. Please allow popups for this site.
              </p>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Grant Permissions</h3>
              <p className="text-text-secondary">Allow par Noir to create and manage files in your Google Drive.</p>
            </div>
            
            <div className="bg-bg-light p-4 rounded-lg">
              <h4 className="font-medium text-text-primary mb-3">Permissions requested:</h4>
              <ul className="list-disc list-inside space-y-2 text-text-secondary">
                <li><strong>Create files:</strong> Upload your encrypted media</li>
                <li><strong>Read files:</strong> Download and view your media</li>
                <li><strong>Delete files:</strong> Remove files when you delete them</li>
                <li><strong>Create folders:</strong> Organize your pN media</li>
              </ul>
            </div>

            <div className="bg-green-500/20 text-green-400 p-3 rounded-lg">
              <h4 className="font-medium mb-2">Your data is secure:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>All files are encrypted with your pN identity key</li>
                <li>Google cannot read your file contents</li>
                <li>Only you can decrypt and access your files</li>
                <li>Files are stored in your own Google Drive</li>
              </ul>
            </div>

            {steps[1].completed && (
              <div className="bg-green-500/20 text-green-400 p-3 rounded-lg flex items-center space-x-2">
                <CheckCircle size={20} />
                <span>Permissions granted successfully!</span>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Test Your Connection</h3>
              <p className="text-text-secondary">Let's verify that your Google Drive is connected and working.</p>
            </div>

            <div className="bg-bg-light p-4 rounded-lg">
              <h4 className="font-medium text-text-primary mb-3">Connection Test:</h4>
              <div className="space-y-2 text-sm text-text-secondary">
                <div>✅ Google Account: Connected</div>
                <div>✅ Permissions: Granted</div>
                <div>⏳ Drive Access: Testing...</div>
                <div>⏳ Folder Creation: Testing...</div>
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
                disabled={testing || !config.accessToken}
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

            {steps[2].completed && (
              <div className="bg-green-500/20 text-green-400 p-3 rounded-lg flex items-center space-x-2">
                <CheckCircle size={20} />
                <span>Connection successful! Your Google Drive is ready.</span>
              </div>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Complete Setup</h3>
              <p className="text-text-secondary">Save your configuration and start using Google Drive storage!</p>
            </div>

            <div className="bg-bg-light p-4 rounded-lg">
              <h4 className="font-medium text-text-primary mb-3">What happens next:</h4>
              <ul className="list-disc list-inside space-y-2 text-text-secondary">
                <li>Your Google Drive credentials will be securely stored</li>
                <li>A "par-noir-media" folder will be created in your Google Drive</li>
                <li>All your media will be encrypted and stored there</li>
                <li>Files will load fast via Google's CDN</li>
                <li>You'll have complete control over your data</li>
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
                disabled={!steps[2].completed}
                className="inline-flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-5 h-5 mr-2" />
                Complete Setup
              </button>
            </div>

            {steps[3].completed && (
              <div className="bg-green-500/20 text-green-400 p-3 rounded-lg flex items-center space-x-2">
                <CheckCircle size={20} />
                <span>Setup complete! You can now use Google Drive storage.</span>
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
            <h2 className="text-2xl font-bold text-text-primary">Setup Google Drive Storage</h2>
            <p className="text-text-secondary">Connect your Google Drive for permanent, encrypted storage</p>
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
              disabled={currentStep === 3 && !steps[2].completed}
              className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          ) : (
            <button
              onClick={onClose}
              disabled={!steps[3].completed}
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
