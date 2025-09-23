import React, { useState } from 'react';

const GOOGLE_CLIENT_ID = '43740774041-pcets3qets323k8p1e3aavbdphqpub06.apps.googleusercontent.com';

export const SimpleGoogleDrive: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = () => {
    setLoading(true);
    setError(null);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', window.location.origin + '/oauth-callback.html');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive');

    const popup = window.open(authUrl.toString(), 'google-auth', 'width=500,height=600');

    if (!popup) {
      setError('Popup blocked');
      setLoading(false);
      return;
    }

    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        popup.close();
        window.removeEventListener('message', messageHandler);
        
        localStorage.setItem('google_drive_token', event.data.accessToken);
        localStorage.setItem('google_drive_email', event.data.email || 'Unknown');
        setUserEmail(event.data.email || 'Unknown');
        setIsConnected(true);
        setLoading(false);
      }
    };

    window.addEventListener('message', messageHandler);
  };

  const handleDisconnect = () => {
    localStorage.removeItem('google_drive_token');
    localStorage.removeItem('google_drive_email');
    setIsConnected(false);
    setUserEmail(null);
  };

  React.useEffect(() => {
    const token = localStorage.getItem('google_drive_token');
    const email = localStorage.getItem('google_drive_email');
    if (token && email) {
      setIsConnected(true);
      setUserEmail(email);
    }
  }, []);

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