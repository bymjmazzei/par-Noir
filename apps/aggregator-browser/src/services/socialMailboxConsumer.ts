/**
 * Drains this identity's mailbox in the browser.
 *
 * Inbound connections, follows, and group updates arrive as sealed mailbox jobs
 * that only the recipient's device can open. Until now the only thing that
 * drained them was the dashboard's CloudFlushWorker, so a user who lives in the
 * browser never saw them: the job sat in Postgres and the write never happened.
 *
 * The browser is API-only for storage (SHARED_CODE_RULES § 3.3), so it opens the
 * envelope locally with its ML-KEM secret and posts the plaintext to
 * apply-inbound, forwarding its own cloud access token. The write lands in this
 * user's own cloud; the server neither reads the envelope nor holds the token.
 */

import {
  ackMailboxJobsRemote,
  ensureMailboxRouteKey,
  fetchMailboxPending,
  createApiSocialApplier,
  getCloudAccessTokenFromSession,
  type MailboxJob
} from '@par-noir/device-cloud-credentials';
import { openSocialEnvelope } from '@par-noir/dm-crypto';
import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from './pnOAuthService';
import { getDmIdentity } from './dmIdentitySession';
import { ownerApiHeadersAsync, PN_CLOUD_CREDENTIALS_READY_EVENT } from './ownerApiHeaders';
import { fetchDeviceRegistry } from './deviceService';
import { loadDeviceRegistration } from '@par-noir/device-client';

export interface MailboxDrainResult {
  pulled: number;
  applied: number;
  acked: number;
  errors: string[];
}

const EMPTY: MailboxDrainResult = { pulled: 0, applied: 0, acked: 0, errors: [] };

/**
 * Only the headers the API needs beyond Bearer. ownerApiHeadersAsync already
 * waits for the cloud token, so Drive-backed applies do not race the unlock.
 */
async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers = await ownerApiHeadersAsync();
  delete headers.Authorization;
  return headers;
}

export async function drainSocialMailbox(): Promise<MailboxDrainResult> {
  const authToken = await PNOAuthService.getValidAccessToken();
  if (!authToken) return EMPTY;
  const session = PNOAuthService.loadSession();
  const identityId = session?.pnIdentifier;
  if (!identityId) return EMPTY;

  // Case B unkeyed web: server refuses pending/ack — skip to avoid 403 spam.
  const registry = await fetchDeviceRegistry(identityId, authToken);
  const hasKeyedDevices = Boolean(
    registry?.hasKeyedDevices || registry?.policy?.firstDeviceKeyedAt
  );
  if (hasKeyedDevices) {
    const local = await loadDeviceRegistration(identityId);
    if (!local?.deviceId) return EMPTY;
  }

  const errors: string[] = [];

  let mlKemSecretKey: string | undefined;
  let identity;
  try {
    identity = getDmIdentity();
    mlKemSecretKey = identity.mlKemSecretKey;
  } catch {
    // Sealed jobs stay in the mailbox until an unlocked session can open them.
    return EMPTY;
  }

  const api = {
    apiBaseUrl: API_ENDPOINT,
    authToken,
    buildAuthHeaders
  };

  let routeKey: string;
  try {
    routeKey = await ensureMailboxRouteKey(
      identityId,
      {
        sessionId: identityId,
        pnName: identity.pnName || 'browser-mailbox',
        passcode: identity.mlKemSecretKey
      },
      api
    );
  } catch (e) {
    errors.push(`route: ${e instanceof Error ? e.message : 'failed'}`);
    return { ...EMPTY, errors };
  }

  const applySocialJob = createApiSocialApplier({
    apiBaseUrl: API_ENDPOINT,
    authToken,
    identityId,
    buildAuthHeaders,
    getCloudAccessToken: () => getCloudAccessTokenFromSession(identityId) || undefined,
    ...(mlKemSecretKey
      ? {
          openEnvelope: async (envelope, contextId) =>
            openSocialEnvelope<Record<string, unknown>>(envelope, mlKemSecretKey!, contextId)
        }
      : {})
  });

  let jobs: MailboxJob[] = [];
  try {
    jobs = await fetchMailboxPending(API_ENDPOINT, authToken, identityId, routeKey);
  } catch (e) {
    errors.push(`pending: ${e instanceof Error ? e.message : 'failed'}`);
  }

  // Ack only what actually landed. Acking an unapplied job loses it, since the
  // mailbox is a throughway and not a source of truth.
  const appliedIds: string[] = [];
  for (const job of jobs) {
    try {
      if (await applySocialJob(job)) appliedIds.push(job.id);
    } catch (e) {
      errors.push(`${job.jobType}: ${e instanceof Error ? e.message : 'apply failed'}`);
    }
  }

  let acked = 0;
  if (appliedIds.length) {
    try {
      acked = await ackMailboxJobsRemote({
        apiBaseUrl: API_ENDPOINT,
        authToken,
        identityId,
        routeKey,
        jobIds: appliedIds,
        buildAuthHeaders
      });
    } catch (e) {
      errors.push(`ack: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }

  return { pulled: jobs.length, applied: appliedIds.length, acked, errors };
}

const DRAIN_INTERVAL_MS = 60_000;
let running = false;
let started = false;

async function drainOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await drainSocialMailbox();
    if (import.meta.env.DEV && (result.pulled || result.errors.length)) {
      console.info('[socialMailbox] drain', result);
    }
  } catch (e) {
    console.warn('[socialMailbox] drain failed:', e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/**
 * Idempotent. Drains on cloud-credential readiness (the unlock that makes the
 * forwarded token available) and then on an interval, so a peer's request shows
 * up without the user having to open the dashboard.
 */
export function startSocialMailboxConsumer(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, () => {
    void drainOnce();
  });
  window.setInterval(() => {
    void drainOnce();
  }, DRAIN_INTERVAL_MS);
  void drainOnce();
}

startSocialMailboxConsumer();
