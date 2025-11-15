/**
 * pN Connect Component
 * Prompts visitors to connect their pN to unlock engagement features
 * Uses OAuth 2.0 authorization code flow
 */

import React, { useState, useRef } from 'react';
import { Lock, Heart, MessageCircle, Share2, Upload, Loader2, X } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { PNOAuthService } from '../services/pnOAuthService';
import { useToast } from '../hooks/useToast';

interface PNConnectProps {
  onConnect?: () => void;
  compact?: boolean;
  showModal?: boolean;
  onClose?: () => void;
}

export function PNConnect({ onConnect, compact = false, showModal: externalShowModal, onClose }: PNConnectProps) {
  const { setUnlocked } = useUserState();
  const { success, error: showError } = useToast();
  const [internalShowModal, setInternalShowModal] = useState(false);
  const showAuthModal = externalShowModal !== undefined ? externalShowModal : internalShowModal;
  const [identityFile, setIdentityFile] = useState<File | null>(null);
  const [passcode, setPasscode] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleConnect = () => {
    if (externalShowModal !== undefined && onClose !== undefined) {
      // Controlled from outside
      return; // External control, don't manage state internally
    }
    setInternalShowModal(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type (should be .did or JSON)
      if (!file.name.endsWith('.did') && !file.name.endsWith('.json') && file.type !== 'application/json') {
        showError('Please select a valid pN identity file (.did or .json)');
        return;
      }
      setIdentityFile(file);
    }
  };

  const handleAuthenticate = async () => {
    if (!identityFile || !passcode) {
      showError('Please select your pN identity file and enter your passcode');
      return;
    }

    setAuthenticating(true);

    try {
      // Read identity file
      const fileText = await identityFile.text();
      let identityData: any;
      
      try {
        identityData = JSON.parse(fileText);
      } catch (e) {
        showError('Invalid identity file format');
        setAuthenticating(false);
        return;
      }

      // Extract identity information
      const encryptedIdentity = identityData.encryptedData || identityData;
      const publicKey = identityData.publicKey || identityData.id || '';
      const did = identityData.id || identityData.did || `did:key:${publicKey.substring(0, 32)}`;

      if (!publicKey || !did) {
        showError('Invalid identity file: missing public key or DID');
        setAuthenticating(false);
        return;
      }

      // Get OAuth params from sessionStorage if available (from lock button click)
      const oauthClientId = sessionStorage.getItem('pn_oauth_client_id');
      const oauthRedirectUri = sessionStorage.getItem('pn_oauth_redirect_uri');
      const oauthScope = sessionStorage.getItem('pn_oauth_scope');
      const oauthState = sessionStorage.getItem('pn_oauth_state');
      const oauthNonce = sessionStorage.getItem('pn_oauth_nonce');

      if (oauthClientId && oauthRedirectUri) {
        // Complete OAuth flow with stored params
        const { PNOAuthService } = require('../services/pnOAuthService');
        const authResult = await PNOAuthService.authenticate({
          encryptedIdentity,
          passcode,
          publicKey,
          did,
          scope: oauthScope ? oauthScope.split(' ') : undefined,
          state: oauthState || undefined,
          nonce: oauthNonce || undefined
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
        
        // Redirect back to app (or stay on current page)
        success('Successfully connected your pN!');
      } else {
        // Regular auth flow (not OAuth)
        const session = await PNOAuthService.completeAuthFlow({
          encryptedIdentity,
          passcode,
          publicKey,
          did
        });

        // Update user state
        setUnlocked(session.did);
        success('Successfully connected your pN!');
      }

      if (externalShowModal !== undefined && onClose) {
        onClose();
      } else {
        setInternalShowModal(false);
      }
      setIdentityFile(null);
      setPasscode('');
      onConnect?.();
    } catch (err: any) {
      console.error('Authentication error:', err);
      showError(err.message || 'Failed to authenticate. Please check your passcode and try again.');
    } finally {
      setAuthenticating(false);
    }
  };

  return (
    <>
      {compact ? (
        <button
          onClick={handleConnect}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Lock className="h-4 w-4" />
          <span>Connect pN</span>
        </button>
      ) : (
        <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-6 text-center">
          <Lock className="h-12 w-12 text-blue-400 mx-auto mb-4" />
          <h3 className="text-white text-xl font-bold mb-2">Connect Your pN to Engage</h3>
          <p className="text-text-secondary mb-6">
            Unlock likes, comments, and full interaction with the par Noir network
          </p>
          
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="flex flex-col items-center space-y-2">
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Heart className="h-6 w-6 text-blue-400" />
              </div>
              <span className="text-xs text-text-secondary">Like Content</span>
            </div>
            <div className="flex flex-col items-center space-y-2">
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                <MessageCircle className="h-6 w-6 text-blue-400" />
              </div>
              <span className="text-xs text-text-secondary">Comment</span>
            </div>
            <div className="flex flex-col items-center space-y-2">
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Share2 className="h-6 w-6 text-blue-400" />
              </div>
              <span className="text-xs text-text-secondary">Share</span>
            </div>
          </div>
          
          <button
            onClick={handleConnect}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Connect pN
          </button>
          
          <p className="text-xs text-text-secondary mt-4">
            Your pN gives you full control over your identity and data
          </p>
        </div>
      )}

      {/* Authentication Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            if (onClose) {
              onClose();
            } else {
              setInternalShowModal(false);
            }
          }
        }}>
          <div className="bg-neutral-900 rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Connect Your pN</h2>
              <button
                onClick={() => {
                  if (externalShowModal !== undefined && onClose) {
                    onClose();
                  } else {
                    setInternalShowModal(false);
                  }
                  setIdentityFile(null);
                  setPasscode('');
                }}
                className="text-text-secondary hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  pN Identity File
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".did,.json,application/json"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm hover:bg-neutral-700 transition-colors flex items-center justify-center space-x-2"
                  >
                    <Upload className="h-4 w-4" />
                    <span>{identityFile ? identityFile.name : 'Select .did file'}</span>
                  </button>
                </div>
                {identityFile && (
                  <p className="text-xs text-text-secondary mt-1">
                    Selected: {identityFile.name}
                  </p>
                )}
              </div>

              {/* Passcode Input */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Passcode
                </label>
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter your pN passcode"
                  className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !authenticating) {
                      handleAuthenticate();
                    }
                  }}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={() => {
                    if (externalShowModal !== undefined && onClose) {
                      onClose();
                    } else {
                      setInternalShowModal(false);
                    }
                    setIdentityFile(null);
                    setPasscode('');
                  }}
                  disabled={authenticating}
                  className="flex-1 px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAuthenticate}
                  disabled={authenticating || !identityFile || !passcode}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {authenticating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Connecting...
                    </>
                  ) : (
                    'Connect'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

