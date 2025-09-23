import React, { useState, useEffect } from 'react';

// Google OAuth configuration
const GOOGLE_CLIENT_ID = '43740774041-pcets3qets323k8p1e3aavbdphqpub06.apps.googleusercontent.com';

export const GoogleDriveSimple: React.FC = () => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Load Google API
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      // Initialize Google API
      (window as any).gapi.load('client:auth2', () => {
        (window as any).gapi.client.init({
          clientId: GOOGLE_CLIENT_ID,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
          scope: 'https://www.googleapis.com/auth/drive'
        }).then(() => {
          const authInstance = (window as any).gapi.auth2.getAuthInstance();
          const isSignedIn = authInstance.isSignedIn.get();
          setIsSignedIn(isSignedIn);
          
          if (isSignedIn) {
            const user = authInstance.currentUser.get();
            setUserEmail(user.getBasicProfile().getEmail());
          }
        }).catch((err: any) => {
          console.error('Google API init error:', err);
          setError('Failed to initialize Google API');
        });
      });
    };
    document.head.appendChild(script);
  }, []);

  const handleSignIn = () => {
    const authInstance = (window as any).gapi.auth2.getAuthInstance();
    authInstance.signIn().then((user: any) => {
      setIsSignedIn(true);
      setUserEmail(user.getBasicProfile().getEmail());
      setError('');
    }).catch((err: any) => {
      console.error('Sign in error:', err);
      setError('Sign in failed');
    });
  };

  const handleSignOut = () => {
    const authInstance = (window as any).gapi.auth2.getAuthInstance();
    authInstance.signOut().then(() => {
      setIsSignedIn(false);
      setUserEmail('');
      setError('');
    });
  };

  const listFiles = async () => {
    try {
      const response = await (window as any).gapi.client.drive.files.list({
        pageSize: 10,
        fields: 'files(id, name)'
      });
      console.log('Files:', response.result.files);
    } catch (err) {
      console.error('List files error:', err);
      setError('Failed to list files');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto' }}>
      <h2>Google Drive Integration</h2>
      
      {error && (
        <div style={{ color: 'red', marginBottom: '10px' }}>
          Error: {error}
        </div>
      )}

      {!isSignedIn ? (
        <div>
          <p>Sign in to Google Drive to get started</p>
          <button 
            onClick={handleSignIn}
            style={{
              backgroundColor: '#4285f4',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Sign in with Google
          </button>
        </div>
      ) : (
        <div>
          <p>Signed in as: {userEmail}</p>
          <button 
            onClick={listFiles}
            style={{
              backgroundColor: '#34a853',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer',
              marginRight: '10px'
            }}
          >
            List Files
          </button>
          <button 
            onClick={handleSignOut}
            style={{
              backgroundColor: '#ea4335',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};
