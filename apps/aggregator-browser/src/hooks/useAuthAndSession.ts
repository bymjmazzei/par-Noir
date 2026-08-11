/**
 * OAuth popup, lock/unlock, Me click, and session validation.
 * Auth/session behavior is isolated here.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  pushPnOAuthDebug,
  startPnOAuthPopup,
  PN_OAUTH_STORAGE_LATEST_KEY,
  PN_OAUTH_STORAGE_PENDING,
  PN_OAUTH_RESUME_HASH_KEY,
  parseMessagingIdentityFromHash,
} from '@par-noir/oauth-ui';
import { useUserState } from '../contexts/UserStateContext';
import { PNOAuthService, PN_OAUTH_SESSION_DEAD_EVENT } from '../services/pnOAuthService';
import { getUserProfile } from '../services/profileService';
import { API_ENDPOINT } from '../config/api';
import { PN_OAUTH_RESUME_SEARCH_KEY } from '../oauthResumeBootstrap';
import { installOAuthMessagingIdentityListener } from '../services/oauthMessagingIdentityBridge';
import {
  clearDmIdentity,
  isDmIdentityReady,
  hasStoredEncryptedIdentity,
} from '../services/dmIdentitySession';
import { registerMessagingReconnect } from '../services/messagingReconnect';
import { disconnectRealtimeSync } from '../services/realtimeSyncService';
import type { Feed, MetadataFilters } from '../types/aggregator';
import {
  applyAllMessagingHandoffSources,
  applyMessagingOAuthHandoff,
  MESSAGING_HANDOFF_INCOMPLETE,
  messagingHandoffIncompleteMessage,
  restoreMessagingAfterOAuth,
  waitForAndApplyMessagingHandoff,
} from '../services/messagingOAuthHandoff';
import { MESSAGING_ONLY } from '../config/buildFlags';

/**
 * oauth-callback.html may hand off via `opener.location.replace(/?oauth_resume=1&code=...)`.
 * The page reloads and saves the session there, while `startPnOAuthPopup` in the old document
 * often rejects with POPUP_CLOSED (no postMessage). Poll until the new session appears.
 */

type OAuthCallbackStoragePayload = {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
  granted_data_points?: string;
  timestamp?: number;
  messagingHandoff?: unknown;
};

