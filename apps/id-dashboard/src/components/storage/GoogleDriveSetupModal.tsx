import React, { useState, useEffect } from 'react';

interface GoogleDriveSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// Google OAuth configuration
const GOOGLE_CLIENT_ID = '43740774041-pcets3qets323k8p1e3aavbdphqpub06.apps.googleusercontent.com';

export const GoogleDriveSetupModal: React.FC<GoogleDriveSetupModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [gapiLoaded, setGapiLoaded] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setUserEmail(null);
      loadGoogleAPI();
    }
  }, [isOpen]);

  const loadGoogleAPI = () => {
    // Use Google's OAuth 2.0 popup flow instead of gapi
    setGapiLoaded(true);
    setError(null);
  };

  const checkAuthStatus = () => {
    // Check if user is already authenticated via localStorage
    const token = localStorage.getItem('google_drive_token');
    const email = localStorage.getItem('google_drive_email');
    if (token && email) {
      setIsAuthenticated(true);
      setUserEmail(email);
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Use Google's OAuth 2.0 popup flow
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(window.location.origin + '/oauth-callback.html')}&` +
        `scope=${encodeURIComponent('https://www.googleapis.com/auth/drive')}&` +
        `response_type=token&` +
        `access_type=offline&` +
        `prompt=consent`;

      // Open popup
      const popup = window.open(
        authUrl,
        'google-oauth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error('Popup blocked');
      }

      // Listen for the popup to close or receive message
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setIsLoading(false);
        }
      }, 1000);

      // Listen for message from popup
      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
          popup.close();
          
          localStorage.setItem('google_drive_token', event.data.accessToken);
          localStorage.setItem('google_drive_email', event.data.email || 'Unknown');
          setUserEmail(event.data.email || 'Unknown');
          setIsAuthenticated(true);
          onSuccess();
          setIsLoading(false);
        } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
          popup.close();
          setError(event.data.error || 'Authentication failed');
          setIsLoading(false);
        }
      };

      window.addEventListener('message', messageHandler);

    } catch (error) {
      console.error('Google Drive authentication error:', error);
      setError('Authentication failed');
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    setError(null);

    try {
      localStorage.removeItem('google_drive_token');
      localStorage.removeItem('google_drive_email');
      setUserEmail(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Sign out error:', error);
      setError('Sign out failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Google Drive Setup</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            type="button"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Connect Google Drive</h3>
            <p className="text-gray-600 text-sm mb-4">
              Sign in with your Google account to enable secure file storage in your own Google Drive.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {isAuthenticated ? (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-green-800 text-sm">
                  ✅ Connected to Google Drive as: {userEmail}
                </p>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={handleSignOut}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  type="button"
                >
                  {isLoading ? 'Signing out...' : 'Sign Out'}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  type="button"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              type="button"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Sign in with Google</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};