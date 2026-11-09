/**
 * @jest-environment node
 *
 * Personal feed registration: the root signs a statement binding the derived feed key,
 * one personal feed per pN, repeat calls are idempotent, and a new feed key re-keys the
 * same feed in place.
 */

import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen, mlDsa65Sign } from '@par-noir/pqc-crypto/ml-dsa';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { derivePersonalFeedKeyPair } from '@par-noir/pqc-crypto/personal-feed';
import {
  buildPersonalFeedStatement,
  canonicalPersonalFeedBytes,
  type PersonalFeedStatement
} from '@par-noir/standard-data-points';

type Row = Record<string, unknown>;
const feeds: Row[] = [];
const assets: Row[] = [];
const queries: string[] = [];

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push(sql);
      if (sql.includes('FROM feeds WHERE owner_pn_identifier')) {
        return { rows: feeds.filter((f) => f.owner_pn_identifier === params[0]) };
      }
      if (sql.includes('INSERT INTO feeds')) {
        const row = {
          feed_id: `feed-${feeds.length + 1}`,
          feed_name: params[0],
          creator_did: params[1],
          creator_tier: 'personal',
          status: 'active',
          sub_pn_identifier: params[2],
          owner_pn_identifier: params[1],
          branding: {},
          subscriber_count: 0,
          post_count: 0,
          created_at: 'now',
          updated_at: 'now'
        };
        feeds.push(row);
        return { rows: [row] };
      }
      if (sql.includes('UPDATE feeds SET sub_pn_identifier')) {
        const row = feeds.find((f) => f.feed_id === params[0])!;
        row.sub_pn_identifier = params[1];
        return { rows: [row] };
      }
      if (sql.includes('FROM pn_owned_assets')) {
        return {
          rows: assets.filter(
            (a) =>
              (a.kind === 'feed' && (a.metadata as Row).feedId === params[0]) ||
              a.subject_pn_identifier === params[1]
          )
        };
      }
      if (sql.includes('INSERT INTO pn_owned_assets')) {
        const existing = assets.find((a) => a.id === params[0]);
        const next = {
          id: params[0],
          root_pn_identifier: params[1],
          subject_pn_identifier: params[2],
          kind: 'feed',
          metadata: JSON.parse(String(params[3])),
          subject_public_key: params[4]
        };
        if (existing) Object.assign(existing, next);
        else assets.push(next);
        return { rows: [] };
      }
      return { rows: [] };
    })
  })
}));

jest.mock('./auditService', () => ({ appendAuditEvent: jest.fn(async () => undefined) }));
jest.mock('./identitySuccessionService', () => ({ isPnRevokedForNetwork: () => false }));
jest.mock('./ownedAssetStorageService', () => ({ loadOwnedAssetDriveBundle: jest.fn() }));
jest.mock('./ownedAssetsSheetsService', () => ({ OwnedAssetsSheetsService: {} }));

import { FeedService } from './feedService';

const NOW = Date.parse('2026-11-09T12:05:00.000Z');
const rootKeys = mlDsa65Keygen(new Uint8Array(32).fill(7));
const ROOT_PK = bytesToBase64(rootKeys.publicKey);
const ROOT = deriveCanonicalPnIdentifier(ROOT_PK);
const feedKeys = derivePersonalFeedKeyPair(rootKeys.secretKey, ROOT);

function signed(overrides: Partial<PersonalFeedStatement> = {}, secretKey = rootKeys.secretKey) {
  const statement = {
    ...buildPersonalFeedStatement({
      rootPublicKey: ROOT_PK,
      feedPnIdentifier: feedKeys.subjectPnIdentifier,
      feedPublicKey: feedKeys.publicKeyB64,
      nonce: 'nonce-abcdefghijklmnop',
      issuedAt: '2026-11-09T12:00:00.000Z'
    }),
    ...overrides
  };
  return {
    statement,
    signature: bytesToBase64(mlDsa65Sign(canonicalPersonalFeedBytes(statement), secretKey))
  };
}

beforeEach(() => {
  feeds.length = 0;
  assets.length = 0;
  queries.length = 0;
});

describe('FeedService.registerPersonalFeed', () => {
  it('creates one personal feed and its owned-asset row', async () => {
    const out = await FeedService.registerPersonalFeed({ rootPn: ROOT, ...signed(), now: NOW });
    expect(out.created).toBe(true);
    expect(out.subPnIdentifier).toBe(feedKeys.subjectPnIdentifier);
    expect(out.feed.creatorTier).toBe('personal');
    expect(out.feed.subPnIdentifier).toBe(feedKeys.subjectPnIdentifier);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      root_pn_identifier: ROOT,
      subject_pn_identifier: feedKeys.subjectPnIdentifier,
      metadata: { feedId: out.feed.feedId, tier: 'personal' }
    });
  });

  it('is idempotent', async () => {
    const first = await FeedService.registerPersonalFeed({ rootPn: ROOT, ...signed(), now: NOW });
    const second = await FeedService.registerPersonalFeed({ rootPn: ROOT, ...signed(), now: NOW });
    expect(second.created).toBe(false);
    expect(second.feed.feedId).toBe(first.feed.feedId);
    expect(second.assetId).toBe(first.assetId);
    expect(feeds).toHaveLength(1);
    expect(assets).toHaveLength(1);
  });

  it('re-keys the same feed in place when the feed key changes', async () => {
    const first = await FeedService.registerPersonalFeed({ rootPn: ROOT, ...signed(), now: NOW });
    const next = mlDsa65Keygen(new Uint8Array(32).fill(9));
    const nextPk = bytesToBase64(next.publicKey);
    const nextSubject = deriveCanonicalPnIdentifier(nextPk);
    const out = await FeedService.registerPersonalFeed({
      rootPn: ROOT,
      ...signed({ feedPublicKey: nextPk, feedPnIdentifier: nextSubject }),
      now: NOW
    });
    expect(out.feed.feedId).toBe(first.feed.feedId);
    expect(out.assetId).toBe(first.assetId);
    expect(out.subPnIdentifier).toBe(nextSubject);
    expect(assets[0].subject_pn_identifier).toBe(nextSubject);
  });

  it('rejects a feed key that does not derive the feed pN', async () => {
    await expect(
      FeedService.registerPersonalFeed({
        rootPn: ROOT,
        ...signed({ feedPnIdentifier: 'pn-someoneelse' }),
        now: NOW
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'personal_feed_key_mismatch' });
  });

  it('rejects a statement signed by another key', async () => {
    const other = mlDsa65Keygen(new Uint8Array(32).fill(3));
    await expect(
      FeedService.registerPersonalFeed({ rootPn: ROOT, ...signed({}, other.secretKey), now: NOW })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'personal_feed_signature_invalid' });
  });

  it('rejects a root key that is not the caller', async () => {
    await expect(
      FeedService.registerPersonalFeed({ rootPn: 'pn-caller', ...signed(), now: NOW })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'personal_feed_statement_root_mismatch' });
  });

  it('rejects a stale statement', async () => {
    await expect(
      FeedService.registerPersonalFeed({ rootPn: ROOT, ...signed(), now: NOW + 60 * 60 * 1000 })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'personal_feed_statement_stale' });
  });

  it('refuses a feed sub-pN already registered to another root', async () => {
    assets.push({
      id: 'asset-x',
      root_pn_identifier: 'pn-someoneelse',
      subject_pn_identifier: feedKeys.subjectPnIdentifier,
      kind: 'feed',
      metadata: {}
    });
    await expect(
      FeedService.registerPersonalFeed({ rootPn: ROOT, ...signed(), now: NOW })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
