/**
 * Unlock Modal Component
 * Mimics the dashboard unlock flow - upload pN file and enter passcode
 * Uses the /oauth/authorize/authenticate API endpoint
 */

import React, { useState, useRef } from 'react';
import { Lock, Upload, X, Loader2 } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { PNOAuthService } from '../services/pnOAuthService';
import { useToast } from '../hooks/useToast';

interface UnlockModalProps {
  show: boolean;
  onClose: () => void;
  onUnlock: () => void;
}

export function UnlockModal({ show, onClose, onUnlock }: UnlockModalProps) {
  const { setUnlocked } = useUserState();
  const { success, error: showError } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!show) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type (should be .did, .json, or .pn)
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

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file || !passcode) {
      setError('Please select a file and enter a passcode');
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

      // Get OAuth params from sessionStorage if available (from lock button click)
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
      
      success('Successfully unlocked your pN!');
      setFile(null);
      setPasscode('');
      onUnlock();
      onClose();
    } catch (err: any) {
      console.error('Unlock error:', err);
      setError(err.message || 'Failed to unlock. Please check your passcode and try again.');
      showError(err.message || 'Failed to unlock');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFile(null);
    setPasscode('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Lock className="h-6 w-6 text-gray-700" />
            <h2 className="text-2xl font-bold text-gray-800">Unlock pN File</h2>
          </div>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
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
            {file && (
              <p className="text-xs text-gray-500 mt-1">
                Selected: {file.name}
              </p>
            )}
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
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
              {error}
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
              disabled={loading || !file || !passcode}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Unlocking...</span>
                </>
              ) : (
                <span>Unlock</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