function findNewestOAuthCallbackPayload(): { key: string; data: OAuthCallbackStoragePayload } | null {
  const callbackKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith('pn_oauth_callback_')) callbackKeys.push(k);
  }
  if (callbackKeys.length === 0) return null;

  callbackKeys.sort((a, b) => {
    const at = Number(a.replace('pn_oauth_callback_', ''));
    const bt = Number(b.replace('pn_oauth_callback_', ''));
    return bt - at;
  });

  for (const key of callbackKeys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as OAuthCallbackStoragePayload;
      const ts = Number(data.timestamp);
      if (Number.isFinite(ts) && Date.now() - ts > 120_000) continue;
      if (data.code || data.error) return { key, data };
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Popup may close before postMessage arrives; oauth-callback.html writes pn_oauth_callback_* first.
 * Poll storage and session together instead of waiting only on session.
 */
async function recoverAfterPopupClosed(
  runOAuthCallback: (
    data: OAuthCallbackStoragePayload,
    options?: { redirectUri?: string }
  ) => Promise<void>,
  redirectUri: string,
  maxMs = 30_000
): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  let consumedStorageKey: string | null = null;

  const oauthSessionReady = (): boolean => {
    const session = PNOAuthService.loadSession();
    return !!(session && PNOAuthService.isSessionValid(session) && session.did);
  };

  while (Date.now() < deadline) {
    if (oauthSessionReady()) {
      return true;
    }

    const payload = findNewestOAuthCallbackPayload();
    if (payload && payload.key !== consumedStorageKey) {
      consumedStorageKey = payload.key;
      pushPnOAuthDebug('popup_closed_storage_fallback', {
        hasCode: Boolean(payload.data.code),
        hasError: Boolean(payload.data.error),
      });
      try {
        localStorage.removeItem(payload.key);
        localStorage.removeItem(PN_OAUTH_STORAGE_LATEST_KEY);
        localStorage.removeItem(PN_OAUTH_STORAGE_PENDING);
      } catch {
        /* ignore */
      }
      try {
        await runOAuthCallback(payload.data, { redirectUri });
      } catch {
        /* runOAuthCallback surfaces toast for messaging handoff failures */
      }
      if (oauthSessionReady()) {
        return true;
      }
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  return false;
}

export interface UseAuthAndSessionParams {
  setViewingCreatorId: (id: string | null) => void;
  setActiveBottomTab: (tab: 'home' | 'search' | 'upload' | 'index' | 'messages') => void;
  setShowInbox: (v: boolean) => void;
  setShowSearch: (v: boolean) => void;
  setShowUploadModal: (v: boolean) => void;
  setViewingBrandedFeed: (feed: Feed | null) => void;
  showErrorToast: (msg: string) => void;
  discoverFilesRef: React.MutableRefObject<((filters?: MetadataFilters, reset?: boolean, page?: number, append?: boolean) => Promise<void>) | null>;
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
  /** Serialize token exchange per authorization code (postMessage + storage recovery + URL resume). */
  const oauthCallbackInflightRef = useRef<Map<string, Promise<void>>>(new Map());

  const redirectUriForOAuth = `${typeof window !== 'undefined' ? window.location.origin : ''}/oauth-callback.html`;

  const runOAuthCallback = useCallback(
    async (
      data: {
        code?: string;
        state?: string;
        error?: string;
        error_description?: string;
        granted_data_points?: string;
        messagingHandoff?: unknown;
      },
      options?: { popup?: Window | null; redirectUri?: string }
    ) => {
      pushPnOAuthDebug('run_oauth_callback_start', {
        hasError: Boolean(data.error),
        hasCode: Boolean(data.code),
        viaPopupOption: Boolean(options?.popup),
      });

      if (data.error) {
        pushPnOAuthDebug('run_oauth_callback_denied', {
          errorKey: data.error ? String(data.error).slice(0, 80) : '',
        });
        setLocked();
        clearDmIdentity();
        PNOAuthService.clearSession();
        showErrorToast(data.error_description || data.error || 'Authentication denied');
        return;
      }
      if (!data.code) {
        pushPnOAuthDebug('run_oauth_callback_no_code', {});
        return;
      }

      const inflight = oauthCallbackInflightRef.current.get(data.code);
      if (inflight) {
        pushPnOAuthDebug('run_oauth_callback_await_inflight', {});
        await inflight;
        const session = PNOAuthService.loadSession();
        if (
          session &&
          PNOAuthService.isSessionValid(session) &&
          session.did &&
          isDmIdentityReady()
        ) {
          const pnId = session.pnIdentifier || session.did;
          setUnlocked(pnId);
          restoreMessagingAfterOAuth();
          if (!MESSAGING_ONLY && discoverFilesRef.current) {
            discoverFilesRef.current(undefined, true);
          }
        }
        return;
      }

      const exchangeRedirectUri = options?.redirectUri ?? redirectUriForOAuth;

      const work = (async () => {
        try {
          // Apply handoff from popup result first (consent may post oauth_callback+messagingHandoff
          // from the API origin before redirect). Do this before token exchange.
          applyAllMessagingHandoffSources(data.messagingHandoff);
          if (!isDmIdentityReady() && data.messagingHandoff) {
            await waitForAndApplyMessagingHandoff(3_000);
            applyAllMessagingHandoffSources(data.messagingHandoff);
          }

          // Absent means consent was skipped; empty string means "shared nothing"
          const grantedDataPoints =
            typeof data.granted_data_points === 'string'
              ? data.granted_data_points.split(',').filter(Boolean)
              : undefined;
          pushPnOAuthDebug('run_oauth_callback_exchange', {
            redirectUriLen: exchangeRedirectUri.length,
            messagingReadyBeforeExchange: isDmIdentityReady(),
            hasMessagingHandoffPayload: Boolean(data.messagingHandoff),
          });
          const tokenResponse = await PNOAuthService.exchangeCodeForToken(
            data.code!,
            exchangeRedirectUri,
            grantedDataPoints
          );

          // The exchange above runs before the cloud vault is hydrated, so under
          // device cloud custody the server cannot write the grant yet. Hold the
          // choice until a Drive token exists, or the next unlock re-prompts.
          // typeof === 'string' (including "") means consent completed; absent means skipped.
          const consentCompleted = typeof data.granted_data_points === 'string';
          if (consentCompleted) {
            const { setPendingGrant } = await import('../services/pendingGrantPersist');
            setPendingGrant(grantedDataPoints ?? []);
          }
          const userInfo = await PNOAuthService.getUserInfo(tokenResponse.access_token);
          // Grant persist waits for AggregatorCloudReconnectHost after vault hydrate + Drive mint.
          // Early flush here only produced no_account noise before Drive was ready.

          if (!isDmIdentityReady()) {
            await waitForAndApplyMessagingHandoff(20_000);
            applyAllMessagingHandoffSources(data.messagingHandoff);
          }

          pushPnOAuthDebug('run_oauth_callback_messaging_gate', {
            messagingReady: isDmIdentityReady(),
          });

          if (!isDmIdentityReady()) {
            setLocked();
            clearDmIdentity();
            PNOAuthService.clearSession();
            showErrorToast(messagingHandoffIncompleteMessage());
            throw new Error(MESSAGING_HANDOFF_INCOMPLETE);
          }

        let feedTokens: import('../services/pnOAuthService').FeedToken[] = [];
        try {
          if (!MESSAGING_ONLY && userInfo.pn_identifier) {
            const feedTokensResponse = await fetch(`${API_ENDPOINT}/api/feeds/tokens`, {
              headers: {
                Authorization: `Bearer ${tokenResponse.access_token}`,
                Accept: 'application/json'
              }
            });
            if (feedTokensResponse.ok) {
              const feedTokensData = await feedTokensResponse.json();
              const raw = feedTokensData.feedTokens;
              if (Array.isArray(raw)) {
                feedTokens = raw.filter(
                  (t: unknown): t is import('../services/pnOAuthService').FeedToken =>
                    !!t &&
                    typeof t === 'object' &&
                    typeof (t as { feedId?: unknown }).feedId === 'string' &&
                    typeof (t as { feedName?: unknown }).feedName === 'string' &&
                    typeof (t as { subPnIdentifier?: unknown }).subPnIdentifier === 'string'
                );
              }
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
          nickname: userInfo.nickname,
          pnIdentifier: userInfo.pn_identifier || undefined,
          publicKey: userInfo.public_key,
          feedTokens,
        };
        PNOAuthService.saveSession(sessionWithIdentifier);

        try {
          const { retryPublishMlKemPublicKey } = await import('../services/dmIdentitySession');
          void retryPublishMlKemPublicKey();
        } catch {
          /* non-fatal */
        }

        if (userInfo.pn_identifier && !userInfo.pn_identifier.startsWith('did:key:')) {
          setUnlocked(userInfo.pn_identifier);
          try {
            const { wireLocalDeviceProofSigner } = await import('../services/deviceService');
            await wireLocalDeviceProofSigner(userInfo.pn_identifier, tokenResponse.access_token);
          } catch {
            /* non-fatal — messaging may prompt to key device */
          }
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

        // Discovery already runs on mount; avoid forced triple metadata-index refresh on unlock.
        pushPnOAuthDebug('run_oauth_callback_success', {
          hasPnIdentifier: Boolean(userInfo.pn_identifier),
        });
        } catch (err) {
          pushPnOAuthDebug('run_oauth_callback_exception', {
            name: err instanceof Error ? err.name : 'unknown',
          });
          if (err instanceof Error && err.message === MESSAGING_HANDOFF_INCOMPLETE) {
            throw err;
          }
          setLocked();
          clearDmIdentity();
          PNOAuthService.clearSession();
          const rawMessage = err instanceof Error ? err.message : String(err);
          const safeMessage = rawMessage ? rawMessage.slice(0, 180) : 'Authentication failed';
          showErrorToast(safeMessage);
          throw err;
        }
      })();

      oauthCallbackInflightRef.current.set(data.code, work);
      try {
        await work;
      } finally {
        oauthCallbackInflightRef.current.delete(data.code);
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

  /** Android/Capacitor / Chrome opener nav: main window loads /?oauth_resume=1&code=... after popup OAuth */
  useEffect(() => {
    const storedSearch = sessionStorage.getItem(PN_OAUTH_RESUME_SEARCH_KEY);
    const search = storedSearch ?? window.location.search;
    const params = new URLSearchParams(search);
    if (params.get('oauth_resume') !== '1') return;

    pushPnOAuthDebug('oauth_resume_effect', {
      source: storedSearch ? 'sessionStorage' : 'location',
      searchLen: search.length,
    });

    const code = params.get('code');
    const error = params.get('error');
    const state = params.get('state');
    const granted_data_points = params.get('granted_data_points');
    const error_description = params.get('error_description') || undefined;

    const resumeHash =
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PN_OAUTH_RESUME_HASH_KEY)) ||
      window.location.hash;
    const identityFromHash = parseMessagingIdentityFromHash(resumeHash);
    if (identityFromHash) {
      applyMessagingOAuthHandoff({ v: 1, timestamp: Date.now(), identity: identityFromHash });
    }

    const clearOAuthQuery = () => {
      window.history.replaceState({}, '', window.location.pathname);
    };

    void (async () => {
      try {
        pushPnOAuthDebug('oauth_resume_before_exchange', {
          hasCode: Boolean(code),
          hasError: Boolean(error),
        });
        await runOAuthCallback(
          {
            code: code || undefined,
            state: state || undefined,
            error: error || undefined,
            error_description,
            granted_data_points: granted_data_points ?? undefined,
          },
          {}
        );
      } finally {
        pushPnOAuthDebug('oauth_resume_replace_state', {});
        try {
          sessionStorage.removeItem(PN_OAUTH_RESUME_SEARCH_KEY);
          sessionStorage.removeItem(PN_OAUTH_RESUME_HASH_KEY);
        } catch {
          /* ignore */
        }
        clearOAuthQuery();
      }
    })();
  }, [runOAuthCallback]);

  /**
   * Recovery path: if callback payload is written to storage but popup handshake
   * path is missed, consume it directly from parent and complete token exchange.
   */
  useEffect(() => {
    let mounted = true;

    const tryConsumePendingOAuthStorage = async () => {
      if (!mounted) return;
      try {
        const latestKey = localStorage.getItem(PN_OAUTH_STORAGE_LATEST_KEY);
        if (!latestKey) return;
        const raw = localStorage.getItem(latestKey);
        if (!raw) return;
        const data = JSON.parse(raw) as {
          type?: string;
          code?: string;
          state?: string;
          error?: string;
          error_description?: string;
          granted_data_points?: string;
          timestamp?: number;
          messagingHandoff?: unknown;
        };
        if (data.type !== 'oauth_callback') return;
        const code = data.code;
        const err = data.error;
        if (!code && !err) return;
        if (code && oauthCallbackInflightRef.current.has(code)) return;
        const ts = Number(data.timestamp);
        if (Number.isFinite(ts) && Date.now() - ts > 120_000) return;

        pushPnOAuthDebug('storage_recovery_consume', {
          hasCode: Boolean(code),
          hasError: Boolean(err),
        });

        try {
          localStorage.removeItem(latestKey);
          localStorage.removeItem(PN_OAUTH_STORAGE_LATEST_KEY);
          localStorage.removeItem(PN_OAUTH_STORAGE_PENDING);
        } catch {
          /* ignore */
        }

        await runOAuthCallback(
          {
            code: code || undefined,
            state: data.state || undefined,
            error: err || undefined,
            error_description: data.error_description || undefined,
            granted_data_points: data.granted_data_points ?? undefined,
            messagingHandoff: data.messagingHandoff,
          },
          { redirectUri: redirectUriForOAuth }
        );
      } catch {
        /* ignore */
      }
    };

    // Immediate check + short poll for handshake races.
    void tryConsumePendingOAuthStorage();
    const id = window.setInterval(() => {
      void tryConsumePendingOAuthStorage();
    }, 500);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [redirectUriForOAuth, runOAuthCallback]);

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
    const sessionValid = session && PNOAuthService.isSessionValid(session);
    if (sessionValid) {
      restoreMessagingAfterOAuth();
      if (!isDmIdentityReady()) {
        setLocked();
        clearDmIdentity();
        PNOAuthService.clearSession();
        return;
      }
    }
    if (userState.isUnlocked) {
      if (!sessionValid) {
        setLocked();
        clearDmIdentity();
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
    } else if (sessionValid && session.did) {
      if (!isDmIdentityReady()) {
        setLocked();
        clearDmIdentity();
        PNOAuthService.clearSession();
        return;
      }
      const pnId = session.pnIdentifier || session.did;
      setUnlocked(pnId);
      if (pnId && !pnId.startsWith('did:key:')) {
        setTimeout(() => loadUserDisplayName(pnId), 500);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => installOAuthMessagingIdentityListener(), []);

  const runOAuthPopupUnlock = useCallback(
    async () => {
      restoreMessagingAfterOAuth();

      const redirectUri = `${window.location.origin}/oauth-callback.html`;
      let authUrl = PNOAuthService.getAuthorizationUrl({
        usePopup: true,
        // Permissions skip is independent of messaging handoff (unlock step always stashes keys).
        identityHandoffRequired: false,
      });
      const authUrlObj = new URL(authUrl);
      const actualRedirectUri = authUrlObj.searchParams.get('redirect_uri') || redirectUri;

      try {
        const url = new URL(authUrl);
        url.searchParams.set('popup', 'true');
        authUrl = url.toString();
      } catch (e) {
        console.error('Failed to add popup parameter:', e);
      }

      const expectedState = new URL(authUrl).searchParams.get('state') || '';

      pushPnOAuthDebug('lock_unlock_popup_open', {
        expectedStateLen: expectedState.length,
      });

      if (Capacitor.isNativePlatform()) {
        const u = new URL(authUrl);
        u.searchParams.set('popup', 'false');
        window.location.href = u.toString();
        return;
      }

      const result = await startPnOAuthPopup({
        url: authUrl,
        expectedState,
        timeoutMs: 120_000,
        completeViaParentNavigation: false,
        // Messaging gate lives in runOAuthCallback (token exchange + wait loop).
        // Blocking the popup on handoff causes POPUP_CLOSED when the callback tab closes first.
        requireMessagingHandoff: false,
        isMessagingReady: () => isDmIdentityReady(),
        messagingHandoffTimeoutMs: 15_000,
        // Consent posts messaging keys from the API origin before redirecting to callback.
        allowedMessageOrigins: (() => {
          try {
            return [new URL(API_ENDPOINT).origin];
          } catch {
            return [];
          }
        })(),
      });

      if (!result.code && !result.error) {
        pushPnOAuthDebug('lock_unlock_popup_empty_result', {});
        setLocked();
        PNOAuthService.clearSession();
        showErrorToast('Sign-in did not complete. Please try again.');
        return;
      }

      pushPnOAuthDebug('lock_unlock_popup_got_result', {
        hasCode: Boolean(result.code),
        hasError: Boolean(result.error),
      });

      await runOAuthCallback(
        {
          code: result.code,
          state: result.state,
          error: result.error,
          error_description: result.error_description,
          granted_data_points: result.granted_data_points,
          messagingHandoff: result.messagingHandoff,
        },
        { redirectUri: actualRedirectUri }
      );
    },
    [runOAuthCallback, setLocked, setUnlocked, showErrorToast]
  );

  const reconnectPnForMessaging = useCallback(async () => {
    restoreMessagingAfterOAuth();
    if (isDmIdentityReady()) return;

    if (hasStoredEncryptedIdentity()) {
      window.dispatchEvent(new CustomEvent('pn_show_dm_unlock_modal'));
      return;
    }

    setLocked();
    clearDmIdentity();
    PNOAuthService.clearSession();
    showErrorToast('Lock and unlock your pN to restore messaging keys.');
  }, [setLocked, showErrorToast]);

  useEffect(() => registerMessagingReconnect(reconnectPnForMessaging), [reconnectPnForMessaging]);

  /** Full teardown when OAuth cannot be recovered (same as manual lock). */
  const applyAuthDeathLock = useCallback(async () => {
    const pn = userState.pnIdentifier;
    try {
      const { wipeAggregatorCloudOnLock } = await import('../components/AggregatorCloudReconnectHost');
      await wipeAggregatorCloudOnLock(pn);
    } catch {
      /* ignore */
    }
    disconnectRealtimeSync();
    setLocked();
    clearDmIdentity();
    PNOAuthService.clearSession();
  }, [setLocked, userState.pnIdentifier]);

  useEffect(() => {
    const onSessionDead = () => {
      void applyAuthDeathLock();
    };
    window.addEventListener(PN_OAUTH_SESSION_DEAD_EVENT, onSessionDead);
    return () => window.removeEventListener(PN_OAUTH_SESSION_DEAD_EVENT, onSessionDead);
  }, [applyAuthDeathLock]);

  // On return from idle: refresh/validate token; unrecoverable → session-dead event → lock
  useEffect(() => {
    if (!userState.isUnlocked) return;
    const revalidate = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        const token = await PNOAuthService.getValidAccessToken();
        if (!token) {
          // Event may already have fired; ensure UI locks if session was already cleared
          void applyAuthDeathLock();
        }
      })();
    };
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('focus', revalidate);
    return () => {
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('focus', revalidate);
    };
  }, [userState.isUnlocked, applyAuthDeathLock]);

  const handleLockUnlock = useCallback(async () => {
    if (userState.isUnlocked) {
      await applyAuthDeathLock();
    } else {
      try {
        await runOAuthPopupUnlock();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        pushPnOAuthDebug('lock_unlock_popup_catch', { msg });
        if (msg === 'POPUP_BLOCKED') {
          showErrorToast('Popup blocked. Please allow popups for this site.');
        } else if (msg === 'POPUP_TIMEOUT') {
          setLocked();
          PNOAuthService.clearSession();
          showErrorToast('Authentication timeout. Please try again.');
        } else if (msg === 'POPUP_CLOSED') {
          pushPnOAuthDebug('popup_closed_recovery_start', {});
          const recovered = await recoverAfterPopupClosed(
            runOAuthCallback,
            redirectUriForOAuth,
            30_000
          );
          if (recovered) {
            pushPnOAuthDebug('popup_closed_recovered', {});
            const session = PNOAuthService.loadSession()!;
            if (!isDmIdentityReady()) {
              setLocked();
              clearDmIdentity();
              PNOAuthService.clearSession();
              showErrorToast(messagingHandoffIncompleteMessage());
              return;
            }
            const pnId = session.pnIdentifier || session.did;
            setUnlocked(pnId);
            if (pnId && !pnId.startsWith('did:key:')) {
              setTimeout(() => loadUserDisplayName(pnId), 500);
            }
            if (!MESSAGING_ONLY && discoverFilesRef.current) {
              discoverFilesRef.current(undefined, true);
            }
            return;
          }
          setLocked();
          PNOAuthService.clearSession();
          showErrorToast('Popup closed before sign-in completed. Please try again.');
        } else if (msg === 'MESSAGING_HANDOFF_INCOMPLETE') {
          setLocked();
          clearDmIdentity();
          PNOAuthService.clearSession();
          // Toast already shown in runOAuthCallback
        } else if (msg === 'OAUTH_STATE_MISMATCH') {
          setLocked();
          PNOAuthService.clearSession();
          showErrorToast('Sign-in session mismatch. Close other tabs and try again.');
        } else if (msg === 'OAUTH_STATE_MISSING') {
          setLocked();
          PNOAuthService.clearSession();
          showErrorToast('Sign-in data was incomplete. Please try again.');
        } else {
          console.error('OAuth popup error:', err);
          showErrorToast('Failed to open authentication window');
        }
      }
    }
  }, [
    userState.isUnlocked,
    applyAuthDeathLock,
    runOAuthPopupUnlock,
    runOAuthCallback,
    setLocked,
    setUnlocked,
    showErrorToast,
    discoverFilesRef,
    loadUserDisplayName,
    redirectUriForOAuth,
  ]);

  return { handleLockUnlock, handleMeClick, loadUserDisplayName };
}
