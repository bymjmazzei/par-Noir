/**
 * Per-pN idle lock policy and browser binding for first-party sessions.
 *
 * The client enforces idle precisely (lastActiveAt vs now). The server backstop
 * refuses a refresh once a family has gone idle longer than the policy plus one
 * access-token lifetime, so a killed client timer cannot keep a session alive.
 */

import express from 'express';
import { getDatabasePool } from '../utils/database';
import { hashIdentifier, safeLogger } from '../../utils/logger';

export const IDLE_MINUTE_OPTIONS = [5, 15, 30, 60, 240, 480] as const;
export const DEFAULT_IDLE_MINUTES = 60;

export interface SessionPolicy {
  idleMinutes: number;
  trustedDevice: boolean;
}

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  idleMinutes: DEFAULT_IDLE_MINUTES,
  trustedDevice: false,
};

const BROWSER_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function normalizeBrowserId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return BROWSER_ID_RE.test(trimmed) ? trimmed : undefined;
}

export function normalizeSessionPolicy(raw: unknown): SessionPolicy | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as { idleMinutes?: unknown; trustedDevice?: unknown };
  const idle = Number(body.idleMinutes);
  if (!(IDLE_MINUTE_OPTIONS as readonly number[]).includes(idle)) return null;
  return { idleMinutes: idle, trustedDevice: body.trustedDevice === true };
}

/** 0 means no idle lock (trusted device); the 30-day refresh cap still applies. */
export function idleTimeoutSeconds(policy: SessionPolicy): number {
  return policy.trustedDevice ? 0 : policy.idleMinutes * 60;
}

export function isFamilyIdleExpired(
  lastRefreshAt: Date | string | null | undefined,
  policy: SessionPolicy,
  accessTokenLifetimeMs: number,
  now: number = Date.now()
): boolean {
  if (policy.trustedDevice || !lastRefreshAt) return false;
  const last = new Date(lastRefreshAt).getTime();
  if (!Number.isFinite(last)) return false;
  return now - last > policy.idleMinutes * 60_000 + accessTokenLifetimeMs;
}

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

export async function getSessionPolicy(pnIdentifier: string | undefined): Promise<SessionPolicy> {
  if (!pnIdentifier) return DEFAULT_SESSION_POLICY;
  try {
    const result = await getDatabasePool().query(
      'SELECT idle_minutes, trusted_device FROM pn_session_policy WHERE pn_identifier = $1',
      [normalizePn(pnIdentifier)]
    );
    const row = result.rows[0] as { idle_minutes?: number; trusted_device?: boolean } | undefined;
    if (!row) return DEFAULT_SESSION_POLICY;
    return (
      normalizeSessionPolicy({ idleMinutes: row.idle_minutes, trustedDevice: row.trusted_device }) ??
      DEFAULT_SESSION_POLICY
    );
  } catch (error) {
    safeLogger.warn('[SessionPolicy] read failed; using default', {
      err: error instanceof Error ? error.message : String(error),
    });
    return DEFAULT_SESSION_POLICY;
  }
}

export async function setSessionPolicy(pnIdentifier: string, policy: SessionPolicy): Promise<void> {
  await getDatabasePool().query(
    `INSERT INTO pn_session_policy (pn_identifier, idle_minutes, trusted_device, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (pn_identifier)
     DO UPDATE SET idle_minutes = $2, trusted_device = $3, updated_at = NOW()`,
    [normalizePn(pnIdentifier), policy.idleMinutes, policy.trustedDevice]
  );
}

export function setupSessionPolicyRoutes(app: express.Application): void {
  app.get('/api/session/policy', async (req, res) => {
    const { requireFirstPartyOAuthClient } = await import('./deviceCapabilityService');
    const payload = requireFirstPartyOAuthClient(req, res);
    if (!payload?.pnIdentifier) return;
    const policy = await getSessionPolicy(payload.pnIdentifier);
    return res.json({ ...policy, idleTimeoutS: idleTimeoutSeconds(policy) });
  });

  app.put('/api/session/policy', async (req, res) => {
    const { requireFirstPartyOAuthClient } = await import('./deviceCapabilityService');
    const payload = requireFirstPartyOAuthClient(req, res);
    if (!payload?.pnIdentifier) return;
    const policy = normalizeSessionPolicy(req.body);
    if (!policy) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: `idleMinutes must be one of ${IDLE_MINUTE_OPTIONS.join(', ')}`,
      });
    }
    try {
      await setSessionPolicy(payload.pnIdentifier, policy);
      return res.json({ ...policy, idleTimeoutS: idleTimeoutSeconds(policy) });
    } catch (error) {
      safeLogger.error('[SessionPolicy] write failed', {
        pnIdHash: hashIdentifier(payload.pnIdentifier),
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'server_error' });
    }
  });
}
