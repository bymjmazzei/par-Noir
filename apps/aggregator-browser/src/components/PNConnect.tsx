/**
 * pN Connect Component
 * Prompts visitors to connect their pN to unlock engagement features
 * Uses shared OAuth runtime from @par-noir/oauth-ui only.
 */

import React from 'react';
import { Lock, Heart, MessageCircle, Share2 } from 'lucide-react';
import { UnlockButton, type PnOAuthPopupResult } from '@par-noir/oauth-ui';
import { useUserState } from '../contexts/UserStateContext';
import { PNOAuthService } from '../services/pnOAuthService';
import { useToast } from '../hooks/useToast';
import { API_ENDPOINT } from '../config/api';

interface PNConnectProps {
  onConnect?: () => void;
  compact?: boolean;
}

export function PNConnect({ onConnect, compact = false }: PNConnectProps) {
  const { setUnlocked, userState } = useUserState();
  const { success, error: showError } = useToast();

  const handlePopupResult = async (result: PnOAuthPopupResult) => {
    if (result.error) {
      showError(result.error === 'access_denied' ? 'Authorization denied' : 'Authorization failed');
      return;
    }
    if (!result.code) return;

    try {
      const tokenResponse = await PNOAuthService.exchangeCodeForToken(
        result.code,
        `${window.location.origin}/oauth-callback.html`
      );
      const userInfo = await PNOAuthService.getUserInfo(tokenResponse.access_token);

      let feedTokens: any[] = [];
      try {
        if (userInfo.pn_identifier) {
          const feedTokensResponse = await fetch(`${API_ENDPOINT}/api/feeds/tokens`, {
            headers: {
              Authorization: `Bearer ${tokenResponse.access_token}`,
            },
          });
          if (feedTokensResponse.ok) {
            const feedTokensData = await feedTokensResponse.json();
            feedTokens = feedTokensData.feedTokens || [];
          }
        }
      } catch {
        // Do not fail auth if feed token hydration fails
      }

      PNOAuthService.saveSession({
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: Date.now() + tokenResponse.expires_in * 1000,
        did: userInfo.did,
        pnIdentifier: userInfo.pn_identifier,
        nickname: userInfo.nickname,
        feedTokens,
      });

      const identifier = userInfo.pn_identifier || userInfo.did;
      if (!identifier) throw new Error('No identifier available from user info');
      setUnlocked(identifier);
      success('Successfully connected your pN!');
      onConnect?.();
    } catch (err: any) {
      showError(err?.message || 'Failed to complete authorization');
    }
  };

  // Don't show if already unlocked
  if (userState.isUnlocked && userState.pnIdentifier) {
    return null;
  }

  return (
    <>
      {compact ? (
        <UnlockButton
          config={{
            clientId: import.meta.env.VITE_PN_CLIENT_ID || 'browser-app',
            apiEndpoint: API_ENDPOINT,
            redirectUri: `${window.location.origin}/oauth-callback.html`,
            scope: ['openid', 'profile'],
          }}
          onPopupResult={handlePopupResult}
          onPopupFlowFailed={(msg) => showError(msg)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          showIcon={false}
        >
          <>
            <Lock className="h-4 w-4" />
            <span>Unlock pN</span>
          </>
        </UnlockButton>
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
          
          <UnlockButton
            config={{
              clientId: import.meta.env.VITE_PN_CLIENT_ID || 'browser-app',
              apiEndpoint: API_ENDPOINT,
              redirectUri: `${window.location.origin}/oauth-callback.html`,
              scope: ['openid', 'profile'],
            }}
            onPopupResult={handlePopupResult}
            onPopupFlowFailed={(msg) => showError(msg)}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            showIcon={false}
          >
            Unlock pN
          </UnlockButton>
          
          <p className="text-xs text-text-secondary mt-4">
            Your pN gives you full control over your identity and data
          </p>
        </div>
      )}
    </>
  );
}

