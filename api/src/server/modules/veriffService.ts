/**
 * Veriff identity verification: sessions, signed decision webhooks, decision fetch.
 * Station API authenticates with `X-AUTH-CLIENT`; webhooks and decision fetches are signed
 * with HMAC-SHA256 under the integration shared secret.
 *
 * Verification is part of the monetization membership: a session needs an active membership,
 * and every session Veriff bills is recorded as creator-fund opex (`VERIFF_COST_CENTS`).
 */

import crypto from 'crypto';
import { getDatabasePool } from '../utils/database';
import { EngagementService } from './engagementService';
import { VerificationIntegrationService } from './verificationIntegrationService';

const VERIFF_API_BASE = 'https://stationapi.veriff.com/v1';

/** Veriff bills a session once it is submitted and decided. */
const BILLED_STATUSES = new Set(['approved', 'declined', 'resubmission_requested']);

/** Statuses where the user can still finish (or resubmit in) the same session URL. */
const OPEN_STATUSES = ['created', 'started', 'submitted', 'resubmission_requested'];

/** Veriff session URLs expire after 7 days. */
const SESSION_REUSE_MS = 6 * 24 * 60 * 60 * 1000;

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
  id: string;
  code?: number | null;
  status?: string | null;
  person?: VeriffPerson | null;
  document?: VeriffDocument | null;
  decisionTime?: string | null;
}

