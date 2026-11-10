/**
 * @jest-environment node
 *
 * Stateless Stripe Identity flow: the session is bound to the pN only by an API-signed state token,
 * cost is booked once per session across webhook and decision fetch, a verified session issues a
 * user-held credential plus the verified flag and is then redacted, and the same document can
 * verify more than one pN.
 */

const mockState = {
  billed: new Set<string>(),
  opex: [] as Array<{ amount: number; note: string }>,
  verified: new Map<string, string>()
};

const mockClientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
  if (s.startsWith('INSERT INTO identity_billed_sessions')) {
    const id = String(params[0]);
    if (mockState.billed.has(id)) return { rows: [] };
    mockState.billed.add(id);
    return { rows: [{ session_id: id }] };
  }
  if (s.startsWith('INSERT INTO creator_fund_opex_events')) {
    mockState.opex.push({ amount: Number(params[0]), note: String(params[1]) });
    return { rows: [] };
  }
  throw new Error(`unexpected client SQL: ${s.slice(0, 80)}`);
});

const mockPool = {
  query: jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('INSERT INTO verified_identities')) {
      mockState.verified.set(String(params[0]), String(params[1]));
    }
    return { rows: [] };
  }),
  connect: jest.fn(async () => ({ query: mockClientQuery, release: jest.fn() }))
};

let mockNextSession = 0;
const mockSessions = new Map<string, Record<string, unknown>>();
const mockCreate = jest.fn(async (params: Record<string, unknown>) => {
  const id = `vs_${++mockNextSession}`;
  const session = { id, status: 'requires_input', last_error: null, redaction: null, url: `https://verify.stripe.test/${id}` };
  mockSessions.set(id, session);
  return { ...session, params };
});
const mockRetrieve = jest.fn(async (id: string) => {
  const s = mockSessions.get(id);
  if (!s) throw new Error('No such verification session');
  return s;
});
const mockRedact = jest.fn(async (id: string) => {
  const s = mockSessions.get(id)!;
  s.redaction = { status: 'processing' };
  return s;
});

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    identity: {
      verificationSessions: { create: mockCreate, retrieve: mockRetrieve, redact: mockRedact }
    }
  }))
);
jest.mock('../utils/database', () => ({ getDatabasePool: () => mockPool }));
jest.mock('../utils/cache', () => ({ getCacheClient: () => null }));
jest.mock('./identitySuccessionService', () => ({
  isPnRevokedForNetwork: () => false,
  isDidRevokedForNetwork: () => false,
  isSuccessorOf: () => false
}));
jest.mock('./engagementService', () => ({
  EngagementService: { isMonetizationMaintenanceActive: jest.fn(async () => true) }
}));

import { PNOAuthService } from './pnOAuthService';
import { VerificationCredentialService } from './verificationCredentialService';
import { StripeIdentityService, isBilledSession } from './stripeIdentityService';

function settle(id: string, status: string, extra: Record<string, unknown> = {}, docNumber = 'X1234567') {
  const s = mockSessions.get(id)!;
  Object.assign(s, {
    status,
    url: status === 'requires_input' ? `https://verify.stripe.test/${id}?retry` : null,
    verified_outputs:
      status === 'verified'
        ? { first_name: 'Ada', last_name: 'Lovelace', dob: { day: 1, month: 1, year: 1990 }, address: null }
        : null,
    last_verification_report:
      status === 'verified'
        ? {
            document: {
              type: 'passport',
              issuing_country: 'GB',
              number: docNumber,
              expiration_date: { day: 31, month: 12, year: 2030 },
              address: { state: 'London' },
              first_name: 'Ada',
              last_name: 'Lovelace',
              dob: { day: 1, month: 1, year: 1990 }
            }
          }
        : null,
    ...extra
  });
}

