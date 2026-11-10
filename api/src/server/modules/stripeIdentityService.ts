/**
 * Stripe Identity verification: hosted document + selfie sessions, decision fetch, redaction.
 * Calls use a restricted key (`STRIPE_IDENTITY_RESTRICTED_KEY`) with the "sensitive verification
 * results" permission so date of birth and document number can be read; Stripe only serves those
 * fields for a limited window after the session is verified.
 *
 * Nothing links a pN to a Stripe session on our side: the session carries no pN metadata, its id
 * travels back to the user's own pN inside an API-signed state token, and the verified decision
 * becomes a user-held credential (`verificationCredentialService`). The session is redacted at
 * Stripe right after the credential is issued. Each pN verifies (and pays) on its own, so the same
 * ID document can verify several pNs.
 *
 * Verification is part of the monetization membership: a session needs an active membership, and
 * every session Stripe bills is recorded once as creator-fund opex (`STRIPE_IDENTITY_COST_CENTS`).
 */

import Stripe from 'stripe';
import { getDatabasePool } from '../utils/database';
import { EngagementService } from './engagementService';
import { PNOAuthService } from './pnOAuthService';
import { VerificationIntegrationService } from './verificationIntegrationService';
import { VerificationCredentialService } from './verificationCredentialService';

const STATE_TYP = 'identity-state+jwt' as const;
const STATE_TTL_SECONDS = 7 * 24 * 60 * 60;

/** `requires_input` errors that end a session before Stripe runs (and bills) a check. */
const UNBILLED_ERRORS = new Set([
  'abandoned',
  'consent_declined',
  'country_not_supported',
  'device_not_supported',
  'under_supported_age'
]);

export interface IdentityPerson {
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | null;
}

export interface IdentityDocument {
  number?: string | null;
  type?: string | null;
  country?: string | null;
  state?: string | null;
  validUntil?: string | null;
}

/**
 * `approved` | `pending` (not submitted yet) | `review` (Stripe processing) |
 * `resubmission_requested` (a check failed; the same session can be retried) | `declined` | `expired`.
 */
export interface IdentityDecisionDto {
  status: string;
  sessionId: string;
  /** Fresh hosted URL while the session still needs input from the user. */
  url?: string;
  credential?: string;
  expiresAt?: string;
  person?: IdentityPerson;
  document?: IdentityDocument;
}

export function stripeIdentityConfigured(): boolean {
  return Boolean(process.env.STRIPE_IDENTITY_RESTRICTED_KEY?.trim());
}

function identityStripe(): Stripe {
  const key = process.env.STRIPE_IDENTITY_RESTRICTED_KEY?.trim();
  if (!key) throw new Error('identity_not_configured');
  return new Stripe(key, { typescript: true });
}

