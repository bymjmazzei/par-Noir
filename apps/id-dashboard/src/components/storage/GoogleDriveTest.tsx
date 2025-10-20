// Simple Google Drive Test Component
// Helps debug OAuth configuration issues

import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

export const GoogleDriveTest: React.FC = () => {
  const [testResults, setTestResults] = useState<{
    apiKey: boolean;
    clientId: boolean;
    gapiLoaded: boolean;
    oauthError: string | null;
  }>({
    apiKey: false,
    clientId: false,
    gapiLoaded: false,
    oauthError: null
  });

  useEffect(() => {
    runTests();
  }, []);

  const runTests = () => {
    const results = {
      apiKey: false,
      clientId: false,
      gapiLoaded: false,
      oauthError: null
    };

    // Test API Key
    if (process.env.REACT_APP_GOOGLE_API_KEY || 'AIzaSyBOKyclyG0Uobs0wNCQLSK89XCN2x6NNdk') {
      results.apiKey = true;
    }

    // Test Client ID
    if (process.env.REACT_APP_GOOGLE_DRIVE_CLIENT_ID || '43740774041-fo57a1gqenc9dmggkcrhjl5cvrp40gnq.apps.googleusercontent.com') {
      results.clientId = true;
    }

    // Test GAPI Load
    if (window.gapi) {
      results.gapiLoaded = true;
    }

    setTestResults(results);
  };

  const testOAuth = async () => {
    try {
      if (!window.gapi) {
        setTestResults(prev => ({ ...prev, oauthError: 'Google API not loaded' }));
        return;
      }

      await window.gapi.load('client:auth2', async () => {
        try {
          await window.gapi.client.init({
            apiKey: process.env.REACT_APP_GOOGLE_API_KEY || 'AIzaSyBOKyclyG0Uobs0wNCQLSK89XCN2x6NNdk',
            clientId: process.env.REACT_APP_GOOGLE_DRIVE_CLIENT_ID || '43740774041-fo57a1gqenc9dmggkcrhjl5cvrp40gnq.apps.googleusercontent.com',
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
            scope: 'https://www.googleapis.com/auth/drive.file'
          });

          const authInstance = window.gapi.auth2.getAuthInstance();
          await authInstance.signIn();
          
          setTestResults(prev => ({ ...prev, oauthError: null }));
        } catch (error) {
          setTestResults(prev => ({ 
            ...prev, 
            oauthError: `OAuth Error: ${error.message}` 
          }));
        }
      });
    } catch (error) {
      setTestResults(prev => ({ 
        ...prev, 
        oauthError: `Load Error: ${error.message}` 
      }));
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h3 className="text-lg font-semibold text-text-primary">Google Drive Configuration Test</h3>
      
      {/* Configuration Tests */}
      <div className="space-y-3">
        <div className="flex items-center space-x-3">
          {testResults.apiKey ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400" />
          )}
          <span className="text-text-primary">
            API Key: {testResults.apiKey ? 'Configured' : 'Missing'}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          {testResults.clientId ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400" />
          )}
          <span className="text-text-primary">
            Client ID: {testResults.clientId ? 'Configured' : 'Missing'}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          {testResults.gapiLoaded ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400" />
          )}
          <span className="text-text-primary">
            Google API: {testResults.gapiLoaded ? 'Loaded' : 'Not Loaded'}
          </span>
        </div>
      </div>

      {/* OAuth Test */}
      <div className="space-y-3">
        <button
          onClick={testOAuth}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          Test OAuth Flow
        </button>

        {testResults.oauthError && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex items-center text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mr-2" />
              {testResults.oauthError}
            </div>
          </div>
        )}
      </div>

      {/* Configuration Info */}
      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <div className="flex items-start space-x-2">
          <Info className="w-5 h-5 text-blue-400 mt-0.5" />
          <div className="text-blue-400 text-sm">
            <p className="font-medium mb-2">Configuration Details:</p>
            <ul className="space-y-1 text-xs">
              <li>• API Key: {process.env.REACT_APP_GOOGLE_API_KEY ? 'Set' : 'Not Set'}</li>
              <li>• Client ID: {process.env.REACT_APP_GOOGLE_DRIVE_CLIENT_ID ? 'Set' : 'Not Set'}</li>
              <li>• Current Domain: {window.location.origin}</li>
              <li>• Expected Domains: pn.parnoir.com, par-noir-dashboard.web.app</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
