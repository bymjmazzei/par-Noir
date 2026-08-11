/**
 * Addressing and enqueue for private peer delivery of social events.
 *
 * Connections, follows, and group sends used to write straight into the peer's
 * cloud with credentials the server no longer holds. They now ride the same
 * outbox/mailbox rail as DMs: the sender writes only their own side, and the
 * recipient's own device performs the write on their side.
 */

import {
  enqueueSocialMailboxJob,
  getMailboxRouteKeyForOwner,
  type SocialMailboxJobType
} from './socialMailboxService';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { getDatabasePool } from '../utils/database';

/**
 * Social jobs address the recipient's claimed opaque route only.
 *
 * Dashboard and browser converge on one route via mailbox_route_binding (server
 * SoT). If the peer has never claimed a route, fail closed — inventing a
 * pn-derived address would make every inbox world-computable from a pepper.
 */
export async function routeKeyForPeer(peerPn: string): Promise<string | null> {
  return getMailboxRouteKeyForOwner(peerPn);
}

export interface SocialJobParams {
  jobType: SocialMailboxJobType;
  peerPn: string;
  /** Deterministic, so a retry does not duplicate the row. */
  requestId: string;
  /** Sealed by the client to the peer's ML-KEM public key; the server cannot read it. */
  envelope?: { kemCiphertext: string; ciphertext: string };
  /**
   * Context the envelope was sealed under. A client-sealed envelope picks its
   * own, because it cannot reproduce a server-generated requestId; the opener
   * must be told which one to use or the ciphertext will not open.
   */
  envelopeContext?: string;
  /** Non-identifying fields safe to leave in the clear. */
  extra?: Record<string, unknown>;
  /**
   * Fields the mailbox must not hold in the clear (pn identifiers and anything
   * else the identity protocol protects). Sealed here to the peer's published
   * ML-KEM key before the row is written.
   */
  sealed?: Record<string, unknown>;
}

/**
 * The recipient's own device publishes this key; the row is the only copy a
 * sender can reach under custody, since reading it off their Drive would need
 * their token.
 */
async function publishedMlKemPublicKey(peerPn: string): Promise<string | null> {
  try {
    const db = getDatabasePool();
    const result = await db.query(
      `SELECT ml_kem_public_key FROM user_profiles WHERE pn_identifier = $1`,
      [peerPn]
    );
    const key = result.rows[0]?.ml_kem_public_key;
    return typeof key === 'string' && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort by design: the sender's own write already succeeded, and the
 * mailbox is a rebuildable throughway, not the source of truth. A failure here
 * is logged rather than failing the caller's request — but it is logged, because
 * a silent drop is how a disabled feature stays invisible.
 */
export async function enqueueSocialJob(params: SocialJobParams): Promise<boolean> {
  const routeKey = await routeKeyForPeer(params.peerPn);
  if (!routeKey) {
    safeLogger.warn('[SocialRail] Peer has no claimed mailbox route; job not enqueued', {
      jobType: params.jobType,
      peerPnHash: hashIdentifier(params.peerPn)
    });
    return false;
  }
  try {
    let envelope = params.envelope;
    const envelopeContext = params.envelopeContext || params.requestId;

    if (params.sealed && Object.keys(params.sealed).length > 0) {
      const peerKey = await publishedMlKemPublicKey(params.peerPn);
      if (!peerKey) {
        // Dropping the job outright would be a silent dead end. Refusing loudly
        // is the honest outcome: the peer has not published a key, so nothing
        // can be delivered to them privately.
        safeLogger.warn('[SocialRail] Peer has no published ML-KEM key; job not enqueued', {
          jobType: params.jobType,
          peerPnHash: hashIdentifier(params.peerPn)
        });
        return false;
      }
      const { sealSocialEnvelope } = await import('@par-noir/dm-crypto');
      envelope = await sealSocialEnvelope(peerKey, envelopeContext, params.sealed);
    }

    await enqueueSocialMailboxJob({
      routeKey,
      jobType: params.jobType,
      payload: {
        requestId: params.requestId,
        ...(envelope ? { envelope, envelopeContext } : {}),
        ...(params.extra || {})
      }
    });
    return true;
  } catch (error) {
    safeLogger.warn('[SocialRail] Failed to enqueue peer job', {
      jobType: params.jobType,
      requestId: params.requestId,
      peerPnHash: hashIdentifier(params.peerPn),
      message: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}
