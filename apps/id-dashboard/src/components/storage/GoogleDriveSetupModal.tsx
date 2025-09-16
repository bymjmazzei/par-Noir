// Google Drive OAuth Setup Modal - Proper OAuth flow
import React, { useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, ExternalLink, RefreshCw, ArrowRight, ArrowLeft, LogIn } from 'lucide-react';
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');

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

  const handleGoogleAuth = useCallback(async () => {
    setIsAuthenticating(true);
    setError(null);

    try {
      const config = await googleDriveService.authenticate();
      setIsAuthenticated(true);
      setUserEmail('user@example.com'); // This would come from the auth response
      setCurrentStep(3);
      onSetupComplete(config);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      console.error('Google Drive authentication error:', err);
    } finally {
      setIsAuthenticating(false);
    }
  }, [onSetupComplete]);

  const handleTestConnection = useCallback(async () => {
    try {
      const isConnected = await googleDriveService.testConnection();
      if (isConnected) {
        setCurrentStep(3);
      } else {
        setError('Connection test failed');
      }
    } catch (err: any) {
      setError(err.message || 'Connection test failed');
    }
  }, []);

  const handleComplete = useCallback(() => {
    onClose();
  }, [onClose]);

  // Check if already authenticated on mount
  useEffect(() => {
    if (isOpen) {
      const accessToken = IntegrationConfigManager.getApiKey('google-drive', 'ACCESS_TOKEN');
      if (accessToken) {
        setIsAuthenticated(true);
        setCurrentStep(2);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <LogIn className="w-8 h-8 text-blue-600" />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Connect Google Drive
              </h3>
              <p className="text-gray-600">
                Sign in with your Google account to enable secure file storage in your own Google Drive.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
              <h4 className="font-medium text-blue-900 mb-2">Benefits:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Files stored in your own Google Drive</li>
                <li>• Automatic token refresh (no manual re-authentication)</li>
                <li>• Encrypted file names for privacy</li>
                <li>• Fast access via Google's global CDN</li>
                <li>• Automatic thumbnails and previews</li>
              </ul>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleGoogleAuth}
              disabled={isAuthenticating}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
            >
              {isAuthenticating ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5 mr-2" />
                  Sign in with Google
                </>
              )}
            </button>
          </div>
        );

      case 2:
        return (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Authentication Successful
              </h3>
              <p className="text-gray-600">
                You're now connected to Google Drive. Let's test the connection and set up your storage folder.
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                <span className="text-sm text-green-800">
                  Connected as: {userEmail || 'Google Account'}
                </span>
              </div>
            </div>

            <button
              onClick={handleTestConnection}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Test Connection & Setup
            </button>
          </div>
        );

      case 3:
        return (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Setup Complete!
              </h3>
              <p className="text-gray-600">
                Google Drive storage is now ready. You can upload files and they'll be stored securely in your Google Drive.
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-900 mb-2">What's Next:</h4>
              <ul className="text-sm text-green-800 space-y-1 text-left">
                <li>• Upload files through the storage interface</li>
                <li>• Files are automatically encrypted and stored in your Google Drive</li>
                <li>• Access your files anytime through Google Drive or pN</li>
                <li>• Tokens refresh automatically - no manual re-authentication needed</li>
              </ul>
            </div>

            <button
              onClick={handleComplete}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Start Using Storage
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Google Drive Setup
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {renderStepContent()}
        </div>

        {currentStep > 1 && currentStep < 3 && (
          <div className="flex items-center justify-between p-6 border-t border-gray-200">
            <button
              onClick={handlePrevious}
              className="flex items-center text-gray-600 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Previous
            </button>
            
            <div className="flex space-x-2">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`w-2 h-2 rounded-full ${
                    step <= currentStep ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};