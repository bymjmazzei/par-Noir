import React, { useState, useEffect } from 'react';

const GOOGLE_CLIENT_ID = '43740774041-nbk1eb9csc12udkpo81kdvvjquie1ptl.apps.googleusercontent.com';

export const SimpleGoogleDrive: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load Google API
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('client:auth2', () => {
        window.gapi.client.init({
          clientId: GOOGLE_CLIENT_ID,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
          scope: 'https://www.googleapis.com/auth/drive'
        }).then(() => {
          const authInstance = window.gapi.auth2.getAuthInstance();
          const isSignedIn = authInstance.isSignedIn.get();
          setIsConnected(isSignedIn);
          
          if (isSignedIn) {
            const user = authInstance.currentUser.get();
            setUserEmail(user.getBasicProfile().getEmail());
          }
        }).catch((err) => {
          console.error('Google API init error:', err);
          setError('Failed to initialize Google API');
        });
      });
    };
    document.head.appendChild(script);
  }, []);

  const handleConnect = () => {
    setLoading(true);
    setError(null);

    const authInstance = window.gapi.auth2.getAuthInstance();
    authInstance.signIn().then((user) => {
      setIsConnected(true);
      setUserEmail(user.getBasicProfile().getEmail());
      setLoading(false);
    }).catch((err) => {
      console.error('Sign in error:', err);
      setError('Sign in failed');
      setLoading(false);
    });
  };

  const handleDisconnect = () => {
    const authInstance = window.gapi.auth2.getAuthInstance();
    authInstance.signOut().then(() => {
      setIsConnected(false);
      setUserEmail(null);
    });
  };

  return (
    <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Google Drive Storage</h2>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {isConnected ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-green-800 text-sm">✅ Connected as: {userEmail}</p>
          </div>
          <button onClick={handleDisconnect} className="w-full px-4 py-2 bg-red-600 text-white rounded-lg">
            DISCONNECT
          </button>
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={loading}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'CONNECT GOOGLE DRIVE'}
        </button>
      )}
    </div>
  );
};