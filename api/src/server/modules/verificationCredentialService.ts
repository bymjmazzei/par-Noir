/**
 * User-held verification credential: an API-signed JWT (`typ: pn-verified+jwt`, checkable via
 * `/.well-known/jwks.json`) carrying the verified name and birth date for one pN. The pN keeps it
 * in its own encrypted storage; the server keeps only the verified-until flag and can rebuild that
 * flag from the credential (`present`) or move it to a successor pN (`reissue`).
 */

import crypto from 'crypto';
import type { Pool } from 'pg';
import { getDatabasePool } from '../utils/database';
import { PNOAuthService } from './pnOAuthService';
import { isSuccessorOf } from './identitySuccessionService';
import { VerificationIntegrationService } from './verificationIntegrationService';

export const CREDENTIAL_TYP = 'pn-verified+jwt' as const;
export const IDENTITY_PROVIDER = 'stripe_identity' as const;
const DEFAULT_VALIDITY_DAYS = 365;

export interface VerifiedPerson {
  givenName?: string | null;
  familyName?: string | null;
  birthdate?: string | null;
}

export interface VerifiedCredentialClaims {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  lvl: 'verified';
  provider: string;
  given_name?: string;
  family_name?: string;
  birthdate?: string;
}

export function verificationValidityDays(): number {
  const n = parseInt(process.env.VERIFICATION_VALIDITY_DAYS?.trim() || '', 10);
  return Number.isFinite(n) && n > 0 && n <= 3650 ? n : DEFAULT_VALIDITY_DAYS;
}

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

function clean(v: string | null | undefined): string | undefined {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s || undefined;
}

export class VerificationCredentialService {
  /** Sign a credential for `pn` and set its verified flag (same expiry). */
  static async issue(
    pn: string,
    person: VerifiedPerson,
    opts: { provider?: string; expiresAt?: Date; db?: Pick<Pool, 'query'> } = {}
  ): Promise<{ credential: string; expiresAt: string }> {
    const subject = pn.trim();
    if (!subject) fail('INVALID_SUBJECT');
    const now = Date.now();
    const expiresAt = opts.expiresAt ?? new Date(now + verificationValidityDays() * 86_400_000);
    const ttl = Math.floor((expiresAt.getTime() - now) / 1000);
    if (ttl <= 0) fail('CREDENTIAL_EXPIRED');
    const jti = crypto.randomUUID();
    const claims: Record<string, unknown> = {
      sub: subject,
      jti,
      lvl: 'verified',
      provider: opts.provider || IDENTITY_PROVIDER,
      exp: Math.floor(expiresAt.getTime() / 1000)
    };
    const given = clean(person.givenName);
    const family = clean(person.familyName);
    const birthdate = clean(person.birthdate);
    if (given) claims.given_name = given;
    if (family) claims.family_name = family;
    if (birthdate) claims.birthdate = birthdate;

    const credential = await PNOAuthService.signAttestation(CREDENTIAL_TYP, claims, ttl);
    await VerificationIntegrationService.syncVerificationStatus(
      subject,
      jti,
      new Date(now).toISOString(),
      expiresAt.toISOString(),
      opts.db
    );
    return { credential, expiresAt: expiresAt.toISOString() };
  }

  /** Valid, unexpired credential claims, or null. */
  static verify(credential: unknown): VerifiedCredentialClaims | null {
    if (typeof credential !== 'string' || !credential) return null;
    const c = PNOAuthService.verifyAttestation(credential, CREDENTIAL_TYP);
    if (!c || c.lvl !== 'verified' || typeof c.sub !== 'string' || !c.sub || typeof c.jti !== 'string') {
      return null;
    }
    return c as unknown as VerifiedCredentialClaims;
  }

  /** Credential issued to `pn` (throws INVALID_CREDENTIAL / CREDENTIAL_SUBJECT_MISMATCH). */
  static verifyFor(pn: string, credential: unknown): VerifiedCredentialClaims {
    const c = this.verify(credential);
    if (!c) fail('INVALID_CREDENTIAL');
    if (c.sub !== pn.trim()) fail('CREDENTIAL_SUBJECT_MISMATCH');
    return c;
  }

  /** Restore the verified flag from a held credential, unless an operator revoked that credential. */
  static async present(pn: string, credential: unknown): Promise<{ verified: true; expiresAt: string }> {
    const c = this.verifyFor(pn, credential);
    const db = getDatabasePool();
    const row = await db.query(
      `SELECT verification_id, is_active FROM verified_identities WHERE identity_id = $1`,
      [c.sub]
    );
    const existing = row.rows[0] as { verification_id: string; is_active: boolean } | undefined;
    if (existing && existing.is_active === false && existing.verification_id === c.jti) {
      fail('CREDENTIAL_REVOKED');
    }
    const expiresAt = new Date(c.exp * 1000).toISOString();
    await VerificationIntegrationService.syncVerificationStatus(
      c.sub,
      c.jti,
      new Date(c.iat * 1000).toISOString(),
      expiresAt,
      db
    );
    return { verified: true, expiresAt };
  }

  /** New credential for a successor pN, same person claims and expiry. */
  static async reissue(pn: string, credential: unknown): Promise<{ credential: string; expiresAt: string }> {
    const c = this.verify(credential);
    if (!c) fail('INVALID_CREDENTIAL');
    if (!isSuccessorOf(c.sub, pn)) fail('NOT_SUCCESSOR');
    return this.issue(
      pn,
      { givenName: c.given_name, familyName: c.family_name, birthdate: c.birthdate },
      { provider: c.provider, expiresAt: new Date(c.exp * 1000) }
    );
  }
}
