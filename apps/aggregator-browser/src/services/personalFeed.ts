/**
 * Personal feed sub-pN: one per pN, key derived from the root ML-DSA key.
 * Registered on first unlock with browse crypto; the derived key lives in memory only.
 */

import {
  ensureDeviceOwnedAssetsSheet,
  listDeviceOwnedAssets,
  setSessionDriveIndex,
  upsertDeviceOwnedAsset
} from '@par-noir/device-cloud-credentials';
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Sign } from '@par-noir/pqc-crypto/ml-dsa';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { derivePersonalFeedKeyPair, type PersonalFeedKeyPair } from '@par-noir/pqc-crypto/personal-feed';
import { buildPersonalFeedStatement, canonicalPersonalFeedBytes } from '@par-noir/standard-data-points';
import { MESSAGING_ONLY } from '../config/buildFlags';
import {
  DM_IDENTITY_CHANGE_EVENT,
  isBrowseUnlockCryptoReady,
  resolveBrowseSigningKeys
} from './dmIdentitySession';
import { apiFetch, ownerFetch } from './ownerApiFetch';
import { PNOAuthService } from './pnOAuthService';
import { sessionDriveFor } from './sessionDrive';

export const PERSONAL_FEED_CHANGE_EVENT = 'pn_personal_feed_change';

export interface PersonalFeedInfo {
  rootPn: string;
  feedId: string;
  feedName: string;
  assetId: string;
  subPnIdentifier: string;
}

let keys: PersonalFeedKeyPair | null = null;
let current: PersonalFeedInfo | null = null;
let inflight: Promise<PersonalFeedInfo | null> | null = null;

function notify(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PERSONAL_FEED_CHANGE_EVENT));
  }
}

function pnKey(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

function newNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getPersonalFeed(): PersonalFeedInfo | null {
  return current;
}

/** Derived feed signing keys for the unlocked session; null when locked. */
export function getPersonalFeedKeys(): PersonalFeedKeyPair | null {
  return keys;
}

export function clearPersonalFeed(): void {
  if (keys) keys.secretKey.fill(0);
  keys = null;
  const had = current !== null;
  current = null;
  inflight = null;
  if (had) notify();
}

/**
 * Register (or fetch) this pN's personal feed. No-op until browse crypto is unlocked
 * and the in-memory signing key is the session's root key.
 */
export async function ensurePersonalFeed(): Promise<PersonalFeedInfo | null> {
  if (MESSAGING_ONLY || !isBrowseUnlockCryptoReady()) return null;
  const sessionPn = PNOAuthService.loadSession()?.pnIdentifier;
  if (!sessionPn) return null;
  const rootPnSession = pnKey(sessionPn);
  if (current?.rootPn === rootPnSession) return current;
  if (inflight) return inflight;

  inflight = (async () => {
    const root = resolveBrowseSigningKeys();
    const rootPublicKey = bytesToBase64(root.publicKey);
    const rootPn = deriveCanonicalPnIdentifier(rootPublicKey);
    if (rootPn !== rootPnSession) return null;

    const feedKeys = derivePersonalFeedKeyPair(root.secretKey, rootPn);
    const statement = buildPersonalFeedStatement({
      rootPublicKey,
      feedPnIdentifier: feedKeys.subjectPnIdentifier,
      feedPublicKey: feedKeys.publicKeyB64,
      nonce: newNonce()
    });
    const signature = bytesToBase64(mlDsa65Sign(canonicalPersonalFeedBytes(statement), root.secretKey));
    const res = await apiFetch('POST', '/api/feeds/personal', { statement, signature });
    if (!res.ok) {
      feedKeys.secretKey.fill(0);
      return null;
    }
    const body = (await res.json()) as {
      feed?: { feedId?: string; feedName?: string };
      assetId?: string;
      subPnIdentifier?: string;
    };
    if (!body.feed?.feedId || !body.assetId || body.subPnIdentifier !== feedKeys.subjectPnIdentifier) {
      feedKeys.secretKey.fill(0);
      return null;
    }
    keys = feedKeys;
    current = {
      rootPn,
      feedId: body.feed.feedId,
      feedName: body.feed.feedName || 'Personal feed',
      assetId: body.assetId,
      subPnIdentifier: body.subPnIdentifier
    };
    void writeOwnedAssetRow(current).catch(() => {
      /* Drive row is retried on the next unlock */
    });
    notify();
    return current;
  })()
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Device writes the Drive owned-asset row; the API only keeps the Postgres cache. */
async function writeOwnedAssetRow(feed: PersonalFeedInfo): Promise<void> {
  const drive = await sessionDriveFor(feed.rootPn);
  let spreadsheetId = drive.index.sheetIds['owned-assets'];
  if (!spreadsheetId) {
    spreadsheetId = await ensureDeviceOwnedAssetsSheet(drive.accessToken, drive.index.metadataFolderId);
    const next = { ...drive.index, sheetIds: { ...drive.index.sheetIds, 'owned-assets': spreadsheetId } };
    setSessionDriveIndex(feed.rootPn, next);
    await ownerFetch(
      'POST',
      `/api/storage/initialize/${encodeURIComponent(feed.rootPn)}`,
      { pnDriveIndex: next },
      { pnIdentifier: feed.rootPn }
    );
  }
  const existing = (await listDeviceOwnedAssets(drive.accessToken, spreadsheetId)).find(
    (a) => a.id === feed.assetId
  );
  if (existing?.status === 'active' && existing.subjectPnIdentifier === feed.subPnIdentifier) return;
  const now = new Date().toISOString();
  await upsertDeviceOwnedAsset(drive.accessToken, spreadsheetId, {
    id: feed.assetId,
    rootPnIdentifier: feed.rootPn,
    subjectPnIdentifier: feed.subPnIdentifier,
    kind: 'feed',
    status: 'active',
    metadata: { feedId: feed.feedId, tier: 'personal', label: feed.feedName },
    apiKeyId: null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    revokedAt: null
  });
}

let installed = false;

/** Follow unlock/lock: register when browse crypto appears, wipe the key when it goes. */
export function installPersonalFeedBootstrap(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener(DM_IDENTITY_CHANGE_EVENT, () => {
    if (!isBrowseUnlockCryptoReady()) {
      clearPersonalFeed();
      return;
    }
    void ensurePersonalFeed();
  });
}
