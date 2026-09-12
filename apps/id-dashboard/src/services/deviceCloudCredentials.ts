/**
 * Device-held cloud credentials for id-dashboard (web + Capacitor native).
 * Unlock = promote outbox SoT → cloud, reconcile throughway, flush materialize.
 */

import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import {
  CloudFlushWorker,
  NativeSecureStore,
  WebSealedStore,
  createApiSocialApplier,
  createDeviceCloudWriter,
  ensureMailboxRouteKey,
  freshAccessTokenFromEnvelope,
  loadLocalCloudCredentials,
  materializeMailboxJob,
  migrateServerSecretsToDevice,
  persistCloudCredentials,
  promoteLocalOutbox,
  publishCloudDriveReady,
  sealCredentials,
  setSessionCloudCredentials,
  SOCIAL_JOB_TYPES_APPLIED_VIA_API,
  unsealCredentials,
  writeOutboxToCloud,
  type CredentialStore,
  type SealSession,
  type SealedEnvelope
} from '@par-noir/device-cloud-credentials';
import { Capacitor } from '@capacitor/core';
import { API_ENDPOINT } from '../config/api';

let webStore: WebSealedStore | null = null;
let nativeStore: NativeSecureStore | null = null;
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

async function getNativeStore(): Promise<CredentialStore> {
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

async function getStore(): Promise<CredentialStore> {
  if (isNative()) return getNativeStore();
  if (!webStore) webStore = new WebSealedStore();
  return webStore;
}

/**
 * Persist Drive secrets into the shared device-cloud session.
 * Web: durable package persistCloudCredentials (no grace TTL).
 * Native: durable seal into secure storage.
 * Prefer calling persistCloudCredentials + resolveCloudPersistMode at call sites when Case B session-only is needed.
 */
export async function sealAndStoreCloudCredentials(opts: {
  identityId: string;
  credentials: StorageCredentialsEnvelope;
  session: SealSession;
}): Promise<SealedEnvelope | null> {
  const canonical: SealSession = {
    sessionId: 'pn-cloud-creds-v1',
    pnName: opts.session.pnName,
    passcode: opts.session.passcode
  };
  if (!isNative()) {
    return persistCloudCredentials({
      identityId: opts.identityId,
      credentials: opts.credentials,
      session: canonical,
      mode: 'sealed'
    });
  }
  setSessionCloudCredentials(opts.identityId, opts.credentials);
  const envelope = await sealCredentials(opts.credentials, canonical, null);
  const store = await getNativeStore();
  await store.set(opts.identityId, envelope);
  return envelope;
}

/** Publish ML-KEM-sealed cloud vault so OAuth first-party apps can hydrate without passcode. */
export async function publishCloudVaultForIdentity(opts: {
  identityId: string;
  authToken: string;
  pnName: string;
  passcode: string;
  credentials: StorageCredentialsEnvelope;
  /** Optional storage public key when identityId is a pn- identifier */
  publicKey?: string | null;
  mlKemSecretKey?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { publishCloudCredentialsVault } = await import('@par-noir/device-cloud-credentials');
  let mlKemSecretKey = opts.mlKemSecretKey || null;
  if (!mlKemSecretKey) {
    const { resolveIdentityMlKemSecret } = await import('./resolveIdentityMlKem');
    mlKemSecretKey = await resolveIdentityMlKemSecret({
      identityId: opts.identityId,
      publicKey: opts.publicKey,
      pnName: opts.pnName,
      passcode: opts.passcode
    });
  }
  const result = await publishCloudCredentialsVault({
    apiEndpoint: API_ENDPOINT,
    authToken: opts.authToken,
    pnIdentifier: opts.identityId,
    mlKemSecretKey,
    // Fallback seal if ML-KEM unavailable (dashboard-only hydrate)
    pnName: opts.pnName,
    passcode: opts.passcode,
    credentials: opts.credentials
  });
  if (!result.ok) {
    return { ok: false, error: result.error || `cloud-vault PUT failed (${result.status})` };
  }
  return { ok: true };
}

export async function loadUnsealedCloudCredentials(
  identityId: string,
  session: SealSession
): Promise<StorageCredentialsEnvelope | null> {
  if (!isNative()) {
    return loadLocalCloudCredentials({ identityId, session });
  }
  const store = await getNativeStore();
  const envelope = await store.get(identityId);
  if (!envelope) return null;
  try {
    const opened = await unsealCredentials<StorageCredentialsEnvelope>(envelope, session);
    setSessionCloudCredentials(identityId, opened);
    return opened;
  } catch {
    return null;
  }
}

export async function wipeDeviceCloudCredentials(identityId: string): Promise<void> {
  const store = await getStore();
  await store.clear(identityId);
}

/** @deprecated Grace TTL removed — durable seals do not expire. No-op. */
export async function refreshWebGraceTtl(
  _identityId: string,
  _session: SealSession
): Promise<void> {
  /* no-op: Case A seals are durable */
}

export async function migrateAndFlushOnUnlock(opts: {
  identityId: string;
  authToken: string;
  session: SealSession;
  /** When false, skip mailbox pending/ack (Case B unkeyed / no messagesRead). */
  canFlushMailbox?: boolean;
}): Promise<void> {
  const lockKey = `${opts.identityId}:${opts.authToken.slice(0, 16)}`;
  const existing = migrateFlushInFlight.get(lockKey);
  if (existing) {
    await existing;
    return;
  }

  const run = (async () => {
    // Mint/persist opaque mailbox route key and claim on server (SoT).
    const { deviceProofHeaders } = await import('./deviceProofContext');
    await ensureMailboxRouteKey(opts.identityId, opts.session, {
      apiBaseUrl: API_ENDPOINT,
      authToken: opts.authToken,
      buildAuthHeaders: async (method, path, body) => deviceProofHeaders(method, path, body)
    });

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
    // Only signal Drive-ready after a usable Google access token is minted.
    try {
      const { envelopeHasUsableSecrets } = await import('@par-noir/user-owned-storage');
      const env = await loadUnsealedCloudCredentials(opts.identityId, opts.session);
      if (envelopeHasUsableSecrets(env)) {
        await publishCloudDriveReady({
          authToken: opts.authToken,
          pnIdentifier: opts.identityId,
          apiEndpoint: API_ENDPOINT
        });
      }
    } catch {
      /* non-DOM / no secrets */
    }
  }
}

/** Promote local outbox → Sheets SoT via apply-inbound; rebuild throughway if wiped. */
export async function promoteAndReconcileOutbox(opts: {
  identityId: string;
  authToken: string;
  session: SealSession;
}): Promise<void> {
  const credentials = await loadUnsealedCloudCredentials(opts.identityId, opts.session);
  if (!credentials) return;

  let writer;
  try {
    writer = await createDeviceCloudWriter(opts.identityId, credentials);
  } catch {
    writer = null;
  }

  const { deviceProofHeaders } = await import('./deviceProofContext');
  await promoteLocalOutbox({
    apiBaseUrl: API_ENDPOINT,
    authToken: opts.authToken,
    identityId: opts.identityId,
    session: opts.session,
    buildAuthHeaders: async (method, path, body) => deviceProofHeaders(method, path, body),
    getCloudAccessToken: () => freshAccessTokenFromEnvelope(credentials) || undefined,
    writeOutboxCloudBackup: writer
      ? async (record) => {
          await writeOutboxToCloud(writer!, record);
        }
      : undefined
  });
}

export async function runMailboxFlush(opts: {
  identityId: string;
  authToken: string;
  session: SealSession;
}): Promise<void> {
  const credentials = await loadUnsealedCloudCredentials(opts.identityId, opts.session);
  if (!credentials) return;
  const { deviceProofHeaders } = await import('./deviceProofContext');
  const routeKey = await ensureMailboxRouteKey(opts.identityId, opts.session, {
    apiBaseUrl: API_ENDPOINT,
    authToken: opts.authToken,
    buildAuthHeaders: async (method, path, body) => deviceProofHeaders(method, path, body)
  });
  const applySocial = createApiSocialApplier({
    apiBaseUrl: API_ENDPOINT,
    authToken: opts.authToken,
    identityId: opts.identityId,
    buildAuthHeaders: async (method, path, body) => deviceProofHeaders(method, path, body),
    getCloudAccessToken: () => freshAccessTokenFromEnvelope(credentials) || undefined
  });
  const worker = new CloudFlushWorker();
  try {
    await worker.flush({
      identityId: opts.identityId,
      authToken: opts.authToken,
      apiBaseUrl: API_ENDPOINT,
      routeKey,
      credentials,
      applyJob: async (job, creds) => {
        if (SOCIAL_JOB_TYPES_APPLIED_VIA_API.has(job.jobType)) {
          return applySocial(job);
        }
        return materializeMailboxJob(opts.identityId, job, creds);
      },
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
  // 2 min — unlock + Drive reconnect already stress the API; avoid stacking with layout init.
  flushInterval = setInterval(() => {
    void promoteAndReconcileOutbox(opts)
      .then(() => runMailboxFlush(opts))
      .catch((e) => {
        const status = (e as Error & { status?: number })?.status;
        if (status === 401 || status === 403) {
          stopDeviceCloudWorkers();
        }
      });
  }, 120_000);
}

export function stopDeviceCloudWorkers(): void {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
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
