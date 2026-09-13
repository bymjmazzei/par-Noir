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

/** Visible + unlocked backstop only — not a heartbeat. */
const DRAIN_INTERVAL_MS = 5 * 60_000;

let running = false;
let started = false;
let intervalId: ReturnType<typeof setInterval> | number | null = null;
let cachedRoute: { identityId: string; routeKey: string } | null = null;

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
  const session = PNOAuthService.loadSession();
  if (!session || !PNOAuthService.isSessionValid(session)) {
    console.warn('[socialMailbox] drain skipped: no valid session');
    return EMPTY;
  }
  const identityId = session.pnIdentifier;
  const authToken = session.accessToken;
  if (!identityId || !authToken) {
    console.warn('[socialMailbox] drain skipped: missing identity or auth token');
    return EMPTY;
  }

  // Case B unkeyed web: server refuses pending/ack — skip to avoid 403 spam.
  const registry = await fetchDeviceRegistry(identityId, authToken);
  const hasKeyedDevices = Boolean(
    registry?.hasKeyedDevices || registry?.policy?.firstDeviceKeyedAt
  );
  if (hasKeyedDevices) {
    const local = await loadDeviceRegistration(identityId);
    if (!local?.deviceId) {
      console.warn(
        '[socialMailbox] drain skipped: identity has keyed devices but this browser has no local device registration'
      );
      return EMPTY;
    }
  }

  const errors: string[] = [];

  let mlKemSecretKey: string | undefined;
  let identity;
  try {
    identity = getDmIdentity();
    mlKemSecretKey = identity.mlKemSecretKey;
  } catch {
    console.warn('[socialMailbox] drain skipped: messaging ML-KEM session not ready');
    return EMPTY;
  }

  if (!getCloudAccessTokenFromSession(identityId)) {
    console.warn('[socialMailbox] drain proceeding without cloud AT — Drive apply will fail until credentials are ready');
  }

  const api = {
    apiBaseUrl: API_ENDPOINT,
    authToken,
    buildAuthHeaders
  };

  let routeKey: string;
  if (cachedRoute?.identityId === identityId) {
    routeKey = cachedRoute.routeKey;
  } else {
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
      cachedRoute = { identityId, routeKey };
    } catch (e) {
      errors.push(`route: ${e instanceof Error ? e.message : 'failed'}`);
      console.warn('[socialMailbox] route claim failed', errors);
      return { ...EMPTY, errors };
    }
  }

  // Sender outbox → own Sheets (same SoT as conversation GET).
  try {
    const { promoteSenderOutbox } = await import('./messageService');
    await promoteSenderOutbox(identityId);
  } catch (e) {
    errors.push(`outbox: ${e instanceof Error ? e.message : 'promote failed'}`);
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
  const leftoverNotificationRows = jobs.filter((j) => j.jobType === 'notification_row').length;
  if (leftoverNotificationRows > 0) {
    console.warn(
      `[socialMailbox] acking ${leftoverNotificationRows} leftover notification_row job(s) as no-op`
    );
  }
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

  if (appliedIds.length) {
    try {
      const { notifyMessagingInboxRefresh, notifyMessagingMailboxApplied } = await import(
        './messageService'
      );
      notifyMessagingMailboxApplied();
      notifyMessagingInboxRefresh();
    } catch {
      /* ignore */
    }
  }

  if (errors.length) {
    console.warn('[socialMailbox] drain errors', errors);
  }

  return { pulled: jobs.length, applied: appliedIds.length, acked, errors };
}

const HOT_DRAIN_DEBOUNCE_MS = 400;
let hotDrainTimer: ReturnType<typeof setTimeout> | null = null;
let hotDrainWaiters: Array<{
  resolve: (r: MailboxDrainResult) => void;
  reject: (e: unknown) => void;
}> = [];

async function drainOnce(): Promise<MailboxDrainResult> {
  if (running) return EMPTY;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return EMPTY;
  running = true;
  try {
    const result = await drainSocialMailbox();
    if (import.meta.env.DEV && (result.pulled || result.errors.length)) {
      console.info('[socialMailbox] drain', result);
    }
    return result;
  } catch (e) {
    console.warn('[socialMailbox] drain failed:', e instanceof Error ? e.message : e);
    return { ...EMPTY, errors: [e instanceof Error ? e.message : String(e)] };
  } finally {
    running = false;
  }
}

/**
 * Debounced drain for realtime hints (new_message / mailbox_pending).
 * Callers that must reload Sheets after apply should await this.
 */
export function requestHotDrain(): Promise<MailboxDrainResult> {
  return new Promise((resolve, reject) => {
    hotDrainWaiters.push({ resolve, reject });
    if (hotDrainTimer != null) clearTimeout(hotDrainTimer);
    hotDrainTimer = setTimeout(() => {
      hotDrainTimer = null;
      const waiters = hotDrainWaiters;
      hotDrainWaiters = [];
      void (async () => {
        try {
          // If a drain is already running, wait briefly then run again so we catch new jobs.
          if (running) {
            await new Promise((r) => setTimeout(r, HOT_DRAIN_DEBOUNCE_MS));
          }
          const result = await drainOnce();
          for (const w of waiters) w.resolve(result);
        } catch (e) {
          for (const w of waiters) w.reject(e);
        }
      })();
    }, HOT_DRAIN_DEBOUNCE_MS);
  });
}

function onCloudCredentialsReady(): void {
  void requestHotDrain();
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') void requestHotDrain();
}

/**
 * Drain after unlock / cloud ready, then a slow visible backstop.
 * Call stopSocialMailboxConsumer on lock.
 */
export function startSocialMailboxConsumer(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onCloudCredentialsReady);
  document.addEventListener('visibilitychange', onVisibilityChange);
  intervalId = window.setInterval(() => {
    void requestHotDrain();
  }, DRAIN_INTERVAL_MS);
  void (async () => {
    const session = PNOAuthService.loadSession();
    if (session?.pnIdentifier) {
      const { awaitCloudUnlockComplete } = await import('./cloudUnlockCoordinator');
      await awaitCloudUnlockComplete(session.pnIdentifier, 60_000);
    }
    await requestHotDrain();
  })();
}

export function stopSocialMailboxConsumer(): void {
  if (!started) return;
  started = false;
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (hotDrainTimer != null) {
    clearTimeout(hotDrainTimer);
    hotDrainTimer = null;
  }
  hotDrainWaiters = [];
  if (typeof window !== 'undefined') {
    window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onCloudCredentialsReady);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }
  cachedRoute = null;
}
