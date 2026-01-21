/**
 * OAuth popup, lock/unlock, Me click, and session validation.
 * Auth/session behavior is isolated here.
 */

import { useCallback, useEffect, useRef } from 'react';
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

        const popup = window.open(authUrl, 'pn-oauth', 'width=500,height=600,scrollbars=yes,resizable=yes');
        if (!popup) {
          showErrorToast('Popup blocked. Please allow popups for this site.');
          return;
        }

        const processedCodes = new Set<string>();

        const handleOAuthCallback = (data: {
          code?: string;
          state?: string;
          error?: string;
          error_description?: string;
          age_shared?: string;
        }) => {
          if (data.code) {
            if (processedCodes.has(data.code)) return;
            processedCodes.add(data.code);
            (async () => {
              try {
                const ageShared = data.age_shared === 'true';
                const tokenResponse = await PNOAuthService.exchangeCodeForToken(
                  data.code!,
                  actualRedirectUri,
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
                processedCodes.delete(data.code!);
                setLocked();
                PNOAuthService.clearSession();
                showErrorToast('Authentication failed. Please try again.');
              }
            })();
          } else if (data.error) {
            setLocked();
            PNOAuthService.clearSession();
            showErrorToast(data.error_description || 'Authentication denied');
          }

          if (popup && !popup.closed) {
            try {
              popup.close();
              [10, 50, 100, 200].forEach((ms, i) =>
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

          window.removeEventListener('message', messageListener);
          window.removeEventListener('storage', storageListener);
        };

        const messageListener = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          if (event.data?.type === 'oauth_callback') handleOAuthCallback(event.data);
        };

        const storageListener = (event: StorageEvent) => {
          if (event.key === 'pn_oauth_callback' && event.newValue) {
            try {
              const data = JSON.parse(event.newValue);
              if (data.type === 'oauth_callback') {
                handleOAuthCallback(data);
                localStorage.removeItem('pn_oauth_callback');
              }
            } catch (e) {
              console.error('Failed to parse OAuth callback from localStorage:', e);
            }
          }
        };

        window.addEventListener('message', messageListener);
        window.addEventListener('storage', storageListener);

        let callbackFound = false;
        let checkPopupInterval: ReturnType<typeof setInterval>;
        let timeoutId: ReturnType<typeof setTimeout>;

        const pollInterval = setInterval(() => {
          if (callbackFound) return;
          const pending = localStorage.getItem('pn_oauth_pending');
          const latestKey = localStorage.getItem('pn_oauth_latest_key');
          if (pending === 'true' && latestKey) {
            const stored = localStorage.getItem(latestKey);
            if (stored) {
              try {
                const data = JSON.parse(stored);
                const age = Date.now() - (data.timestamp || 0);
                if (data.timestamp && age < 30000) {
                  callbackFound = true;
                  clearInterval(pollInterval);
                  clearInterval(checkPopupInterval!);
                  clearTimeout(timeoutId!);
                  localStorage.removeItem('pn_oauth_pending');
                  localStorage.removeItem('pn_oauth_latest_key');
                  localStorage.removeItem(latestKey);
                  handleOAuthCallback(data);
                  if (popup && !popup.closed) {
                    for (let i = 0; i < 10; i++) {
                      setTimeout(() => {
                        try {
                          if (popup && !popup.closed) popup.close();
                        } catch {}
                      }, i * 50);
                    }
                  }
                  window.removeEventListener('message', messageListener);
                  window.removeEventListener('storage', storageListener);
                }
              } catch (e) {
                console.error('Failed to parse OAuth callback:', e);
              }
            }
          }
        }, 50);

        let popupClosedTime: number | null = null;
        checkPopupInterval = setInterval(() => {
          try {
            if (popup.closed && callbackFound) {
              clearInterval(checkPopupInterval);
              clearTimeout(timeoutId);
            } else if (popup.closed && !callbackFound) {
              if (popupClosedTime === null) popupClosedTime = Date.now();
              if (popupClosedTime && Date.now() - popupClosedTime > 3000) {
                callbackFound = true;
                clearInterval(pollInterval);
                clearInterval(checkPopupInterval);
                clearTimeout(timeoutId);
                window.removeEventListener('message', messageListener);
                window.removeEventListener('storage', storageListener);
                localStorage.removeItem('pn_oauth_pending');
                localStorage.removeItem('pn_oauth_latest_key');
                setLocked();
                PNOAuthService.clearSession();
                showErrorToast('Authentication cancelled or failed. Please try again.');
              }
            }
          } catch {}
        }, 500);

        timeoutId = setTimeout(() => {
          if (!callbackFound) {
            clearInterval(pollInterval);
            clearInterval(checkPopupInterval);
            window.removeEventListener('message', messageListener);
            window.removeEventListener('storage', storageListener);
            localStorage.removeItem('pn_oauth_pending');
            localStorage.removeItem('pn_oauth_latest_key');
            setLocked();
            PNOAuthService.clearSession();
            showErrorToast('Authentication timeout. Please try again.');
          }
        }, 30000);
      } catch (err) {
        console.error('OAuth redirect error:', err);
        showErrorToast('Failed to open authentication window');
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
  ]);

  return { handleLockUnlock, handleMeClick, loadUserDisplayName };
}
