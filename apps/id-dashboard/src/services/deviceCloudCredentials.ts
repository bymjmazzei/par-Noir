/**
 * Device-held cloud credentials for id-dashboard (web + Capacitor native).
 * Unlock = promote outbox SoT → cloud, reconcile throughway, flush materialize.
 */

import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import {
  CloudFlushWorker,
  NativeSecureStore,
  WEB_GRACE_TTL_MS,
  WebSealedStore,
  appendConversationLine,
  createDeviceCloudWriter,
  enqueueMailboxThroughway,
  ensureMailboxRouteKey,
  loadLocalOutbox,
  lookupMailboxThroughway,
  materializeMailboxJob,
  migrateServerSecretsToDevice,
  sealCredentials,
  setSessionCloudCredentials,
  takeOutboxBridge,
  unsealCredentials,
  upsertLocalOutboxRecord,
  writeOutboxToCloud,
  type CredentialStore,
  type OutboxRecord,
  type SealSession,
  type SealedEnvelope
} from '@par-noir/device-cloud-credentials';
import { PN_CLOUD_CREDENTIALS_READY_EVENT } from '@par-noir/oauth-ui';
import { Capacitor } from '@capacitor/core';
import { API_ENDPOINT } from '../config/api';

let webStore: WebSealedStore | null = null;
let nativeStore: NativeSecureStore | null = null;
let graceTimer: ReturnType<typeof setTimeout> | null = null;
let flushInterval: ReturnType<typeof setInterval> | null = null;
/** Coalesce duplicate unlock migrate (handler + App session-restore effect). */
const migrateFlushInFlight = new Map<string, Promise<void>>();
/** Latest migrate promise per identity (any auth token) so bootstrap can wait. */
const migrateFlushByIdentity = new Map<string, Promise<void>>();