beforeEach(() => {
  mockState.billed.clear();
  mockState.opex.length = 0;
  mockState.verified.clear();
  mockSessions.clear();
  mockRedact.mockClear();
  process.env.STRIPE_IDENTITY_RESTRICTED_KEY = 'rk_test_identity';
  process.env.STRIPE_IDENTITY_COST_CENTS = '150';
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('StripeIdentityService', () => {
  it('bills verified sessions and failed checks, not abandoned or unsubmitted ones', () => {
    expect(isBilledSession({ status: 'verified', last_error: null })).toBe(true);
    expect(isBilledSession({ status: 'requires_input', last_error: { code: 'document_unverified_other', reason: null } })).toBe(true);
    expect(isBilledSession({ status: 'requires_input', last_error: { code: 'abandoned', reason: null } })).toBe(false);
    expect(isBilledSession({ status: 'requires_input', last_error: null })).toBe(false);
    expect(isBilledSession({ status: 'processing', last_error: null })).toBe(false);
  });

  it('creates a document + selfie session with no pN metadata and binds it with a signed state', async () => {
    const out = await StripeIdentityService.createSession('pn-a', 'https://app.test/return');
    expect(out.url).toBe(`https://verify.stripe.test/${out.sessionId}`);
    const params = mockCreate.mock.calls.at(-1)![0];
    expect(params).toEqual({
      type: 'document',
      options: { document: { require_matching_selfie: true, require_live_capture: true } },
      return_url: 'https://app.test/return'
    });
    expect(JSON.stringify(params)).not.toContain('pn-a');
    expect(PNOAuthService.verifyAttestation(out.state, 'identity-state+jwt')).toMatchObject({
      sid: out.sessionId,
      pn: 'pn-a'
    });
    expect(mockPool.query.mock.calls.some(([sql]) => /INSERT|UPDATE/.test(String(sql)))).toBe(false);
  });

  it('refuses a state for another pN, a forged state, or a credential used as state', async () => {
    const { state } = await StripeIdentityService.createSession('pn-a', 'https://app.test/return');
    await expect(StripeIdentityService.decisionFromState('pn-b', state)).rejects.toThrow('invalid_state');
    await expect(StripeIdentityService.decisionFromState('pn-a', state.slice(0, -4) + 'AAAA')).rejects.toThrow('invalid_state');
    const { credential } = await VerificationCredentialService.issue('pn-a', { givenName: 'Ada' });
    await expect(StripeIdentityService.decisionFromState('pn-a', credential)).rejects.toThrow('invalid_state');
    await expect(StripeIdentityService.decisionFromState('pn-a', undefined)).rejects.toThrow('invalid_state');
  });

  it('reports pending with the hosted URL until the user submits, then review while processing', async () => {
    const { state, sessionId } = await StripeIdentityService.createSession('pn-a', 'https://app.test/return');
    await expect(StripeIdentityService.decisionFromState('pn-a', state)).resolves.toEqual({
      status: 'pending',
      sessionId,
      url: `https://verify.stripe.test/${sessionId}`
    });
    settle(sessionId, 'processing');
    await expect(StripeIdentityService.decisionFromState('pn-a', state)).resolves.toEqual({ status: 'review', sessionId });
    expect(mockState.opex).toHaveLength(0);
  });

  it('a failed check is billed and offers a retry URL; abandonment is not billed', async () => {
    const a = await StripeIdentityService.createSession('pn-a', 'https://app.test/return');
    settle(a.sessionId, 'requires_input', { last_error: { code: 'document_unverified_other', reason: 'x' } });
    await expect(StripeIdentityService.decisionFromState('pn-a', a.state)).resolves.toEqual({
      status: 'resubmission_requested',
      sessionId: a.sessionId,
      url: `https://verify.stripe.test/${a.sessionId}?retry`
    });
    const b = await StripeIdentityService.createSession('pn-b', 'https://app.test/return');
    settle(b.sessionId, 'requires_input', { last_error: { code: 'abandoned', reason: null } });
    await expect(StripeIdentityService.decisionFromState('pn-b', b.state)).resolves.toEqual({
      status: 'expired',
      sessionId: b.sessionId
    });
    expect(mockState.opex).toEqual([{ amount: 150, note: `stripe identity session ${a.sessionId}` }]);
    expect(mockState.verified.size).toBe(0);
  });

  it('books the cost once across webhook replays and the decision fetch', async () => {
    const { state, sessionId } = await StripeIdentityService.createSession('pn-a', 'https://app.test/return');
    settle(sessionId, 'verified');
    const session = mockSessions.get(sessionId) as never;
    await StripeIdentityService.handleWebhookSession(session);
    await StripeIdentityService.handleWebhookSession(session);
    await StripeIdentityService.decisionFromState('pn-a', state);
    expect(mockState.opex).toEqual([{ amount: 150, note: `stripe identity session ${sessionId}` }]);
  });

  it('webhook alone never verifies; a verified decision issues the credential and flag, then redacts', async () => {
    const { state, sessionId } = await StripeIdentityService.createSession('pn-a', 'https://app.test/return');
    settle(sessionId, 'verified');
    await StripeIdentityService.handleWebhookSession(mockSessions.get(sessionId) as never);
    expect(mockState.verified.size).toBe(0);

    const out = await StripeIdentityService.decisionFromState('pn-a', state);
    expect(out.status).toBe('approved');
    const claims = VerificationCredentialService.verify(out.credential)!;
    expect(claims).toMatchObject({
      sub: 'pn-a',
      provider: 'stripe_identity',
      given_name: 'Ada',
      family_name: 'Lovelace',
      birthdate: '1990-01-01'
    });
    expect(mockState.verified.get('pn-a')).toBe(claims.jti);
    expect(out.person).toEqual({ firstName: 'Ada', lastName: 'Lovelace', dateOfBirth: '1990-01-01' });
    expect(out.document).toEqual({
      number: 'X1234567',
      type: 'passport',
      country: 'GB',
      state: 'London',
      validUntil: '2030-12-31'
    });
    expect(mockRedact).toHaveBeenCalledWith(sessionId);

    await expect(StripeIdentityService.decisionFromState('pn-a', state)).resolves.toEqual({
      status: 'expired',
      sessionId
    });
  });

  it('a canceled session issues nothing', async () => {
    const { state, sessionId } = await StripeIdentityService.createSession('pn-b', 'https://app.test/return');
    settle(sessionId, 'canceled');
    await expect(StripeIdentityService.decisionFromState('pn-b', state)).resolves.toEqual({ status: 'expired', sessionId });
    expect(mockState.verified.size).toBe(0);
    expect(mockRedact).not.toHaveBeenCalled();
  });

  it('the same document verifies two pNs, each billed for its own session', async () => {
    const a = await StripeIdentityService.createSession('pn-first', 'https://app.test/return');
    const b = await StripeIdentityService.createSession('pn-second', 'https://app.test/return');
    settle(a.sessionId, 'verified', {}, 'DOC-42');
    settle(b.sessionId, 'verified', {}, 'DOC-42');
    expect((await StripeIdentityService.decisionFromState('pn-first', a.state)).status).toBe('approved');
    expect((await StripeIdentityService.decisionFromState('pn-second', b.state)).status).toBe('approved');
    expect([...mockState.verified.keys()].sort()).toEqual(['pn-first', 'pn-second']);
    expect(mockState.opex).toHaveLength(2);
  });

  it('records no opex when STRIPE_IDENTITY_COST_CENTS is unset', async () => {
    delete process.env.STRIPE_IDENTITY_COST_CENTS;
    const { state, sessionId } = await StripeIdentityService.createSession('pn-d', 'https://app.test/return');
    settle(sessionId, 'verified');
    await StripeIdentityService.decisionFromState('pn-d', state);
    expect(mockState.verified.has('pn-d')).toBe(true);
    expect(mockState.opex).toHaveLength(0);
  });

  it('refuses to start without the restricted key', async () => {
    delete process.env.STRIPE_IDENTITY_RESTRICTED_KEY;
    await expect(StripeIdentityService.createSession('pn-e', 'https://app.test/return')).rejects.toThrow(
      'identity_not_configured'
    );
  });
});
