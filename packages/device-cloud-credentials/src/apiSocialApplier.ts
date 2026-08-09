/**
 * Applier that lands social mailbox jobs in the user's own cloud via the API.
 *
 * The dashboard can write Drive directly because it holds unsealed credentials.
 * The browser is API-only by design (SHARED_CODE_RULES § 3.3), so it applies the
 * same jobs by unsealing the envelope locally and posting the plaintext to
 * apply-inbound with its own forwarded cloud access token. The server never
 * opens the envelope and never holds the token; the write still lands in the
 * caller's own cloud.
 *
 * This is what closes the gap where a browser-only user's inbound connections,
 * follows, and group updates were queued but never materialized, because the
 * flush worker only ever ran inside the dashboard.
 */

import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import type { MailboxJob } from './types.js';
import { SOCIAL_JOB_TYPES_APPLIED_VIA_API } from './siloMaterialize.js';

export interface ApiSocialApplierOptions {
  apiBaseUrl: string;
  authToken: string;
  identityId: string;
  buildAuthHeaders?: (
    method: string,
    path: string,
    body?: unknown
  ) => Promise<Record<string, string>> | Record<string, string>;
  /** Forwarded as X-PN-Cloud-Access-Token so the API can reach the caller's own Drive. */
  getCloudAccessToken?: () => Promise<string | undefined> | string | undefined;
  /**
   * Opens an envelope sealed to this identity's ML-KEM public key. Omit and any
   * job that carries one is left in the mailbox rather than acked, because
   * acking a job that was never applied loses it.
   */
  openEnvelope?: (
    envelope: { kemCiphertext: string; ciphertext: string },
    contextId: string
  ) => Promise<Record<string, unknown>>;
}

const CONNECTION_JOBS = new Set([
  'connection_request',
  'connection_accept',
  'connection_reject',
  'connection_delete',
  'follower_add',
  'follower_remove'
]);

const GROUP_JOBS = new Set(['group_message_append', 'group_inbox_update']);

function endpointFor(jobType: string): string | null {
  if (CONNECTION_JOBS.has(jobType)) return '/api/connections/apply-inbound';
  if (GROUP_JOBS.has(jobType)) return '/api/groups/apply-inbound';
  return null;
}

export function createApiSocialApplier(opts: ApiSocialApplierOptions) {
  const base = opts.apiBaseUrl.replace(/\/$/, '');

  return async function applySocialJob(job: MailboxJob): Promise<boolean> {
    if (!SOCIAL_JOB_TYPES_APPLIED_VIA_API.has(job.jobType)) return false;

    const path = endpointFor(job.jobType);
    if (!path) return false;

    const payload: Record<string, unknown> = { ...(job.payload || {}) };

    // sanitizeMailboxPayload strips clear pn fields from the durable row, so who
    // this came from arrives only inside the sealed envelope.
    const envelope = payload.envelope as
      | { kemCiphertext: string; ciphertext: string }
      | undefined;
    if (envelope && typeof envelope === 'object' && envelope.kemCiphertext) {
      if (!opts.openEnvelope) {
        throw new Error(
          `cannot open sealed ${job.jobType}: no ML-KEM secret available in this session`
        );
      }
      // The sealer picks the context and sends it alongside; requestId is a
      // fallback for jobs whose id the client can reproduce.
      const contextId = String(payload.envelopeContext || payload.requestId || job.jobType);
      const opened = await opts.openEnvelope(envelope, contextId);
      Object.assign(payload, opened);
    }
    delete payload.envelope;

    const body = {
      ...payload,
      userPnIdentifier: opts.identityId,
      jobType: job.jobType
    };

    const cloudAccessToken = opts.getCloudAccessToken
      ? await opts.getCloudAccessToken()
      : undefined;
    const extra = opts.buildAuthHeaders
      ? await opts.buildAuthHeaders('POST', path, body)
      : {};

    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(cloudAccessToken ? { 'X-PN-Cloud-Access-Token': cloudAccessToken } : {}),
        ...extra
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`apply-inbound ${job.jobType} HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }
    return true;
  };
}

/**
 * applyJob for a FlushContext that has no local Drive writer: social jobs go to
 * the API, and anything else is left for a client that can materialize it.
 */
export function createApiOnlyApplyJob(opts: ApiSocialApplierOptions) {
  const applySocialJob = createApiSocialApplier(opts);
  return async function applyJob(
    job: MailboxJob,
    _credentials: StorageCredentialsEnvelope
  ): Promise<boolean> {
    return applySocialJob(job);
  };
}
