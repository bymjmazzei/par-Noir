import type { FlushContext, MailboxJob } from './types.js';
import { isMailboxRouteKey } from './mailboxRouteKey.js';

export interface FlushResult {
  pulled: number;
  applied: number;
  acked: number;
  errors: string[];
}

/**
 * Pull throughway mailbox jobs, materialize with device-held credentials, then ack.
 * Never acks without a successful applyJob.
 * Claims and drains only the opaque claimed routeKey (server SoT).
 */
export class CloudFlushWorker {
  async flush(ctx: FlushContext): Promise<FlushResult> {
    if (!ctx.applyJob) {
      throw new Error('applyJob required — refuse ack-without-write');
    }
    if (!isMailboxRouteKey(ctx.routeKey)) {
      throw new Error('routeKey required — opaque claimed inbox route only');
    }
    const routeKey = ctx.routeKey.trim();
    const errors: string[] = [];
    const base = ctx.apiBaseUrl.replace(/\/$/, '');

    // A minted route is not drainable until it is bound to this identity.
    try {
      await claimMailboxRoute({
        apiBaseUrl: ctx.apiBaseUrl,
        authToken: ctx.authToken,
        identityId: ctx.identityId,
        routeKey,
        buildAuthHeaders: ctx.buildAuthHeaders
      });
    } catch (e) {
      errors.push(`route claim: ${e instanceof Error ? e.message : 'failed'}`);
    }

    const mergeHeaders = async (
      method: string,
      pathWithQuery: string,
      body?: unknown
    ): Promise<Record<string, string>> => {
      const extra = ctx.buildAuthHeaders
        ? await ctx.buildAuthHeaders(method, pathWithQuery, body)
        : {};
      return {
        Authorization: `Bearer ${ctx.authToken}`,
        Accept: 'application/json',
        ...extra
      };
    };

    const q = new URLSearchParams({
      pnIdentifier: ctx.identityId,
      routeKey,
      limit: '100'
    });
    const path = `/api/mailbox/pending?${q}`;
    const pendingRes = await fetch(`${base}${path}`, {
      headers: await mergeHeaders('GET', path)
    });
    if (!pendingRes.ok) {
      const err = new Error(`mailbox pending failed: HTTP ${pendingRes.status}`);
      (err as Error & { status?: number }).status = pendingRes.status;
      throw err;
    }
    const body = (await pendingRes.json()) as { jobs?: MailboxJob[] };
    const jobs: MailboxJob[] = (body.jobs ?? []).map((job) => ({
      ...job,
      routeKey: job.routeKey || routeKey
    }));

    const ackedByRoute = new Map<string, string[]>();
    let applied = 0;

    for (const job of jobs) {
      try {
        const ok = await ctx.applyJob(job, ctx.credentials);
        if (ok) {
          applied += 1;
          const rk = job.routeKey || routeKey;
          const list = ackedByRoute.get(rk) || [];
          list.push(job.id);
          ackedByRoute.set(rk, list);
        }
      } catch (e) {
        errors.push(`${job.id}: ${e instanceof Error ? e.message : 'apply failed'}`);
      }
    }

    let acked = 0;
    for (const [ackRouteKey, jobIds] of ackedByRoute) {
      const ackBody = {
        pnIdentifier: ctx.identityId,
        routeKey: ackRouteKey,
        jobIds
      };
      const ackPath = '/api/mailbox/ack';
      const ackRes = await fetch(`${base}${ackPath}`, {
        method: 'POST',
        headers: {
          ...(await mergeHeaders('POST', ackPath, ackBody)),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ackBody)
      });
      if (!ackRes.ok) {
        errors.push(`ack failed: HTTP ${ackRes.status}`);
        if (ackRes.status === 401 || ackRes.status === 403) {
          const err = new Error(`mailbox ack failed: HTTP ${ackRes.status}`);
          (err as Error & { status?: number }).status = ackRes.status;
          throw err;
        }
      } else {
        const parsed = (await ackRes.json()) as { acked?: number };
        acked += parsed.acked ?? jobIds.length;
      }
    }

    return { pulled: jobs.length, applied, acked, errors };
  }
}

/**
 * Bind a minted route to this identity. Must happen before the route is handed
 * to any peer, and before /pending will serve it — an unclaimed route is not
 * drainable, because holding a route key proves nothing about owning it.
 * Returns the authoritative routeKey from the server (may adopt an existing binding).
 */
export async function claimMailboxRoute(opts: {
  apiBaseUrl: string;
  authToken: string;
  identityId: string;
  routeKey: string;
  buildAuthHeaders?: (
    method: string,
    path: string,
    body?: unknown
  ) => Record<string, string> | Promise<Record<string, string>>;
}): Promise<string> {
  const base = opts.apiBaseUrl.replace(/\/$/, '');
  const path = '/api/mailbox/route';
  const body = { pnIdentifier: opts.identityId, routeKey: opts.routeKey };
  const extra = opts.buildAuthHeaders
    ? await opts.buildAuthHeaders('POST', path, body)
    : {};
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.authToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...extra
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`mailbox route claim failed: HTTP ${res.status}`);
  const parsed = (await res.json()) as { routeKey?: string };
  if (!isMailboxRouteKey(parsed.routeKey)) {
    throw new Error('mailbox route claim returned invalid routeKey');
  }
  return parsed.routeKey.trim();
}

