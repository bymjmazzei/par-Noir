// Google Drive OAuth Setup Modal - Simplified version
import React, { useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, ExternalLink, RefreshCw, ArrowRight, ArrowLeft } from 'lucide-react';
import { googleDriveService, GoogleDriveConfig } from '../../services/googleDriveService';
import { IntegrationConfigManager } from '../../utils/integrationConfig';

interface GoogleDriveSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSetupComplete: (config: GoogleDriveConfig) => void;
}

export const GoogleDriveSetupModal: React.FC<GoogleDriveSetupModalProps> = ({
  isOpen,
  onClose,
  onSetupComplete
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [clientId, setClientId] = useState('');

  const handleNext = useCallback(() => {
    if (currentStep < 3) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep]);

  const handlePrevious = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleManualAuth = useCallback(async () => {
    if (!accessToken.trim()) {
      setError('Please enter your Google Drive access token');
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      // Create a mock config for testing
      const config: GoogleDriveConfig = {
        clientId: clientId || 'manual-setup',
        accessToken: accessToken.trim(),
        refreshToken: undefined
      };

      // Test the connection
      await googleDriveService.initialize(config);
      const isConnected = await googleDriveService.testConnection();
      
      if (isConnected) {
        // Save to Integration Settings
        IntegrationConfigManager.setApiKey('google-drive', 'CLIENT_ID', clientId || 'manual-setup');
        IntegrationConfigManager.setApiKey('google-drive', 'ACCESS_TOKEN', accessToken.trim());
        
        onSetupComplete(config);
        setCurrentStep(3); // Go to completion step
      } else {
        setError('Failed to connect to Google Drive. Please check your access token.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  }, [accessToken, clientId, onSetupComplete]);

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Setup Google Drive Storage</h3>
              <p className="text-text-secondary">Connect your Google Drive for permanent, encrypted storage.</p>
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

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <h4 className="font-medium text-blue-400 mb-2">Note:</h4>
              <p className="text-blue-300 text-sm">
                For now, you'll need to manually get a Google Drive access token. 
                Full OAuth integration will be added in a future update.
              </p>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Enter Google Drive Credentials</h3>
              <p className="text-text-secondary">Provide your Google Drive access token to connect.</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="clientId" className="block text-sm font-medium text-text-secondary mb-1">
                  Google Client ID (Optional)
                </label>
                <input
                  type="text"
                  id="clientId"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full p-2 border border-border rounded-md bg-input-bg text-text-primary focus:ring-primary focus:border-primary"
                  placeholder="Your Google OAuth client ID (optional)"
                />
              </div>
              
              <div>
                <label htmlFor="accessToken" className="block text-sm font-medium text-text-secondary mb-1">
                  Access Token *
                </label>
                <input
                  type="password"
                  id="accessToken"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="w-full p-2 border border-border rounded-md bg-input-bg text-text-primary focus:ring-primary focus:border-primary"
                  placeholder="Your Google Drive access token"
                  required
                />
                <p className="text-xs text-text-secondary mt-1">
                  Get this from Google Cloud Console or OAuth playground
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/20 text-red-400 p-3 rounded-lg flex items-center space-x-2">
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <h4 className="font-medium text-yellow-400 mb-2">How to get an access token:</h4>
              <ol className="list-decimal list-inside space-y-1 text-yellow-300 text-sm">
                <li>Go to <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer" className="underline">Google OAuth 2.0 Playground</a></li>
                <li>Select "Drive API v3" and "https://www.googleapis.com/auth/drive.file"</li>
                <li>Click "Authorize APIs" and sign in with your Google account</li>
                <li>Click "Exchange authorization code for tokens"</li>
                <li>Copy the "Access token" value</li>
              </ol>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-green-400 mb-2">Setup Complete!</h3>
              <CheckCircle size={48} className="text-green-500 mx-auto mb-6" />
              <p className="text-text-primary text-center mb-4">
                Your Google Drive storage is now configured and ready to use.
                You can start uploading your permanent, encrypted media!
              </p>
            </div>
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
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                  step <= currentStep 
                    ? 'bg-primary border-primary text-white' 
                    : 'border-border text-text-secondary'
                }`}>
                  {step < currentStep ? (
                    <CheckCircle size={16} />
                  ) : (
                    <span className="text-sm font-medium">{step}</span>
                  )}
                </div>
                {step < 3 && (
                  <div className={`flex-1 h-0.5 w-8 ${
                    step < currentStep ? 'bg-primary' : 'bg-border'
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
            Step {currentStep} of 3
          </div>

          {currentStep === 2 ? (
            <button
              onClick={handleManualAuth}
              disabled={isAuthenticating || !accessToken.trim()}
              className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAuthenticating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Test & Save
                </>
              )}
            </button>
          ) : currentStep < 3 ? (
            <button
              onClick={handleNext}
              className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
};