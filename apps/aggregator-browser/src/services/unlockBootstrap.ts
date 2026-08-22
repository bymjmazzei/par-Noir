/**
 * Single unlock bootstrap: userinfo, feed tokens, profile, device registry wire.
 */

import { API_ENDPOINT } from '../config/api';
import { MESSAGING_ONLY } from '../config/buildFlags';
import { PNOAuthService, type FeedToken, type OAuthUserInfo } from './pnOAuthService';
import { getUserProfile } from './profileService';
import { fetchDeviceRegistry, wireLocalDeviceProofSigner, type DeviceRegistrySummary } from './deviceService';

export interface UnlockBootstrapResult {
  userInfo: OAuthUserInfo;
  feedTokens: FeedToken[];
  profileDisplayName: string | null;
  registry: DeviceRegistrySummary | null;
}

const inflight = new Map<string, Promise<UnlockBootstrapResult>>();

export function invalidateUnlockBootstrap(): void {
  inflight.clear();
}

function bootstrapKey(pnIdentifier: string, accessToken: string): string {
  return `${pnIdentifier}:${accessToken.slice(0, 20)}`;
}

/**
 * Run once per unlock session; parallel callers share the same promise.
 */
export async function runUnlockBootstrap(
  accessToken: string,
  pnIdentifier: string,
  existingUserInfo?: OAuthUserInfo
): Promise<UnlockBootstrapResult> {
  const key = bootstrapKey(pnIdentifier, accessToken);
  const existing = inflight.get(key);
  if (existing) return existing;

  const work = (async (): Promise<UnlockBootstrapResult> => {
    const userInfo = existingUserInfo ?? (await PNOAuthService.getUserInfo(accessToken));

    const [feedTokens, profile, registry] = await Promise.all([
      loadFeedTokens(accessToken, userInfo.pn_identifier),
      loadOwnProfileDisplayName(userInfo.pn_identifier),
      loadRegistryAndWire(pnIdentifier, accessToken)
    ]);

    return { userInfo, feedTokens, profileDisplayName: profile, registry };
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, work);
  return work;
}

async function loadFeedTokens(
  accessToken: string,
  pnIdentifier: string | undefined
): Promise<FeedToken[]> {
  if (MESSAGING_ONLY || !pnIdentifier) return [];
  try {
    const res = await fetch(`${API_ENDPOINT}/api/feeds/tokens`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data.feedTokens;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (t: unknown): t is FeedToken =>
        !!t &&
        typeof t === 'object' &&
        typeof (t as { feedId?: unknown }).feedId === 'string' &&
        typeof (t as { feedName?: unknown }).feedName === 'string' &&
        typeof (t as { subPnIdentifier?: unknown }).subPnIdentifier === 'string'
    );
  } catch {
    return [];
  }
}

async function loadOwnProfileDisplayName(pnIdentifier: string | undefined): Promise<string | null> {
  if (!pnIdentifier || pnIdentifier.startsWith('did:key:')) return null;
  try {
    const profile = await getUserProfile(pnIdentifier);
    return profile.displayName ?? null;
  } catch {
    return null;
  }
}

async function loadRegistryAndWire(
  pnIdentifier: string,
  accessToken: string
): Promise<DeviceRegistrySummary | null> {
  try {
    await wireLocalDeviceProofSigner(pnIdentifier, accessToken);
  } catch {
    /* non-fatal */
  }
  try {
    return await fetchDeviceRegistry(pnIdentifier, accessToken);
  } catch {
    return null;
  }
}