function costCents(): number {
  const n = parseInt(process.env.STRIPE_IDENTITY_COST_CENTS?.trim() || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Whether Stripe ran (and bills) a check for a session in this state. */
export function isBilledSession(session: Pick<Stripe.Identity.VerificationSession, 'status' | 'last_error'>): boolean {
  if (session.status === 'verified') return true;
  if (session.status !== 'requires_input') return false;
  const code = session.last_error?.code;
  return Boolean(code) && !UNBILLED_ERRORS.has(String(code));
}

function isoDate(d: { day: number | null; month: number | null; year: number | null } | null | undefined): string | null {
  if (!d?.year || !d.month || !d.day) return null;
  return `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

function reportOf(session: Stripe.Identity.VerificationSession): Stripe.Identity.VerificationReport | null {
  const r = session.last_verification_report;
  return r && typeof r !== 'string' ? r : null;
}

export class StripeIdentityService {
  static async createSession(
    pnIdentifier: string,
    returnUrl: string
  ): Promise<{ url: string; sessionId: string; state: string }> {
    const stripe = identityStripe();
    const pn = pnIdentifier.trim();
    if (await VerificationIntegrationService.isVerified(pn)) throw new Error('already_verified');
    if (!(await EngagementService.isMonetizationMaintenanceActive(pn))) {
      throw new Error('membership_required');
    }

    let session: Stripe.Identity.VerificationSession;
    try {
      session = await stripe.identity.verificationSessions.create({
        type: 'document',
        options: { document: { require_matching_selfie: true, require_live_capture: true } },
        return_url: returnUrl
      });
    } catch (e) {
      console.error('[StripeIdentity] session create failed:', e instanceof Error ? e.message : 'unknown');
      throw new Error('identity_upstream_error');
    }
    if (!session.id || !session.url) throw new Error('identity_upstream_error');

    const state = await PNOAuthService.signAttestation(STATE_TYP, { sid: session.id, pn }, STATE_TTL_SECONDS);
    return { url: session.url, sessionId: session.id, state };
  }

  /** Record Stripe's charge for a billed session exactly once (webhook and decision fetch both call this). */
  static async recordBilledSession(sessionId: string): Promise<boolean> {
    const cost = costCents();
    if (!sessionId || cost <= 0) return false;
    const pool = getDatabasePool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO identity_billed_sessions (session_id) VALUES ($1)
         ON CONFLICT (session_id) DO NOTHING RETURNING session_id`,
        [sessionId]
      );
      if (ins.rows.length > 0) {
        await client.query(
          `INSERT INTO creator_fund_opex_events (amount_cents, category, note)
           VALUES ($1, 'stripe_identity', $2)`,
          [cost, `stripe identity session ${sessionId}`]
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

  /** `identity.verification_session.*` webhook: only books the cost. Verification is issued on decision fetch. */
  static async handleWebhookSession(session: Stripe.Identity.VerificationSession): Promise<void> {
    if (session?.id && isBilledSession(session)) await this.recordBilledSession(session.id);
  }

  /**
   * Owner-only: decision for the session named in the caller's state token. A verified session
   * issues the user-held credential, sets the verified flag, and is then redacted at Stripe;
   * person and document data are returned only then.
   */
  static async decisionFromState(pnIdentifier: string, state: unknown): Promise<IdentityDecisionDto> {
    const stripe = identityStripe();
    const pn = pnIdentifier.trim();
    const claims = typeof state === 'string' ? PNOAuthService.verifyAttestation(state, STATE_TYP) : null;
    const sessionId = typeof claims?.sid === 'string' ? claims.sid : '';
    if (!claims || !sessionId || claims.pn !== pn) throw new Error('invalid_state');

    let session: Stripe.Identity.VerificationSession;
    try {
      session = await stripe.identity.verificationSessions.retrieve(sessionId, {
        expand: [
          'verified_outputs',
          'verified_outputs.dob',
          'last_verification_report',
          'last_verification_report.document.number',
          'last_verification_report.document.expiration_date'
        ]
      });
    } catch (e) {
      console.error('[StripeIdentity] decision fetch failed:', e instanceof Error ? e.message : 'unknown');
      throw new Error('identity_upstream_error');
    }

    if (isBilledSession(session)) await this.recordBilledSession(sessionId);

    if (session.status === 'processing') return { status: 'review', sessionId };
    if (session.status === 'canceled') return { status: 'expired', sessionId };
    if (session.status === 'requires_input') {
      const code = session.last_error?.code;
      const status = !code ? 'pending' : UNBILLED_ERRORS.has(String(code)) ? 'expired' : 'resubmission_requested';
      return session.url && status !== 'expired' ? { status, sessionId, url: session.url } : { status, sessionId };
    }
    if (session.status !== 'verified') return { status: 'unknown', sessionId };
    if (session.redaction) return { status: 'expired', sessionId };

    const out = session.verified_outputs;
    const doc = reportOf(session)?.document ?? null;
    const person: IdentityPerson = {
      firstName: out?.first_name ?? doc?.first_name ?? null,
      lastName: out?.last_name ?? doc?.last_name ?? null,
      dateOfBirth: isoDate(out?.dob) ?? isoDate(doc?.dob)
    };
    const { credential, expiresAt } = await VerificationCredentialService.issue(pn, {
      givenName: person.firstName,
      familyName: person.lastName,
      birthdate: person.dateOfBirth
    });
    const document: IdentityDocument = {
      number: doc?.number ?? null,
      type: doc?.type ?? null,
      country: doc?.issuing_country ?? null,
      state: doc?.address?.state ?? out?.address?.state ?? null,
      validUntil: isoDate(doc?.expiration_date)
    };

    try {
      await stripe.identity.verificationSessions.redact(sessionId);
    } catch (e) {
      console.error('[StripeIdentity] redact failed:', e instanceof Error ? e.message : 'unknown');
    }

    return { status: 'approved', sessionId, credential, expiresAt, person, document };
  }
}