export interface VeriffDecisionDto {
  status: string;
  sessionId: string | null;
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

/** One document per active verified pN. Null when the dedupe secret or document fields are missing. */
export function documentHmac(doc: VeriffDocument | null | undefined): string | null {
  const secret = process.env.VERIFICATION_DEDUPE_SECRET?.trim();
  const number = String(doc?.number || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const country = String(doc?.country || '').trim().toUpperCase();
  if (!secret || !number || !country) return null;
  return crypto.createHmac('sha256', secret).update(`${country}:${number}`).digest('hex');
}

function legalName(person: VeriffPerson | null | undefined): string | undefined {
  const name = [person?.firstName, person?.lastName]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(' ');
  return name || undefined;
}

export class VeriffService {
  static async createSession(
    pnIdentifier: string,
    returnUrl: string
  ): Promise<{ url: string; sessionId: string; reused: boolean }> {
    const cfg = veriffConfig();
    if (!cfg) throw new Error('veriff_not_configured');
    const pn = pnIdentifier.trim();
    if (await VerificationIntegrationService.isVerified(pn)) throw new Error('already_verified');
    if (!(await EngagementService.isMonetizationMaintenanceActive(pn))) {
      throw new Error('membership_required');
    }

    const db = getDatabasePool();
    const open = await db.query(
      `SELECT session_id, session_url, created_at FROM veriff_sessions
       WHERE pn_identifier = $1 AND status = ANY($2::text[])
       ORDER BY created_at DESC LIMIT 1`,
      [pn, OPEN_STATUSES]
    );
    const prior = open.rows[0] as
      | { session_id: string; session_url: string | null; created_at: string | Date }
      | undefined;
    if (prior?.session_url && Date.now() - new Date(prior.created_at).getTime() < SESSION_REUSE_MS) {
      return { url: prior.session_url, sessionId: prior.session_id, reused: true };
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

    await db.query(
      `INSERT INTO veriff_sessions (session_id, pn_identifier, session_url, status)
       VALUES ($1, $2, $3, 'created')
       ON CONFLICT (session_id) DO NOTHING`,
      [sessionId, pn, url]
    );
    return { url, sessionId, reused: false };
  }

  /** Signed Station webhook: decision payloads carry `verification`; event payloads carry `action`. */
  static async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
    const cfg = veriffConfig();
    if (!cfg) throw new Error('veriff_not_configured');
    if (!isValidVeriffSignature(rawBody, signature, cfg.sharedSecret)) {
      throw new Error('invalid_signature');
    }
    const payload = JSON.parse(rawBody.toString('utf8')) as {
      verification?: VeriffVerification;
      id?: string;
      action?: string;
    };
    if (payload.verification && typeof payload.verification.id === 'string') {
      await this.applyDecision(payload.verification);
      return;
    }
    if (typeof payload.id === 'string' && (payload.action === 'started' || payload.action === 'submitted')) {
      await getDatabasePool().query(
        `UPDATE veriff_sessions SET status = $2
         WHERE session_id = $1 AND status IN ('created', 'started')`,
        [payload.id, payload.action]
      );
    }
  }

  /**
   * Idempotent: approval marks the session's pN verified unless the document already backs
   * another active pN; billed statuses record the Veriff cost once per session.
   * Returns the stored session status (`duplicate` when the document guard rejected it).
   */
  static async applyDecision(v: VeriffVerification): Promise<{ status: string; pnIdentifier: string | null }> {
    const veriffStatus = normalizeStatus(v.status);
    const pool = getDatabasePool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sess = await client.query(
        `SELECT pn_identifier, status, cost_recorded_at FROM veriff_sessions
         WHERE session_id = $1 FOR UPDATE`,
        [v.id]
      );
      const row = sess.rows[0] as
        | { pn_identifier: string; status: string; cost_recorded_at: Date | null }
        | undefined;
      if (!row) {
        await client.query('ROLLBACK');
        return { status: veriffStatus, pnIdentifier: null };
      }
      const pn = String(row.pn_identifier);

      let status = veriffStatus;
      if (row.status === 'approved' || row.status === 'duplicate') {
        status = row.status;
      } else if (veriffStatus === 'approved') {
        const docHmac = documentHmac(v.document);
        if (docHmac) {
          await client.query(`SELECT pg_advisory_xact_lock(hashtext('veriff_doc:' || $1::text))`, [docHmac]);
          const dup = await client.query(
            `SELECT 1 FROM verified_identities
             WHERE document_hmac = $1 AND is_active = TRUE AND identity_id <> $2 LIMIT 1`,
            [docHmac, pn]
          );
          if (dup.rows.length > 0) status = 'duplicate';
        }
        if (status === 'approved') {
          await VerificationIntegrationService.syncVerificationStatus(
            pn,
            `veriff:${v.id}`,
            v.decisionTime || new Date().toISOString(),
            legalName(v.person),
            { documentHmac: docHmac, db: client }
          );
        }
      }

      await client.query(
        `UPDATE veriff_sessions SET status = $2, decision_code = $3, decided_at = COALESCE(decided_at, NOW())
         WHERE session_id = $1`,
        [v.id, status, typeof v.code === 'number' ? v.code : null]
      );

      const cost = costCents();
      if (BILLED_STATUSES.has(veriffStatus) && !row.cost_recorded_at && cost > 0) {
        await client.query(`UPDATE veriff_sessions SET cost_recorded_at = NOW() WHERE session_id = $1`, [v.id]);
        await client.query(
          `INSERT INTO creator_fund_opex_events (amount_cents, category, note)
           VALUES ($1, 'veriff', $2)`,
          [cost, `veriff session ${v.id}`]
        );
      }

      await client.query('COMMIT');
      return { status, pnIdentifier: pn };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** Owner-only: latest session decision, fetched from Veriff and applied. Person data only when approved. */
  static async getDecisionForPn(pnIdentifier: string): Promise<VeriffDecisionDto> {
    const cfg = veriffConfig();
    if (!cfg) throw new Error('veriff_not_configured');
    const pn = pnIdentifier.trim();
    const latest = await getDatabasePool().query(
      `SELECT session_id, status FROM veriff_sessions
       WHERE pn_identifier = $1 ORDER BY created_at DESC LIMIT 1`,
      [pn]
    );
    const row = latest.rows[0] as { session_id: string; status: string } | undefined;
    if (!row) return { status: 'none', sessionId: null };

    const sessionId = String(row.session_id);
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
    const body = (await res.json()) as { verification?: Omit<VeriffVerification, 'id'> | null };
    if (!body.verification) return { status: String(row.status), sessionId };

    const verification: VeriffVerification = { ...body.verification, id: sessionId };
    const applied = await this.applyDecision(verification);
    if (applied.status !== 'approved') return { status: applied.status, sessionId };
    return {
      status: 'approved',
      sessionId,
      person: {
        firstName: verification.person?.firstName ?? null,
        lastName: verification.person?.lastName ?? null,
        dateOfBirth: verification.person?.dateOfBirth ?? null
      },
      document: {
        number: verification.document?.number ?? null,
        type: verification.document?.type ?? null,
        country: verification.document?.country ?? null,
        state: verification.document?.state ?? null,
        validUntil: verification.document?.validUntil ?? null
      }
    };
  }
}
