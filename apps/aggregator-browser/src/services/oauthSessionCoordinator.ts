/**
 * Single OAuth unlock path for browse: one token exchange + bootstrap per authorization code.
 */

import { pushPnOAuthDebug } from '@par-noir/oauth-ui';
import {
  PNOAuthService,
  type AuthSession,
  type FeedToken,
  type OAuthTokenResponse,
  type OAuthUserInfo
} from './pnOAuthService';
import { isOauthCodeConsumed, markOauthCodeConsumed } from './oauthConsumedCodes';
import { runUnlockBootstrap, type UnlockBootstrapResult } from './unlockBootstrap';

export interface OAuthUnlockPayload {
  code: string;
  redirectUri: string;
  /** typeof === 'string' means consent completed (including empty string). */
  grantedDataPoints?: string[];
}

export interface OAuthUnlockResult {
  tokenResponse: OAuthTokenResponse;
  userInfo: OAuthUserInfo;
  bootstrap: UnlockBootstrapResult;
  session: AuthSession;
  feedTokens: FeedToken[];
}

const unlockInflight = new Map<string, Promise<OAuthUnlockResult>>();

export function invalidateOAuthSessionCoordinator(): void {
  unlockInflight.clear();
}

export function isOAuthUnlockInflight(code: string): boolean {
  return unlockInflight.has(code);
}

export function getOAuthUnlockInflight(code: string): Promise<OAuthUnlockResult> | undefined {
  return unlockInflight.get(code);
}

/**
 * Exchange code once, bootstrap once. Parallel callers with the same code share one promise.
 */
export async function completeOAuthUnlock(payload: OAuthUnlockPayload): Promise<OAuthUnlockResult> {
  const { code, redirectUri, grantedDataPoints } = payload;

  if (isOauthCodeConsumed(code)) {
    const session = PNOAuthService.loadSession();
    if (session && PNOAuthService.isSessionValid(session)) {
      return buildResult(
        session,
        {
          did: session.did,
          pn_identifier: session.pnIdentifier,
          nickname: session.nickname,
          public_key: session.publicKey
        } as OAuthUserInfo,
        {
          userInfo: {
            did: session.did,
            pn_identifier: session.pnIdentifier,
            nickname: session.nickname,
            public_key: session.publicKey
          } as OAuthUserInfo,
          feedTokens: session.feedTokens ?? [],
          profileDisplayName: null,
          registry: null
        },
        session.feedTokens ?? []
      );
    }
    throw new Error('Authorization code already consumed');
  }

  const existing = unlockInflight.get(code);
  if (existing) return existing;

  let resolveWork!: (v: OAuthUnlockResult) => void;
  let rejectWork!: (e: unknown) => void;
  const work = new Promise<OAuthUnlockResult>((resolve, reject) => {
    resolveWork = resolve;
    rejectWork = reject;
  });
  unlockInflight.set(code, work);

  void (async () => {
    try {
      pushPnOAuthDebug('oauth_coordinator_exchange', {
        redirectUriLen: redirectUri.length,
        grantedCount: grantedDataPoints?.length ?? 0
      });

      const tokenResponse = await PNOAuthService.exchangeCodeForToken(code, redirectUri, grantedDataPoints);
      const userInfo = await PNOAuthService.getUserInfo(tokenResponse.access_token);

      const pnForBootstrap = userInfo.pn_identifier;
      let bootstrap: UnlockBootstrapResult;
      if (pnForBootstrap && !pnForBootstrap.startsWith('did:key:')) {
        bootstrap = await runUnlockBootstrap(tokenResponse.access_token, pnForBootstrap, userInfo);
      } else {
        bootstrap = {
          userInfo,
          feedTokens: [],
          profileDisplayName: null,
          registry: null
        };
      }

      markOauthCodeConsumed(code);

      const session: AuthSession = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: Date.now() + tokenResponse.expires_in * 1000,
        did: userInfo.did,
        nickname: userInfo.nickname,
        pnIdentifier: userInfo.pn_identifier || undefined,
        publicKey: userInfo.public_key,
        feedTokens: bootstrap.feedTokens
      };

      resolveWork(buildResult(session, userInfo, bootstrap, bootstrap.feedTokens));
    } catch (err) {
      rejectWork(err);
    } finally {
      unlockInflight.delete(code);
    }
  })();

  return work;
}

function buildResult(
  session: AuthSession,
  userInfo: OAuthUserInfo,
  bootstrap: UnlockBootstrapResult,
  feedTokens: FeedToken[]
): OAuthUnlockResult {
  return {
    tokenResponse: {
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      expires_in: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)),
      token_type: 'Bearer'
    },
    userInfo,
    bootstrap,
    session: { ...session, feedTokens },
    feedTokens
  };
}