/** Ack applied jobs. Only call after the write landed. */
export async function ackMailboxJobsRemote(opts: {
  apiBaseUrl: string;
  authToken: string;
  identityId: string;
  routeKey: string;
  jobIds: string[];
  buildAuthHeaders?: (
    method: string,
    path: string,
    body?: unknown
  ) => Record<string, string> | Promise<Record<string, string>>;
}): Promise<number> {
  if (!opts.jobIds.length) return 0;
  if (!isMailboxRouteKey(opts.routeKey)) {
    throw new Error('routeKey required');
  }
  const base = opts.apiBaseUrl.replace(/\/$/, '');
  const path = '/api/mailbox/ack';
  const body = {
    pnIdentifier: opts.identityId,
    routeKey: opts.routeKey.trim(),
    jobIds: opts.jobIds
  };
  const extra = opts.buildAuthHeaders
    ? await opts.buildAuthHeaders('POST', path, body)
    : {};
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.authToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...extra
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`mailbox ack failed: HTTP ${res.status}`);
  const parsed = (await res.json()) as { acked?: number };
  return parsed.acked ?? opts.jobIds.length;
}

export async function fetchMailboxPending(
  apiBaseUrl: string,
  authToken: string,
  identityId: string,
  routeKey: string,
  limit = 100
): Promise<MailboxJob[]> {
  if (!isMailboxRouteKey(routeKey)) {
    throw new Error('routeKey required');
  }
  const base = apiBaseUrl.replace(/\/$/, '');
  const q = new URLSearchParams({
    pnIdentifier: identityId,
    routeKey: routeKey.trim(),
    limit: String(limit)
  });
  const res = await fetch(`${base}/api/mailbox/pending?${q}`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) throw new Error(`mailbox pending failed: HTTP ${res.status}`);
  const body = (await res.json()) as { jobs?: MailboxJob[] };
  return body.jobs ?? [];
}

export async function enqueueMailboxThroughway(opts: {
  apiBaseUrl: string;
  authToken: string;
  identityId: string;
  routeKey: string;
  jobType: string;
  payload: Record<string, unknown>;
}): Promise<{ created: boolean; jobId?: string }> {
  if (!isMailboxRouteKey(opts.routeKey)) {
    throw new Error('routeKey required');
  }
  const base = opts.apiBaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/mailbox/enqueue`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.authToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      pnIdentifier: opts.identityId,
      routeKey: opts.routeKey.trim(),
      jobType: opts.jobType,
      payload: opts.payload
    })
  });
  if (!res.ok) throw new Error(`mailbox enqueue failed: HTTP ${res.status}`);
  const body = (await res.json()) as { created?: boolean; job?: { id?: string } };
  return { created: !!body.created, jobId: body.job?.id };
}

export async function lookupMailboxThroughway(opts: {
  apiBaseUrl: string;
  authToken: string;
  identityId: string;
  routeKey: string;
  jobType: string;
  messageId?: string;
  commentId?: string;
  fileId?: string;
  requestId?: string;
}): Promise<{ found: boolean; pending: boolean }> {
  if (!isMailboxRouteKey(opts.routeKey)) {
    throw new Error('routeKey required');
  }
  const base = opts.apiBaseUrl.replace(/\/$/, '');
  const q = new URLSearchParams({
    pnIdentifier: opts.identityId,
    routeKey: opts.routeKey.trim(),
    jobType: opts.jobType
  });
  if (opts.messageId) q.set('messageId', opts.messageId);
  if (opts.commentId) q.set('commentId', opts.commentId);
  if (opts.fileId) q.set('fileId', opts.fileId);
  if (opts.requestId) q.set('requestId', opts.requestId);
  const res = await fetch(`${base}/api/mailbox/lookup?${q}`, {
    headers: {
      Authorization: `Bearer ${opts.authToken}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) throw new Error(`mailbox lookup failed: HTTP ${res.status}`);
  const body = (await res.json()) as { found?: boolean; pending?: boolean };
  return { found: !!body.found, pending: !!body.pending };
}

export async function migrateServerSecretsToDevice(opts: {
  apiBaseUrl: string;
  authToken: string;
  identityId: string;
  /** Persist sealed envelope after receiving server credentials */
  sealAndStore: (credentials: unknown) => Promise<void>;
}): Promise<{ migrated: boolean }> {
  const base = opts.apiBaseUrl.replace(/\/$/, '');
  const getRes = await fetch(
    `${base}/api/storage/credentials/${encodeURIComponent(opts.identityId)}`,
    {
      headers: {
        Authorization: `Bearer ${opts.authToken}`,
        Accept: 'application/json'
      }
    }
  );
  if (getRes.status === 404) return { migrated: false };
  if (!getRes.ok) throw new Error(`get credentials failed: HTTP ${getRes.status}`);
  const data = (await getRes.json()) as { credentials?: unknown; success?: boolean };
  const credentials = data.credentials;
  if (!credentials || typeof credentials !== 'object') return { migrated: false };

  const hasSecret = JSON.stringify(credentials).match(
    /refreshToken|refresh_token|secretAccessKey|password|sasToken|connectionString|accessToken|access_token/
  );
  if (!hasSecret) return { migrated: false };

  await opts.sealAndStore(credentials);

  const purgeRes = await fetch(
    `${base}/api/storage/credentials/${encodeURIComponent(opts.identityId)}/purge-secrets`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.authToken}`,
        Accept: 'application/json'
      }
    }
  );
  if (!purgeRes.ok && purgeRes.status !== 409) {
    throw new Error(`purge-secrets failed: HTTP ${purgeRes.status}`);
  }
  return { migrated: true };
}
