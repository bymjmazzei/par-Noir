/**
 * The rail's two load-bearing properties:
 *   1. a pn identifier never reaches the durable mailbox row in the clear
 *   2. the recipient, and only the recipient, can recover it
 *
 * Both used to be free because the write happened directly against the peer's
 * Drive. Now that the payload sits in Postgres, they have to be enforced.
 */

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { openSocialEnvelope, bytesToBase64 } from '@par-noir/dm-crypto';

const enqueueSocialMailboxJob = jest.fn();
const getMailboxRouteKeyForOwner = jest.fn();
const query = jest.fn();

jest.mock('./socialMailboxService', () => ({
  enqueueSocialMailboxJob: (...args: unknown[]) => enqueueSocialMailboxJob(...args),
  getMailboxRouteKeyForOwner: (...args: unknown[]) => getMailboxRouteKeyForOwner(...args),
  sanitizeMailboxPayload: (p: Record<string, unknown>) => p
}));

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({ query })
}));

jest.mock('../../utils/logger', () => ({
  hashIdentifier: (v: string) => `hash(${v})`,
  safeLogger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

const RECIPIENT = 'pn-bob';
const SENDER = 'pn-alice';
const BOB_ROUTE = 'b'.repeat(64);

function recipientKeypair() {
  const seed = new Uint8Array(64).fill(7);
  const { publicKey, secretKey } = ml_kem768.keygen(seed);
  return { publicKey: bytesToBase64(publicKey), secretKey: bytesToBase64(secretKey) };
}

describe('social rail sealing', () => {
  beforeEach(() => {
    jest.resetModules();
    enqueueSocialMailboxJob.mockReset().mockResolvedValue({ created: true });
    getMailboxRouteKeyForOwner.mockReset().mockResolvedValue(BOB_ROUTE);
    query.mockReset();
  });

  it('never writes the sender pn into the durable payload, and the recipient can open it', async () => {
    const keys = recipientKeypair();
    query.mockResolvedValue({ rows: [{ ml_kem_public_key: keys.publicKey }] });

    const { enqueueSocialJob } = await import('./socialRail');
    const ok = await enqueueSocialJob({
      jobType: 'connection_delete',
      peerPn: RECIPIENT,
      requestId: 'delete:conn-1',
      sealed: { peerPnIdentifier: SENDER },
      extra: { connectionId: 'conn-1' }
    });

    expect(ok).toBe(true);
    expect(enqueueSocialMailboxJob).toHaveBeenCalledTimes(1);

    const { payload, routeKey } = enqueueSocialMailboxJob.mock.calls[0][0];
    expect(routeKey).toBe(BOB_ROUTE);

    // The sender's pn must not appear anywhere in what gets persisted.
    expect(JSON.stringify(payload)).not.toContain(SENDER);

    const opened = await openSocialEnvelope<{ peerPnIdentifier: string }>(
      payload.envelope,
      keys.secretKey,
      payload.envelopeContext
    );
    expect(opened.peerPnIdentifier).toBe(SENDER);
  });

  it('refuses to enqueue when peer has no claimed mailbox route', async () => {
    getMailboxRouteKeyForOwner.mockResolvedValue(null);

    const { enqueueSocialJob } = await import('./socialRail');
    const ok = await enqueueSocialJob({
      jobType: 'follower_add',
      peerPn: RECIPIENT,
      requestId: 'follow:no-route',
      sealed: { peerPnIdentifier: SENDER }
    });

    expect(ok).toBe(false);
    expect(enqueueSocialMailboxJob).not.toHaveBeenCalled();
  });

  it('refuses to enqueue rather than dropping the pn in the clear when no key is published', async () => {
    query.mockResolvedValue({ rows: [] });

    const { enqueueSocialJob } = await import('./socialRail');
    const ok = await enqueueSocialJob({
      jobType: 'follower_add',
      peerPn: RECIPIENT,
      requestId: 'follow:1',
      sealed: { peerPnIdentifier: SENDER }
    });

    expect(ok).toBe(false);
    expect(enqueueSocialMailboxJob).not.toHaveBeenCalled();
  });

  it('does not open under a different context than it was sealed with', async () => {
    const keys = recipientKeypair();
    query.mockResolvedValue({ rows: [{ ml_kem_public_key: keys.publicKey }] });

    const { enqueueSocialJob } = await import('./socialRail');
    await enqueueSocialJob({
      jobType: 'connection_delete',
      peerPn: RECIPIENT,
      requestId: 'delete:conn-2',
      sealed: { peerPnIdentifier: SENDER }
    });

    const { payload } = enqueueSocialMailboxJob.mock.calls[0][0];
    await expect(
      openSocialEnvelope(payload.envelope, keys.secretKey, 'delete:some-other-connection')
    ).rejects.toThrow();
  });
});
