import React, { useState, useEffect } from 'react';

const GOOGLE_CLIENT_ID = '43740774041-fo57a1gqenc9dmggkcrhjl5cvrp40gnq.apps.googleusercontent.com';

export const SimpleGoogleDrive: React.FC = () => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Load Google API
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      // Initialize Google API
      window.gapi.load('client:auth2', () => {
        window.gapi.client.init({
          clientId: GOOGLE_CLIENT_ID,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
          scope: 'https://www.googleapis.com/auth/drive'
        }).then(() => {
          const authInstance = window.gapi.auth2.getAuthInstance();
          const isSignedIn = authInstance.isSignedIn.get();
          setIsSignedIn(isSignedIn);
          
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

  const handleSignIn = () => {
    const authInstance = window.gapi.auth2.getAuthInstance();
    authInstance.signIn().then((user) => {
      setIsSignedIn(true);
      setUserEmail(user.getBasicProfile().getEmail());
      setError('');
    }).catch((err) => {
      console.error('Sign in error:', err);
      setError('Sign in failed');
    });
  };

  const handleSignOut = () => {
    const authInstance = window.gapi.auth2.getAuthInstance();
    authInstance.signOut().then(() => {
      setIsSignedIn(false);
      setUserEmail('');
      setError('');
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

      {!isSignedIn ? (
        <div>
          <p className="text-gray-600 text-sm mb-4">Sign in to Google Drive to get started</p>
          <button 
            onClick={handleSignIn}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Sign in with Google
          </button>
        </div>
      ) : (
        <div>
          <p className="text-gray-600 text-sm mb-4">Signed in as: {userEmail}</p>
          <button 
            onClick={handleSignOut}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};