import type { FlushContext, MailboxJob } from './types.js';

export interface FlushResult {
  pulled: number;
  applied: number;
  acked: number;
  errors: string[];
}

/**
 * Pull throughway mailbox jobs, materialize with device-held credentials, then ack.
 * Never acks without a successful applyJob.
 * Claims by opaque routeKey (and optional legacy route for pre-exchange connections).
 */
export class CloudFlushWorker {
  async flush(ctx: FlushContext): Promise<FlushResult> {
    if (!ctx.applyJob) {
      throw new Error('applyJob required — refuse ack-without-write');
    }
    const errors: string[] = [];
    const base = ctx.apiBaseUrl.replace(/\/$/, '');

    // A minted route is not drainable until it is bound to this identity, so
    // claim before polling. Idempotent, and the legacy route needs no claim
    // because the server derives it from the bearer.
    if (ctx.routeKey) {
      try {
        await claimMailboxRoute({
          apiBaseUrl: ctx.apiBaseUrl,
          authToken: ctx.authToken,
          identityId: ctx.identityId,
          routeKey: ctx.routeKey,
          buildAuthHeaders: ctx.buildAuthHeaders
        });
      } catch (e) {
        errors.push(`route claim: ${e instanceof Error ? e.message : 'failed'}`);
      }
    }
    const claimSpecs: Array<{ routeKey?: string }> = [];
    if (ctx.routeKey) claimSpecs.push({ routeKey: ctx.routeKey });
    if (ctx.legacyRouteKey && ctx.legacyRouteKey !== ctx.routeKey) {
      claimSpecs.push({ routeKey: ctx.legacyRouteKey });
    }
    // Always also claim via server legacy(pn) so pre-exchange drops are not stranded.
    claimSpecs.push({});

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

    const seen = new Set<string>();
    const jobs: MailboxJob[] = [];
    for (const spec of claimSpecs) {
      const q = new URLSearchParams({
        pnIdentifier: ctx.identityId,
        limit: '100'
      });
      if (spec.routeKey) q.set('routeKey', spec.routeKey);
      const path = `/api/mailbox/pending?${q}`;
      const pendingRes = await fetch(`${base}${path}`, {
        headers: await mergeHeaders('GET', path)
      });
      if (!pendingRes.ok) {
        // A route this identity does not own is not a session failure: skip the
        // spec and keep draining the others. Without this, one unclaimed route
        // aborts the whole flush, including the legacy route that does work.
        if (pendingRes.status === 403) {
          errors.push(`pending ${spec.routeKey ? 'route' : 'legacy'}: HTTP 403`);
          continue;
        }
        const err = new Error(`mailbox pending failed: HTTP ${pendingRes.status}`);
        (err as Error & { status?: number }).status = pendingRes.status;
        throw err;
      }
      const body = (await pendingRes.json()) as { jobs?: MailboxJob[] };
      for (const job of body.jobs ?? []) {
        if (seen.has(job.id)) continue;
        seen.add(job.id);
        jobs.push({
          ...job,
          routeKey: job.routeKey || spec.routeKey
        });
      }
    }

    const ackedByRoute = new Map<string, string[]>();
    let applied = 0;

    for (const job of jobs) {
      try {
        const ok = await ctx.applyJob(job, ctx.credentials);
        if (ok) {
          applied += 1;
          const rk = job.routeKey || ctx.routeKey || ctx.legacyRouteKey || '';
          const list = ackedByRoute.get(rk) || [];
          list.push(job.id);
          ackedByRoute.set(rk, list);
        }
      } catch (e) {
        errors.push(`${job.id}: ${e instanceof Error ? e.message : 'apply failed'}`);
      }
    }

    let acked = 0;
    for (const [routeKey, jobIds] of ackedByRoute) {
      const ackBody = {
        pnIdentifier: ctx.identityId,
        ...(routeKey ? { routeKey } : {}),
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
}): Promise<boolean> {
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
  return res.ok;
}

/** Ack applied jobs. Only call after the write landed. */
export async function ackMailboxJobsRemote(opts: {
  apiBaseUrl: string;
  authToken: string;
  identityId: string;
  routeKey?: string;
  jobIds: string[];
  buildAuthHeaders?: (
    method: string,
    path: string,
    body?: unknown
  ) => Record<string, string> | Promise<Record<string, string>>;
}): Promise<number> {
  if (!opts.jobIds.length) return 0;
  const base = opts.apiBaseUrl.replace(/\/$/, '');
  const path = '/api/mailbox/ack';
  const body = {
    pnIdentifier: opts.identityId,
    ...(opts.routeKey ? { routeKey: opts.routeKey } : {}),
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
  routeKey?: string,
  limit = 100
): Promise<MailboxJob[]> {
  const base = apiBaseUrl.replace(/\/$/, '');
  const q = new URLSearchParams({
    pnIdentifier: identityId,
    limit: String(limit)
  });
  if (routeKey) q.set('routeKey', routeKey);
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
  /** @deprecated Prefer routeKey only. */
  recipientIdentityId?: string;
}): Promise<{ created: boolean; jobId?: string }> {
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
      routeKey: opts.routeKey,
      ...(opts.recipientIdentityId ? { recipientIdentityId: opts.recipientIdentityId } : {}),
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
  /** @deprecated Prefer routeKey only. */
  recipientIdentityId?: string;
}): Promise<{ found: boolean; pending: boolean }> {
  const base = opts.apiBaseUrl.replace(/\/$/, '');
  const q = new URLSearchParams({
    pnIdentifier: opts.identityId,
    routeKey: opts.routeKey,
    jobType: opts.jobType
  });
  if (opts.recipientIdentityId) q.set('recipientIdentityId', opts.recipientIdentityId);
  if (opts.messageId) q.set('messageId', opts.messageId);
  if (opts.commentId) q.set('commentId', opts.commentId);
  if (opts.fileId) q.set('fileId', opts.fileId);
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
