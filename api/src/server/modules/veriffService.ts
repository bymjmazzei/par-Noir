/**
 * Veriff identity verification: sessions, signed webhooks, decision fetch.
 * Station API authenticates with `X-AUTH-CLIENT`; webhooks and decision fetches are signed
 * with HMAC-SHA256 under the integration shared secret.
 *
 * Nothing links a pN to a Veriff session on our side: the session id travels back to the user's
 * own pN inside an API-signed state token, and the approved decision becomes a user-held
 * credential (`verificationCredentialService`). Each pN verifies (and pays) on its own, so the
 * same ID document can verify several pNs.
 *
 * Verification is part of the monetization membership: a session needs an active membership,
 * and every session Veriff bills is recorded once as creator-fund opex (`VERIFF_COST_CENTS`).
 */

import crypto from 'crypto';
import { getDatabasePool } from '../utils/database';
import { EngagementService } from './engagementService';
import { PNOAuthService } from './pnOAuthService';
import { VerificationIntegrationService } from './verificationIntegrationService';
import { VerificationCredentialService } from './verificationCredentialService';

const VERIFF_API_BASE = 'https://stationapi.veriff.com/v1';
const STATE_TYP = 'veriff-state+jwt' as const;

/** Veriff bills a session once it is submitted and decided. */
const BILLED_STATUSES = new Set(['approved', 'declined', 'resubmission_requested']);

/** Veriff session URLs expire after 7 days. */
const STATE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface VeriffConfig {
  apiKey: string;
  sharedSecret: string;
}

export function veriffConfig(): VeriffConfig | null {
  const apiKey = process.env.VERIFF_API_KEY?.trim();
  const sharedSecret = process.env.VERIFF_SHARED_SECRET?.trim();
  if (!apiKey || !sharedSecret) return null;
  return { apiKey, sharedSecret };
}

