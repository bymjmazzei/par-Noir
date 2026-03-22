/**
 * OAuth popup, lock/unlock, Me click, and session validation.
 * Auth/session behavior is isolated here.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { startPnOAuthPopup } from '@par-noir/oauth-ui';
import { useUserState } from '../contexts/UserStateContext';
import { PNOAuthService } from '../services/pnOAuthService';
import { getUserProfile } from '../services/profileService';
import { API_ENDPOINT } from '../config/api';

export interface UseAuthAndSessionParams {
  setViewingCreatorId: (id: string | null) => void;
  setActiveBottomTab: (tab: string) => void;
  setShowInbox: (v: boolean) => void;
  setShowSearch: (v: boolean) => void;
  setShowUploadModal: (v: boolean) => void;
  setViewingBrandedFeed: (f: unknown) => void;
  showErrorToast: (msg: string) => void;
  discoverFilesRef: React.MutableRefObject<((a?: unknown, b?: boolean, c?: number, d?: boolean) => Promise<void>) | null>;
}

export function useAuthAndSession({
  setViewingCreatorId,
  setActiveBottomTab,
  setShowInbox,
  setShowSearch,
  setShowUploadModal,
  setViewingBrandedFeed,
  showErrorToast,
  discoverFilesRef,
}: UseAuthAndSessionParams) {
  const { userState, setLocked, setUnlocked, updateDisplayName } = useUserState();
  const loadingDisplayNameRef = useRef<Set<string>>(new Set());
  /** Dedup OAuth code handling (postMessage + polling + URL resume / Strict Mode) */
  const oauthProcessedCodesRef = useRef<Set<string>>(new Set());

  const redirectUriForOAuth = `${typeof window !== 'undefined' ? window.location.origin : ''}/oauth-callback.html`;

  const runOAuthCallback = useCallback(
    async (
      data: {
        code?: string;
        state?: string;
        error?: string;
        error_description?: string;
        age_shared?: string;
      },
      options?: { popup?: Window | null; redirectUri?: string }
    ) => {
      if (data.error) {
        setLocked();
        PNOAuthService.clearSession();
        showErrorToast(data.error_description || data.error || 'Authentication denied');
        return;
      }
      if (!data.code) return;
      if (oauthProcessedCodesRef.current.has(data.code)) return;
      oauthProcessedCodesRef.current.add(data.code);

      const exchangeRedirectUri = options?.redirectUri ?? redirectUriForOAuth;

      try {
        const ageShared = data.age_shared === 'true';
        const tokenResponse = await PNOAuthService.exchangeCodeForToken(
          data.code,
          exchangeRedirectUri,
          ageShared
        );
        const userInfo = await PNOAuthService.getUserInfo(tokenResponse.access_token);

        let feedTokens: unknown[] = [];
        try {
          if (userInfo.pn_identifier) {
            const feedTokensResponse = await fetch(`${API_ENDPOINT}/api/feeds/tokens`, {
              headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
            });
            if (feedTokensResponse.ok) {
              const feedTokensData = await feedTokensResponse.json();
              feedTokens = feedTokensData.feedTokens || [];
            }
          }
        } catch {
          // Don't fail auth if feed tokens can't be loaded
        }

        const sessionWithIdentifier = {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresAt: Date.now() + tokenResponse.expires_in * 1000,
          did: userInfo.did,
          pnName: userInfo.nickname,
          pnIdentifier: userInfo.pn_identifier || undefined,
          publicKey: userInfo.public_key,
          feedTokens,
        };
        PNOAuthService.saveSession(sessionWithIdentifier);

        if (userInfo.pn_identifier && !userInfo.pn_identifier.startsWith('did:key:')) {
          setUnlocked(userInfo.pn_identifier);
          try {
            const profile = await getUserProfile(userInfo.pn_identifier);
            if (profile.displayName) {
              updateDisplayName(profile.displayName);
            } else if (userInfo.nickname && !userState.preferences.displayName) {
              updateDisplayName(userInfo.nickname);
            }
          } catch {
            if (userInfo.nickname && !userState.preferences.displayName) {
              updateDisplayName(userInfo.nickname);
            }
          }
        } else {
          setUnlocked(userInfo.did);
        }

        if (discoverFilesRef.current) {
          discoverFilesRef.current(undefined, true);
        }
      } catch (err) {
        console.error('OAuth callback error:', err);
        oauthProcessedCodesRef.current.delete(data.code!);
        setLocked();
        PNOAuthService.clearSession();
        showErrorToast('Authentication failed. Please try again.');
      }

      const popup = options?.popup;
      if (popup && !popup.closed) {
        try {
          popup.close();
          [10, 50, 100, 200].forEach((ms) =>
            setTimeout(() => {
              if (popup && !popup.closed) popup.close();
            }, ms)
          );
          setTimeout(() => {
            if (popup && !popup.closed) window.focus();
          }, 500);
        } catch (e) {
          console.error('Failed to close popup:', e);
        }
      }
    },
    [
      redirectUriForOAuth,
      setLocked,
      setUnlocked,
      updateDisplayName,
      showErrorToast,
      discoverFilesRef,
      userState.preferences.displayName,
    ]
  );

  /** Android/Capacitor: main window is navigated to /?oauth_resume=1&code=... after popup OAuth */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth_resume') !== '1') return;

    const code = params.get('code');
    const error = params.get('error');
    const state = params.get('state');
    const age_shared = params.get('age_shared');
    const error_description = params.get('error_description') || undefined;

    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);

    void runOAuthCallback(
      {
        code: code || undefined,
        state: state || undefined,
        error: error || undefined,
        error_description,
        age_shared: age_shared || undefined,
      },
      {}
    );
  }, [runOAuthCallback]);

  const loadUserDisplayName = useCallback(
    async (pnIdentifier: string) => {
      if (!pnIdentifier || pnIdentifier.startsWith('did:key:')) return;
      if (loadingDisplayNameRef.current.has(pnIdentifier)) return;
      loadingDisplayNameRef.current.add(pnIdentifier);
      try {
        const profile = await getUserProfile(pnIdentifier);
        if (profile.displayName) updateDisplayName(profile.displayName);
      } catch (error) {
        console.debug('Failed to load user display name:', error);
      } finally {
        loadingDisplayNameRef.current.delete(pnIdentifier);
      }
    },
    [updateDisplayName]
  );

  const handleMeClick = useCallback(async () => {
    setShowInbox(false);
    setShowSearch(false);
    setShowUploadModal(false);
    setViewingBrandedFeed(null);
    if (userState.isUnlocked) {
      const session = PNOAuthService.loadSession();
      let pnIdentifier = session?.pnIdentifier || userState.pnIdentifier;

      if (pnIdentifier && pnIdentifier.startsWith('did:key:')) {
        try {
          if (session?.accessToken) {
            const userInfo = await PNOAuthService.getUserInfo(session.accessToken);
            if (userInfo.pn_identifier) {
              pnIdentifier = userInfo.pn_identifier;
              PNOAuthService.saveSession({ ...session, pnIdentifier });
              setUnlocked(pnIdentifier);
              setTimeout(async () => {
                try {
                  if (!pnIdentifier) return;
                  const profile = await getUserProfile(pnIdentifier);
                  if (profile.displayName) {
                    updateDisplayName(profile.displayName);
                  } else if (userInfo.nickname && !userState.preferences.displayName) {
                    updateDisplayName(userInfo.nickname);
                  }
                } catch {
                  if (userInfo.nickname && !userState.preferences.displayName) {
                    updateDisplayName(userInfo.nickname);
                  }
                }
              }, 1000);
            }
          }
        } catch (error) {
          console.warn('Failed to fetch pN identifier from userinfo:', error);
        }
      }

      if (pnIdentifier && !pnIdentifier.startsWith('did:key:')) {
        setViewingCreatorId(pnIdentifier);
        setActiveBottomTab('index');
      } else {
        console.warn('⚠️ Still have DID instead of pN identifier, fetching from API...');
        try {
          const sess = PNOAuthService.loadSession();
          if (sess?.accessToken) {
            const userInfo = await PNOAuthService.getUserInfo(sess.accessToken);
            if (userInfo.pn_identifier && !userInfo.pn_identifier.startsWith('did:key:')) {
              PNOAuthService.saveSession({ ...sess, pnIdentifier: userInfo.pn_identifier });
              setUnlocked(userInfo.pn_identifier);
              setViewingCreatorId(userInfo.pn_identifier);
              setActiveBottomTab('index');
              setTimeout(async () => {
                try {
                  if (!userInfo.pn_identifier) return;
                  const profile = await getUserProfile(userInfo.pn_identifier);
                  if (profile.displayName) {
                    updateDisplayName(profile.displayName);
                  } else if (userInfo.nickname && !userState.preferences.displayName) {
                    updateDisplayName(userInfo.nickname);
                  }
                } catch {
                  if (userInfo.nickname && !userState.preferences.displayName) {
                    updateDisplayName(userInfo.nickname);
                  }
                }
              }, 1000);
            } else {
              showErrorToast('Unable to load your pN identifier from API');
            }
          } else {
            showErrorToast('No active session found');
          }
        } catch (error) {
          console.error('Failed to fetch pN identifier:', error);
          showErrorToast('Unable to load your pN identifier');
        }
      }
    } else {
      showErrorToast('Unlock your pN to view your profile');
    }
  }, [
    userState.isUnlocked,
    userState.pnIdentifier,
    userState.preferences.displayName,
    setViewingCreatorId,
    setActiveBottomTab,
    setShowInbox,
    setShowSearch,
    setShowUploadModal,
    setViewingBrandedFeed,
    setUnlocked,
    updateDisplayName,
    showErrorToast,
  ]);

  // Validate OAuth session on mount and sync with user state
  useEffect(() => {
    const session = PNOAuthService.loadSession();
    if (userState.isUnlocked) {
      if (!session || !PNOAuthService.isSessionValid(session)) {
        setLocked();
        PNOAuthService.clearSession();
      } else if (session.did && session.did !== userState.pnIdentifier) {
        const pnId = session.pnIdentifier || session.did;
        setUnlocked(pnId);
        if (pnId && !pnId.startsWith('did:key:')) {
          setTimeout(() => loadUserDisplayName(pnId), 500);
        }
      } else if (userState.pnIdentifier && !userState.preferences.displayName) {
        loadUserDisplayName(userState.pnIdentifier);
      }
    } else if (session && PNOAuthService.isSessionValid(session) && session.did) {
      const pnId = session.pnIdentifier || session.did;
      setUnlocked(pnId);
      if (pnId && !pnId.startsWith('did:key:')) {
        setTimeout(() => loadUserDisplayName(pnId), 500);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  const handleLockUnlock = useCallback(async () => {
    if (userState.isUnlocked) {
      setLocked();
      PNOAuthService.clearSession();
    } else {
      const redirectUri = `${window.location.origin}/oauth-callback.html`;
      let authUrl = PNOAuthService.getAuthorizationUrl({ usePopup: true });
      const authUrlObj = new URL(authUrl);
      const actualRedirectUri = authUrlObj.searchParams.get('redirect_uri') || redirectUri;

      try {
        try {
          const url = new URL(authUrl);
          url.searchParams.set('popup', 'true');
          authUrl = url.toString();
        } catch (e) {
          console.error('Failed to add popup parameter:', e);
        }

        const expectedState = new URL(authUrl).searchParams.get('state') || '';

        // Native: full-screen OAuth — oauth-callback navigates main window to /?oauth_resume=1&code=...
        if (Capacitor.isNativePlatform()) {
          const u = new URL(authUrl);
          u.searchParams.set('popup', 'false');
          window.location.href = u.toString();
          return;
        }

        let apiOrigin = '';
        try {
          const base = (API_ENDPOINT || 'https://api.parnoir.com').replace(/\/$/, '') || 'https://api.parnoir.com';
          apiOrigin = new URL(base).origin;
        } catch {
          /* use empty, postMessage from API bridge will be rejected; URL resume may still work */
        }

        const result = await startPnOAuthPopup({
          url: authUrl,
          expectedState,
          timeoutMs: 30_000,
          completeViaParentNavigation: true,
          allowedMessageOrigins: apiOrigin ? [apiOrigin] : undefined,
        });

        await runOAuthCallback(
          {
            code: result.code,
            state: result.state,
            error: result.error,
            error_description: result.error_description,
            age_shared: result.age_shared,
          },
          { redirectUri: actualRedirectUri }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'POPUP_BLOCKED') {
          showErrorToast('Popup blocked. Please allow popups for this site.');
        } else if (msg === 'POPUP_TIMEOUT') {
          setLocked();
          PNOAuthService.clearSession();
          showErrorToast('Authentication timeout. Please try again.');
        } else if (msg === 'POPUP_CLOSED') {
          setLocked();
          PNOAuthService.clearSession();
          showErrorToast('Authentication cancelled or failed. Please try again.');
        } else {
          console.error('OAuth popup error:', err);
          showErrorToast('Failed to open authentication window');
        }
      }
    }
  }, [
    userState.isUnlocked,
    userState.preferences.displayName,
    setLocked,
    setUnlocked,
    updateDisplayName,
    showErrorToast,
    discoverFilesRef,
    runOAuthCallback,
  ]);

  return { handleLockUnlock, handleMeClick, loadUserDisplayName };
}
