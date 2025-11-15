/**
 * OAuth Consent Modal Component
 * Multi-step modal similar to Google OAuth:
 * 1. Authenticate: Upload file, enter pN name, enter passcode
 * 2. Consent: Show permissions/data points and approve/deny
 */

import React, { useState, useRef } from 'react';
import { Lock, Upload, X, Loader2, CheckCircle, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { PNOAuthService } from '../services/pnOAuthService';
import { useToast } from '../hooks/useToast';

interface OAuthConsentModalProps {
  show: boolean;
  onClose: () => void;
  onUnlock: () => void;
}

type Step = 'authenticate' | 'consent';

// Data points that the browser app requests access to
const REQUESTED_DATA_POINTS = [
  {
    key: 'profile',
    label: 'Profile Information',
    description: 'Access to your pN name and basic profile details',
    category: 'profile'
  },
  {
    key: 'feed_preferences',
    label: 'Feed Preferences',
    description: 'Access to your feed subscriptions and preferences',
    category: 'preferences'
  },
  {
    key: 'engagement',
    label: 'Engagement Data',
    description: 'Access to your likes, comments, and shares',
    category: 'content'
  },
  {
    key: 'content_rating',
    label: 'Content Rating Preferences',
    description: 'Access to your content rating preferences',
    category: 'preferences'
  }
];

export function OAuthConsentModal({ show, onClose, onUnlock }: OAuthConsentModalProps) {
  const { setUnlocked } = useUserState();
  const { success, error: showError } = useToast();
  const [step, setStep] = useState<Step>('authenticate');
  const [file, setFile] = useState<File | null>(null);
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDataPoints, setSelectedDataPoints] = useState<Set<string>>(new Set(REQUESTED_DATA_POINTS.map(dp => dp.key)));
  const [authResult, setAuthResult] = useState<{ code: string; did: string; pnName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!show) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.did') && 
          !selectedFile.name.endsWith('.json') && 
          !selectedFile.name.endsWith('.pn') &&
          !selectedFile.name.endsWith('.id') &&
          selectedFile.type !== 'application/json') {
        setError('Please select a valid pN identity file (.did, .json, .pn, or .id)');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file || !pnName || !passcode) {
      setError('Please fill in all fields');
      return;
    }

    if (passcode.length < 8) {
      setError('Passcode must be at least 8 characters long');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Read identity file
      const fileText = await file.text();
      let identityData: any;
      
      try {
        identityData = JSON.parse(fileText);
      } catch (e) {
        setError('Invalid identity file format');
        setLoading(false);
        return;
      }

      // Extract identity information
      const encryptedIdentity = identityData.encryptedData || identityData;
      const publicKey = identityData.publicKey || identityData.id || '';
      const did = identityData.id || identityData.did || `did:key:${publicKey.substring(0, 32)}`;

      if (!publicKey || !did) {
        setError('Invalid identity file: missing public key or DID');
        setLoading(false);
        return;
      }

      // Verify pN name matches
      // In a real implementation, you'd decrypt and verify the pN name matches
      // For now, we'll proceed with authentication

      // Get OAuth params
      const oauthClientId = sessionStorage.getItem('pn_oauth_client_id') || 'browser-app';
      const oauthRedirectUri = sessionStorage.getItem('pn_oauth_redirect_uri') || window.location.origin + '/';
      const oauthScope = sessionStorage.getItem('pn_oauth_scope') || 'openid profile';
      const oauthState = sessionStorage.getItem('pn_oauth_state');
      const oauthNonce = sessionStorage.getItem('pn_oauth_nonce');

      // Authenticate via API
      const authResult = await PNOAuthService.authenticate({
        encryptedIdentity,
        passcode,
        publicKey,
        did,
        scope: oauthScope ? oauthScope.split(' ') : undefined,
        state: oauthState || undefined,
        nonce: oauthNonce || undefined,
        clientId: oauthClientId,
        redirectUri: oauthRedirectUri
      });

      // Store auth result and move to consent step
      setAuthResult({
        code: authResult.code,
        did,
        pnName
      });
      setStep('consent');
    } catch (err: any) {
      console.error('Authentication error:', err);
      setError(err.message || 'Failed to authenticate. Please check your passcode and pN name.');
      showError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConsent = async () => {
    if (!authResult) return;

    setLoading(true);
    setError(null);

    try {
      // Exchange code for tokens
      const tokenResponse = await PNOAuthService.exchangeCodeForToken(authResult.code);
      const userInfo = await PNOAuthService.getUserInfo(tokenResponse.access_token);
      
      // Create session
      const session = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
        did: userInfo.did,
        pnName: userInfo.pn_name
      };
      
      PNOAuthService.saveSession(session);
      setUnlocked(userInfo.did);
      
      // Clean up OAuth params
      sessionStorage.removeItem('pn_oauth_client_id');
      sessionStorage.removeItem('pn_oauth_redirect_uri');
      sessionStorage.removeItem('pn_oauth_scope');
      sessionStorage.removeItem('pn_oauth_state');
      sessionStorage.removeItem('pn_oauth_nonce');
      
      success('Successfully connected your pN!');
      resetModal();
      onUnlock();
      onClose();
    } catch (err: any) {
      console.error('Consent error:', err);
      setError(err.message || 'Failed to complete authorization');
      showError(err.message || 'Authorization failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = () => {
    resetModal();
    onClose();
  };

  const resetModal = () => {
    setStep('authenticate');
    setFile(null);
    setPnName('');
    setPasscode('');
    setError(null);
    setSelectedDataPoints(new Set(REQUESTED_DATA_POINTS.map(dp => dp.key)));
    setAuthResult(null);
  };

  const handleCancel = () => {
    resetModal();
    onClose();
  };

  const toggleDataPoint = (key: string) => {
    setSelectedDataPoints(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Lock className="h-6 w-6 text-gray-700" />
            <h2 className="text-2xl font-bold text-gray-800">
              {step === 'authenticate' ? 'Connect Your pN' : 'Grant Permissions'}
            </h2>
          </div>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center mb-6">
          <div className={`flex items-center ${step === 'authenticate' ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'authenticate' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
              {step === 'authenticate' ? '1' : <CheckCircle className="h-5 w-5" />}
            </div>
            <span className="ml-2 text-sm font-medium">Authenticate</span>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400 mx-2" />
          <div className={`flex items-center ${step === 'consent' ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'consent' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
              2
            </div>
            <span className="ml-2 text-sm font-medium">Permissions</span>
          </div>
        </div>

        {/* Step 1: Authenticate */}
        {step === 'authenticate' && (
          <form onSubmit={handleAuthenticate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select pN File
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pn,.id,.json,.did,.identity"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:bg-gray-50 flex items-center justify-center space-x-2 text-gray-700"
              >
                <Upload className="h-5 w-5" />
                <span>{file ? file.name : 'Select pN file (.did, .json, .pn, or .id)'}</span>
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                pN Name
              </label>
              <input
                type="text"
                value={pnName}
                onChange={(e) => setPnName(e.target.value)}
                placeholder="Enter your pN name"
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Passcode
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter your passcode"
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md flex items-center space-x-2">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !file || !pnName || !passcode}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Consent */}
        {step === 'consent' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-2">
                browse.parnoir.com wants to access your pN
              </h3>
              <p className="text-sm text-gray-600">
                This will allow the browser app to access your profile and preferences.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-gray-800 mb-3">Requested Permissions:</h4>
              <div className="space-y-2">
                {REQUESTED_DATA_POINTS.map(dataPoint => (
                  <div
                    key={dataPoint.key}
                    className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleDataPoint(dataPoint.key)}
                  >
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={selectedDataPoints.has(dataPoint.key)}
                        onChange={() => toggleDataPoint(dataPoint.key)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">{dataPoint.label}</div>
                        <div className="text-sm text-gray-600">{dataPoint.description}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md flex items-center space-x-2">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setStep('authenticate')}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={handleDeny}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Deny
              </button>
              <button
                type="button"
                onClick={handleConsent}
                disabled={loading || selectedDataPoints.size === 0}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Granting access...</span>
                  </>
                ) : (
                  <>
                    <span>Allow</span>
                    <CheckCircle className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