export function veriffSignature(payload: string | Buffer, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function isValidVeriffSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  const given = (signature || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const expected = Buffer.from(veriffSignature(rawBody, secret), 'hex');
  return crypto.timingSafeEqual(Buffer.from(given, 'hex'), expected);
}

export interface VeriffPerson {
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | null;
}

export interface VeriffDocument {
  number?: string | null;
  type?: string | null;
  country?: string | null;
  state?: string | null;
  validUntil?: string | null;
}

export interface VeriffVerification {
  id?: string;
  code?: number | null;
  status?: string | null;
  person?: VeriffPerson | null;
  document?: VeriffDocument | null;
  decisionTime?: string | null;
}

export interface VeriffDecisionDto {
  status: string;
  sessionId: string;
  credential?: string;
  expiresAt?: string;
  person?: VeriffPerson;
  document?: VeriffDocument;
}

function costCents(): number {
  const n = parseInt(process.env.VERIFF_COST_CENTS?.trim() || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeStatus(raw: unknown): string {
  const s = String(raw || '').trim().toLowerCase();
  return /^[a-z_]{1,32}$/.test(s) ? s : 'unknown';
}

export class VeriffService {
  static async createSession(
    pnIdentifier: string,
    returnUrl: string
  ): Promise<{ url: string; sessionId: string; state: string }> {
    const cfg = veriffConfig();
    if (!cfg) throw new Error('veriff_not_configured');
    const pn = pnIdentifier.trim();
    if (await VerificationIntegrationService.isVerified(pn)) throw new Error('already_verified');
    if (!(await EngagementService.isMonetizationMaintenanceActive(pn))) {
      throw new Error('membership_required');
    }

    const res = await fetch(`${VERIFF_API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AUTH-CLIENT': cfg.apiKey },
      body: JSON.stringify({ verification: { callback: returnUrl } })
    });
    if (!res.ok) {
      console.error('[Veriff] session create failed:', res.status);
      throw new Error('veriff_upstream_error');
    }
    const body = (await res.json()) as { verification?: { id?: string; url?: string } };
    const sessionId = body.verification?.id;
    const url = body.verification?.url;
    if (!sessionId || !url) throw new Error('veriff_upstream_error');

    const state = await PNOAuthService.signAttestation(STATE_TYP, { sid: sessionId, pn }, STATE_TTL_SECONDS);
    return { url, sessionId, state };
  }

  /** Record Veriff's charge for a billed session exactly once (webhook and decision fetch both call this). */
  static async recordBilledSession(sessionId: string, status: string): Promise<boolean> {
    const cost = costCents();
    if (!sessionId || !BILLED_STATUSES.has(status) || cost <= 0) return false;
    const pool = getDatabasePool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO veriff_billed_sessions (session_id) VALUES ($1)
         ON CONFLICT (session_id) DO NOTHING RETURNING session_id`,
        [sessionId]
      );
      if (ins.rows.length > 0) {
        await client.query(
          `INSERT INTO creator_fund_opex_events (amount_cents, category, note)
           VALUES ($1, 'veriff', $2)`,
          [cost, `veriff session ${sessionId}`]
        );
      }
      await client.query('COMMIT');
      return ins.rows.length > 0;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** Signed Station webhook: only books the cost. Verification is issued when the pN fetches its decision. */
  static async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
    const cfg = veriffConfig();
    if (!cfg) throw new Error('veriff_not_configured');
    if (!isValidVeriffSignature(rawBody, signature, cfg.sharedSecret)) {
      throw new Error('invalid_signature');
    }
    const payload = JSON.parse(rawBody.toString('utf8')) as { verification?: VeriffVerification };
    const v = payload.verification;
    if (v && typeof v.id === 'string') {
      await this.recordBilledSession(v.id, normalizeStatus(v.status));
    }
  }

  /**
   * Owner-only: decision for the session named in the caller's state token. Approval issues the
   * user-held credential and sets the verified flag; person data is returned only then.
   */
  static async decisionFromState(pnIdentifier: string, state: unknown): Promise<VeriffDecisionDto> {
    const cfg = veriffConfig();
    if (!cfg) throw new Error('veriff_not_configured');
    const pn = pnIdentifier.trim();
    const claims = typeof state === 'string' ? PNOAuthService.verifyAttestation(state, STATE_TYP) : null;
    const sessionId = typeof claims?.sid === 'string' ? claims.sid : '';
    if (!claims || !sessionId || claims.pn !== pn) throw new Error('invalid_state');

    const res = await fetch(`${VERIFF_API_BASE}/sessions/${encodeURIComponent(sessionId)}/decision`, {
      headers: {
        'X-AUTH-CLIENT': cfg.apiKey,
        'X-HMAC-SIGNATURE': veriffSignature(sessionId, cfg.sharedSecret)
      }
    });
    if (!res.ok) {
      console.error('[Veriff] decision fetch failed:', res.status);
      throw new Error('veriff_upstream_error');
    }
    const body = (await res.json()) as { verification?: VeriffVerification | null };
    const v = body.verification;
    if (!v) return { status: 'pending', sessionId };

    const status = normalizeStatus(v.status);
    await this.recordBilledSession(sessionId, status);
    if (status !== 'approved') return { status, sessionId };

    const person: VeriffPerson = {
      firstName: v.person?.firstName ?? null,
      lastName: v.person?.lastName ?? null,
      dateOfBirth: v.person?.dateOfBirth ?? null
    };
    const { credential, expiresAt } = await VerificationCredentialService.issue(pn, {
      givenName: person.firstName,
      familyName: person.lastName,
      birthdate: person.dateOfBirth
    });
    return {
      status: 'approved',
      sessionId,
      credential,
      expiresAt,
      person,
      document: {
        number: v.document?.number ?? null,
        type: v.document?.type ?? null,
        country: v.document?.country ?? null,
        state: v.document?.state ?? null,
        validUntil: v.document?.validUntil ?? null
      }
    };
  }
}
