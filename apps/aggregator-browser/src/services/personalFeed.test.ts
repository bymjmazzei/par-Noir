/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen, mlDsa65Verify } from '@par-noir/pqc-crypto/ml-dsa';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { derivePersonalFeedKeyPair } from '@par-noir/pqc-crypto/personal-feed';
import { canonicalPersonalFeedBytes, parsePersonalFeedStatement } from '@par-noir/standard-data-points';

const root = mlDsa65Keygen(new Uint8Array(32).fill(5));
const ROOT_PN = deriveCanonicalPnIdentifier(bytesToBase64(root.publicKey));
const FEED = derivePersonalFeedKeyPair(root.secretKey, ROOT_PN);

const state = vi.hoisted(() => ({ ready: true, pn: '' }));

vi.mock('../config/buildFlags', () => ({ MESSAGING_ONLY: false }));
vi.mock('./dmIdentitySession', () => ({
  DM_IDENTITY_CHANGE_EVENT: 'pn_dm_identity_change',
  isBrowseUnlockCryptoReady: () => state.ready,
  resolveBrowseSigningKeys: () => ({
    publicKey: root.publicKey,
    secretKey: root.secretKey.slice(),
    ephemeral: false
  })
}));
vi.mock('./pnOAuthService', () => ({
  PNOAuthService: { loadSession: () => ({ pnIdentifier: state.pn }) }
}));
const apiFetch = vi.fn();
vi.mock('./ownerApiFetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ownerFetch: vi.fn(async () => ({ ok: true }))
}));
vi.mock('./sessionDrive', () => ({
  sessionDriveFor: vi.fn(async () => {
    throw new Error('cloud_on_device');
  })
}));
vi.mock('@par-noir/device-cloud-credentials', () => ({
  ensureDeviceOwnedAssetsSheet: vi.fn(),
  listDeviceOwnedAssets: vi.fn(async () => []),
  setSessionDriveIndex: vi.fn(),
  upsertDeviceOwnedAsset: vi.fn()
}));

import {
  clearPersonalFeed,
  ensurePersonalFeed,
  getPersonalFeed,
  getPersonalFeedKeys,
  installPersonalFeedBootstrap
} from './personalFeed';

function okRegistration() {
  return {
    ok: true,
    json: async () => ({
      feed: { feedId: 'feed-1', feedName: 'Personal feed' },
      assetId: 'asset-1',
      subPnIdentifier: FEED.subjectPnIdentifier
    })
  };
}

beforeEach(() => {
  state.ready = true;
  state.pn = ROOT_PN;
  apiFetch.mockReset();
  clearPersonalFeed();
});

afterEach(() => {
  clearPersonalFeed();
});

describe('ensurePersonalFeed', () => {
  it('signs a statement for the derived feed key and keeps the key in memory', async () => {
    apiFetch.mockResolvedValue(okRegistration());
    const feed = await ensurePersonalFeed();
    expect(feed).toMatchObject({ rootPn: ROOT_PN, feedId: 'feed-1', subPnIdentifier: FEED.subjectPnIdentifier });
    expect(getPersonalFeedKeys()?.publicKeyB64).toBe(FEED.publicKeyB64);

    const [method, path, body] = apiFetch.mock.calls[0] as [string, string, { statement: unknown; signature: string }];
    expect(method).toBe('POST');
    expect(path).toBe('/api/feeds/personal');
    const statement = parsePersonalFeedStatement(body.statement)!;
    expect(statement.feedPnIdentifier).toBe(FEED.subjectPnIdentifier);
    expect(
      mlDsa65Verify(
        Uint8Array.from(atob(body.signature), (c) => c.charCodeAt(0)),
        canonicalPersonalFeedBytes(statement),
        root.publicKey
      )
    ).toBe(true);
  });

  it('registers once per unlock', async () => {
    apiFetch.mockResolvedValue(okRegistration());
    await Promise.all([ensurePersonalFeed(), ensurePersonalFeed()]);
    await ensurePersonalFeed();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('does nothing while browse crypto is locked', async () => {
    state.ready = false;
    expect(await ensurePersonalFeed()).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('refuses when the signing key is not the session root', async () => {
    state.pn = 'pn-someoneelse';
    expect(await ensurePersonalFeed()).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('wipes the feed key when the identity locks', async () => {
    installPersonalFeedBootstrap();
    apiFetch.mockResolvedValue(okRegistration());
    await ensurePersonalFeed();
    state.ready = false;
    window.dispatchEvent(new CustomEvent('pn_dm_identity_change'));
    expect(getPersonalFeed()).toBeNull();
    expect(getPersonalFeedKeys()).toBeNull();
  });
});
