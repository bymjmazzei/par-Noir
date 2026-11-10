/**
 * @jest-environment node
 *
 * User-held verification credential: issue sets the flag, present restores it (unless that exact
 * credential was revoked), reissue only serves a successor, and a wrong typ, wrong sub or expired
 * token never passes.
 */
import jwt from 'jsonwebtoken';

type Row = { identity_id: string; verification_id: string; is_active: boolean; expires_at: string | null };
const rows = new Map<string, Row>();

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('SELECT verification_id, is_active FROM verified_identities')) {
        const r = rows.get(String(params[0]));
        return { rows: r ? [r] : [] };
      }
      if (sql.includes('INSERT INTO verified_identities')) {
        rows.set(String(params[0]), {
          identity_id: String(params[0]),
          verification_id: String(params[1]),
          is_active: true,
          expires_at: (params[3] as string | null) ?? null
        });
      }
      return { rows: [] };
    })
  })
}));
jest.mock('../utils/cache', () => ({ getCacheClient: () => null }));
const successors = new Map<string, string>();
jest.mock('./identitySuccessionService', () => ({
  isPnRevokedForNetwork: () => false,
  isDidRevokedForNetwork: () => false,
  isSuccessorOf: (pred: string, cand: string) => successors.get(pred) === cand
}));

import { PNOAuthService } from './pnOAuthService';
import { CREDENTIAL_TYP, VerificationCredentialService } from './verificationCredentialService';

const person = { givenName: 'Ada', familyName: 'Lovelace', birthdate: '1990-01-01' };

beforeEach(() => {
  rows.clear();
  successors.clear();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('VerificationCredentialService', () => {
  it('issues a typ-scoped credential and sets the flag with the same jti', async () => {
    const { credential, expiresAt } = await VerificationCredentialService.issue('pn-a', person);
    const header = jwt.decode(credential, { complete: true })!.header;
    expect(header.typ).toBe(CREDENTIAL_TYP);
    const claims = VerificationCredentialService.verify(credential)!;
    expect(claims).toMatchObject({ sub: 'pn-a', lvl: 'verified', given_name: 'Ada', family_name: 'Lovelace' });
    expect(rows.get('pn-a')!.verification_id).toBe(claims.jti);
    expect(rows.get('pn-a')!.expires_at).toBe(expiresAt);
    expect(Math.floor(new Date(expiresAt).getTime() / 1000)).toBe(claims.exp);
  });

  it('present restores a missing flag', async () => {
    const { credential } = await VerificationCredentialService.issue('pn-a', person);
    rows.clear();
    await expect(VerificationCredentialService.present('pn-a', credential)).resolves.toMatchObject({ verified: true });
    expect(rows.get('pn-a')!.is_active).toBe(true);
  });

  it('present refuses a credential an operator deactivated', async () => {
    const { credential } = await VerificationCredentialService.issue('pn-a', person);
    rows.get('pn-a')!.is_active = false;
    await expect(VerificationCredentialService.present('pn-a', credential)).rejects.toMatchObject({
      code: 'CREDENTIAL_REVOKED'
    });
  });

  it('present refuses another pN’s credential', async () => {
    const { credential } = await VerificationCredentialService.issue('pn-a', person);
    await expect(VerificationCredentialService.present('pn-b', credential)).rejects.toMatchObject({
      code: 'CREDENTIAL_SUBJECT_MISMATCH'
    });
  });

  it('rejects other attestation typs, access-token audiences and expired credentials', async () => {
    const state = await PNOAuthService.signAttestation('veriff-state+jwt', { sub: 'pn-a', jti: 'x', lvl: 'verified' }, 60);
    expect(VerificationCredentialService.verify(state)).toBeNull();
    const expired = await PNOAuthService.signAttestation(
      CREDENTIAL_TYP,
      { sub: 'pn-a', jti: 'x', lvl: 'verified', iat: 1, exp: 2 },
      60
    );
    expect(VerificationCredentialService.verify(expired)).toBeNull();
    expect(VerificationCredentialService.verify('not.a.jwt')).toBeNull();
    await expect(
      VerificationCredentialService.issue('pn-a', person, { expiresAt: new Date(Date.now() - 1000) })
    ).rejects.toMatchObject({ code: 'CREDENTIAL_EXPIRED' });
  });

  it('reissue serves only a successor, keeping the person claims and expiry', async () => {
    const { credential } = await VerificationCredentialService.issue('pn-old', person);
    await expect(VerificationCredentialService.reissue('pn-new', credential)).rejects.toMatchObject({
      code: 'NOT_SUCCESSOR'
    });
    successors.set('pn-old', 'pn-new');
    const out = await VerificationCredentialService.reissue('pn-new', credential);
    const before = VerificationCredentialService.verify(credential)!;
    const after = VerificationCredentialService.verify(out.credential)!;
    expect(after).toMatchObject({ sub: 'pn-new', given_name: 'Ada', family_name: 'Lovelace', exp: before.exp });
    expect(after.jti).not.toBe(before.jti);
    expect(rows.get('pn-new')!.verification_id).toBe(after.jti);
  });
});