/** Await in-flight unlock migrate for this identity (no-op if none). */
export async function awaitMigrateFlushForIdentity(identityId: string): Promise<void> {
  const p = migrateFlushByIdentity.get(identityId);
  if (p) await p.catch(() => undefined);
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function getStore(): Promise<CredentialStore> {
  if (isNative()) {
    if (!nativeStore) {
      const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
      nativeStore = new NativeSecureStore({
        get: async (key) => {
          try {
            const r = await SecureStoragePlugin.get({ key });
            return r.value ?? null;
          } catch {
            return null;
          }
        },
        set: async (key, value) => {
          await SecureStoragePlugin.set({ key, value });
        },
        remove: async (key) => {
          try {
            await SecureStoragePlugin.remove({ key });
          } catch {
            /* ignore */
          }
        }
      });
    }
    return nativeStore;
  }
  if (!webStore) webStore = new WebSealedStore();
  return webStore;
}

export async function sealAndStoreCloudCredentials(opts: {
  identityId: string;
  credentials: StorageCredentialsEnvelope;
  session: SealSession;
}): Promise<SealedEnvelope> {
  // Keep unlock-session memory aligned with sealed Drive secrets (owner API / ZKP).
  setSessionCloudCredentials(opts.identityId, opts.credentials);
  const expiresAt = isNative()
    ? null
    : new Date(Date.now() + WEB_GRACE_TTL_MS).toISOString();
  const envelope = await sealCredentials(opts.credentials, opts.session, expiresAt);
  const store = await getStore();
  await store.set(opts.identityId, envelope);
  if (!isNative()) {
    scheduleWebGraceWipe(opts.identityId, WEB_GRACE_TTL_MS);
  }
  return envelope;
}

export async function loadUnsealedCloudCredentials(
  identityId: string,
  session: SealSession
): Promise<StorageCredentialsEnvelope | null> {
  const store = await getStore();
  const envelope = await store.get(identityId);
  if (!envelope) return null;
  return unsealCredentials<StorageCredentialsEnvelope>(envelope, session);
}

export async function wipeDeviceCloudCredentials(identityId: string): Promise<void> {
  const store = await getStore();
  await store.clear(identityId);
  if (graceTimer) {
    clearTimeout(graceTimer);
    graceTimer = null;
  }
}

function scheduleWebGraceWipe(identityId: string, ttlMs: number): void {
  if (graceTimer) clearTimeout(graceTimer);
  graceTimer = setTimeout(() => {
    void wipeDeviceCloudCredentials(identityId);
  }, ttlMs);
}

export async function refreshWebGraceTtl(
  identityId: string,
  session: SealSession
): Promise<void> {
  if (isNative()) return;
  const creds = await loadUnsealedCloudCredentials(identityId, session);
  if (!creds) return;
  await sealAndStoreCloudCredentials({ identityId, credentials: creds, session });
}

export async function migrateAndFlushOnUnlock(opts: {
  identityId: string;
  authToken: string;
  session: SealSession;
  /** When false, skip mailbox pending/ack (no messagesRead / unkeyed) — no 401 spam. */
  canFlushMailbox?: boolean;
}): Promise<void> {
  const lockKey = `${opts.identityId}:${opts.authToken.slice(0, 16)}`;
  const existing = migrateFlushInFlight.get(lockKey);
  if (existing) {
    await existing;
    return;
  }

  const run = (async () => {
    // Mint/persist opaque mailbox route key for cross-cloud throughway claims.
    await ensureMailboxRouteKey(opts.identityId, opts.session).catch(() => undefined);

    await migrateServerSecretsToDevice({
      apiBaseUrl: API_ENDPOINT,
      authToken: opts.authToken,
      identityId: opts.identityId,
      sealAndStore: async (credentials) => {
        await sealAndStoreCloudCredentials({
          identityId: opts.identityId,
          credentials: credentials as StorageCredentialsEnvelope,
          session: opts.session
        });
      }
    }).catch(() => undefined);

    await promoteAndReconcileOutbox(opts);

    if (opts.canFlushMailbox === false) {
      stopDeviceCloudWorkers();
      return;
    }

    await runMailboxFlush(opts);
    startPeriodicFlush(opts);
  })();

  migrateFlushInFlight.set(lockKey, run);
  migrateFlushByIdentity.set(opts.identityId, run);
  try {
    await run;
  } finally {
    migrateFlushInFlight.delete(lockKey);
    if (migrateFlushByIdentity.get(opts.identityId) === run) {
      migrateFlushByIdentity.delete(opts.identityId);
    }
    // Only signal cloud ready when this device actually has usable secrets (not empty migrate).
    try {
      const env = await loadUnsealedCloudCredentials(opts.identityId, opts.session);
      const has =
        env &&
        ((env.googleDriveAccounts?.length ?? 0) > 0 ||
          (env as { dropboxAccounts?: unknown[] }).dropboxAccounts?.length ||
          (env as { onedriveAccounts?: unknown[] }).onedriveAccounts?.length);
      if (has) {
        window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
      }
    } catch {
      /* non-DOM / no secrets */
    }
  }
}

/** Promote local/bridge outbox → cloud SoT; rebuild throughway if wiped. */
export async function promoteAndReconcileOutbox(opts: {
  identityId: string;
  authToken: string;
  session: SealSession;
}): Promise<void> {
  const credentials = await loadUnsealedCloudCredentials(opts.identityId, opts.session);
  if (!credentials) return;

  let records = await loadLocalOutbox(opts.identityId, opts.session);

  const bridge = takeOutboxBridge(opts.identityId);
  if (bridge) {
    try {
      const bag = await unsealCredentials<{ records: OutboxRecord[] }>(bridge, opts.session);
      if (Array.isArray(bag?.records)) {
        for (const r of bag.records) {
          records = await upsertLocalOutboxRecord(opts.identityId, opts.session, r);
        }
      }
    } catch {
      /* ignore bad bridge */
    }
  }

  let writer;
  try {
    writer = await createDeviceCloudWriter(opts.identityId, credentials);
  } catch {
    return;
  }

  for (const record of records) {
    if (record.status === 'materialized') continue;
    try {
      await writeOutboxToCloud(writer, record);

      if (record.kind === 'message_append') {
        const from = String(record.payload.fromPnIdentifier || '');
        const to = String(record.payload.toPnIdentifier || '');
        const peer = from === opts.identityId ? to : from;
        await appendConversationLine(writer, opts.identityId, peer, {
          ...record.payload,
          role: 'sender',
          read: true,
          content: ''
        });
      }

      for (const target of record.fanout) {
        const messageId =
          typeof record.payload.messageId === 'string' ? record.payload.messageId : undefined;
        const commentId =
          typeof record.payload.commentId === 'string' ? record.payload.commentId : undefined;
        const fileId =
          typeof record.payload.fileId === 'string' ? record.payload.fileId : undefined;
        const routeKey = target.routeKey || target.recipientIdentityId;
        if (!routeKey) continue;
        const lookup = await lookupMailboxThroughway({
          apiBaseUrl: API_ENDPOINT,
          authToken: opts.authToken,
          identityId: opts.identityId,
          routeKey,
          recipientIdentityId: target.recipientIdentityId,
          jobType: target.jobType,
          messageId,
          commentId,
          fileId
        }).catch(() => ({ found: false, pending: false }));

        if (!lookup.pending) {
          const basePayload =
            target.jobType === 'message_append'
              ? { ...record.payload, role: 'recipient' }
              : target.jobType === 'notification_row'
                ? {
                    type: record.payload.type || 'new_message',
                    messageId: record.payload.messageId,
                    threadId: record.payload.threadId,
                    connectionId: record.payload.connectionId,
                    fileId: record.payload.fileId,
                    commentId: record.payload.commentId
                  }
                : { ...record.payload };
          const { fromPnIdentifier: _f, toPnIdentifier: _t, ...payload } = basePayload as Record<
            string,
            unknown
          >;
          await enqueueMailboxThroughway({
            apiBaseUrl: API_ENDPOINT,
            authToken: opts.authToken,
            identityId: opts.identityId,
            routeKey,
            recipientIdentityId: target.recipientIdentityId,
            jobType: target.jobType,
            payload
          });
        }
      }

      await upsertLocalOutboxRecord(opts.identityId, opts.session, {
        ...record,
        status: 'materialized',
        updatedAt: new Date().toISOString()
      });
    } catch {
      await upsertLocalOutboxRecord(opts.identityId, opts.session, {
        ...record,
        status: 'failed',
        updatedAt: new Date().toISOString()
      });
    }
  }
}

export async function runMailboxFlush(opts: {
  identityId: string;
  authToken: string;
  session: SealSession;
}): Promise<void> {
  const credentials = await loadUnsealedCloudCredentials(opts.identityId, opts.session);
  if (!credentials) return;
  const routeKey = await ensureMailboxRouteKey(opts.identityId, opts.session).catch(() => undefined);
  const { deviceProofHeaders } = await import('./deviceProofContext');
  const worker = new CloudFlushWorker();
  try {
    await worker.flush({
      identityId: opts.identityId,
      authToken: opts.authToken,
      apiBaseUrl: API_ENDPOINT,
      routeKey,
      credentials,
      applyJob: async (job, creds) => materializeMailboxJob(opts.identityId, job, creds),
      buildAuthHeaders: async (method, path, body) => deviceProofHeaders(method, path, body)
    });
  } catch (e) {
    const status = (e as Error & { status?: number })?.status;
    if (status === 401 || status === 403) {
      stopDeviceCloudWorkers();
      return;
    }
    throw e;
  }
}

function startPeriodicFlush(opts: {
  identityId: string;
  authToken: string;
  session: SealSession;
}): void {
  if (flushInterval) clearInterval(flushInterval);
  flushInterval = setInterval(() => {
    void promoteAndReconcileOutbox(opts)
      .then(() => runMailboxFlush(opts))
      .catch((e) => {
        const status = (e as Error & { status?: number })?.status;
        if (status === 401 || status === 403) {
          stopDeviceCloudWorkers();
        }
      });
  }, 60_000);
}

export function stopDeviceCloudWorkers(): void {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
  if (graceTimer) {
    clearTimeout(graceTimer);
    graceTimer = null;
  }
}

/** Push layout-only metadata to API (no secrets). */
export async function publishStorageLayout(opts: {
  identityId: string;
  authToken: string;
  layout: {
    socialCloudProvider?: string;
    socialCloudAccountId?: string;
    cachedLayout?: unknown;
    driveFolderId?: string;
    publicKey?: string;
  };
}): Promise<void> {
  const res = await fetch(
    `${API_ENDPOINT.replace(/\/$/, '')}/api/storage/layout/${encodeURIComponent(opts.identityId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(opts.layout)
    }
  );
  if (!res.ok) {
    throw new Error(`storage layout publish failed: HTTP ${res.status}`);
  }
}
