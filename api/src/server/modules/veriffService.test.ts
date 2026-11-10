/**
 * @jest-environment node
 *
 * Stateless Veriff flow: the session is bound to the pN only by an API-signed state token, cost is
 * booked once per session across webhook and decision fetch, approval issues a user-held credential
 * plus the verified flag, and the same document can verify more than one pN.
 */
import crypto from 'crypto';

const mockState = {
  billed: new Set<string>(),
  opex: [] as Array<{ amount: number; note: string }>,
  verified: new Map<string, string>()
};

const mockClientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
  if (s.startsWith('INSERT INTO veriff_billed_sessions')) {
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
import { VeriffService, isValidVeriffSignature, veriffSignature } from './veriffService';

const SECRET = 'veriff-shared-secret';
let nextSession = 0;
const decisions = new Map<string, unknown>();
const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
  if (url.endsWith('/sessions') && init?.method === 'POST') {
    const id = `sess-${++nextSession}`;
    return { ok: true, status: 201, json: async () => ({ verification: { id, url: `https://veriff.test/${id}` } }) };
  }
  const m = url.match(/\/sessions\/([^/]+)\/decision$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const headers = init?.headers as Record<string, string>;
    if (headers['X-HMAC-SIGNATURE'] !== veriffSignature(id, SECRET)) return { ok: false, status: 401, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ verification: decisions.get(id) ?? null }) };
  }
  throw new Error(`unexpected fetch ${url}`);
});

function signed(body: unknown): { raw: Buffer; sig: string } {
  const raw = Buffer.from(JSON.stringify(body));
  return { raw, sig: veriffSignature(raw, SECRET) };
}

function verification(id: string, status: string, docNumber = 'X1234567') {
  return {
    id,
    code: status === 'approved' ? 9001 : 9102,
    status,
    person: { firstName: 'Ada', lastName: 'Lovelace', dateOfBirth: '1990-01-01' },
    document: { number: docNumber, type: 'PASSPORT', country: 'GB' },
    decisionTime: '2026-11-01T00:00:00.000Z'
  };
}

beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  mockState.billed.clear();
  mockState.opex.length = 0;
  mockState.verified.clear();
  decisions.clear();
  process.env.VERIFF_API_KEY = 'veriff-key';
  process.env.VERIFF_SHARED_SECRET = SECRET;
  process.env.VERIFF_COST_CENTS = '180';
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('VeriffService', () => {
  it('validates webhook signatures (hex HMAC-SHA256 of the raw body)', () => {
    const raw = Buffer.from('{"a":1}');
    const sig = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    expect(isValidVeriffSignature(raw, sig, SECRET)).toBe(true);
    expect(isValidVeriffSignature(raw, sig.toUpperCase(), SECRET)).toBe(true);
    expect(isValidVeriffSignature(Buffer.from('{"a":2}'), sig, SECRET)).toBe(false);
    expect(isValidVeriffSignature(raw, 'not-hex', SECRET)).toBe(false);
    expect(isValidVeriffSignature(raw, undefined, SECRET)).toBe(false);
  });

  it('creates a session without storing a pN link and binds it with a signed state', async () => {
    const out = await VeriffService.createSession('pn-a', 'https://app.test/return');
    expect(out.url).toBe(`https://veriff.test/${out.sessionId}`);
    expect(PNOAuthService.verifyAttestation(out.state, 'veriff-state+jwt')).toMatchObject({
      sid: out.sessionId,
      pn: 'pn-a'
    });
    expect(mockPool.query.mock.calls.some(([sql]) => /INSERT|UPDATE/.test(String(sql)))).toBe(false);
  });

  it('refuses a state for another pN, a forged state, or a credential used as state', async () => {
    const { state } = await VeriffService.createSession('pn-a', 'https://app.test/return');
    await expect(VeriffService.decisionFromState('pn-b', state)).rejects.toThrow('invalid_state');
    await expect(VeriffService.decisionFromState('pn-a', state.slice(0, -4) + 'AAAA')).rejects.toThrow('invalid_state');
    const { credential } = await VerificationCredentialService.issue('pn-a', { givenName: 'Ada' });
    await expect(VeriffService.decisionFromState('pn-a', credential)).rejects.toThrow('invalid_state');
    await expect(VeriffService.decisionFromState('pn-a', undefined)).rejects.toThrow('invalid_state');
  });

  it('reports pending until Veriff decides', async () => {
    const { state, sessionId } = await VeriffService.createSession('pn-a', 'https://app.test/return');
    await expect(VeriffService.decisionFromState('pn-a', state)).resolves.toEqual({ status: 'pending', sessionId });
    expect(mockState.opex).toHaveLength(0);
  });

  it('rejects a webhook with a bad signature before touching the DB', async () => {
    const { raw } = signed({ verification: verification('s1', 'approved') });
    await expect(VeriffService.handleWebhook(raw, 'f'.repeat(64))).rejects.toThrow('invalid_signature');
    expect(mockState.opex).toHaveLength(0);
  });

  it('books the cost once across webhook replays and the decision fetch', async () => {
    const { state, sessionId } = await VeriffService.createSession('pn-a', 'https://app.test/return');
    decisions.set(sessionId, verification(sessionId, 'approved'));
    const { raw, sig } = signed({ verification: verification(sessionId, 'approved') });
    await VeriffService.handleWebhook(raw, sig);
    await VeriffService.handleWebhook(raw, sig);
    await VeriffService.decisionFromState('pn-a', state);
    expect(mockState.opex).toEqual([{ amount: 180, note: `veriff session ${sessionId}` }]);
  });

  it('webhook alone never verifies; approval on decision issues the credential and the flag', async () => {
    const { state, sessionId } = await VeriffService.createSession('pn-a', 'https://app.test/return');
    decisions.set(sessionId, verification(sessionId, 'approved'));
    const { raw, sig } = signed({ verification: verification(sessionId, 'approved') });
    await VeriffService.handleWebhook(raw, sig);
    expect(mockState.verified.size).toBe(0);

    const out = await VeriffService.decisionFromState('pn-a', state);
    expect(out.status).toBe('approved');
    const claims = VerificationCredentialService.verify(out.credential)!;
    expect(claims).toMatchObject({ sub: 'pn-a', given_name: 'Ada', family_name: 'Lovelace', birthdate: '1990-01-01' });
    expect(mockState.verified.get('pn-a')).toBe(claims.jti);
    expect(out.person).toEqual({ firstName: 'Ada', lastName: 'Lovelace', dateOfBirth: '1990-01-01' });
  });

  it('declined is billed but issues nothing', async () => {
    const { state, sessionId } = await VeriffService.createSession('pn-b', 'https://app.test/return');
    decisions.set(sessionId, verification(sessionId, 'declined'));
    await expect(VeriffService.decisionFromState('pn-b', state)).resolves.toEqual({ status: 'declined', sessionId });
    expect(mockState.verified.size).toBe(0);
    expect(mockState.opex).toHaveLength(1);
  });

  it('the same document verifies two pNs, each billed for its own session', async () => {
    const a = await VeriffService.createSession('pn-first', 'https://app.test/return');
    const b = await VeriffService.createSession('pn-second', 'https://app.test/return');
    decisions.set(a.sessionId, verification(a.sessionId, 'approved', 'DOC-42'));
    decisions.set(b.sessionId, verification(b.sessionId, 'approved', 'DOC-42'));
    expect((await VeriffService.decisionFromState('pn-first', a.state)).status).toBe('approved');
    expect((await VeriffService.decisionFromState('pn-second', b.state)).status).toBe('approved');
    expect([...mockState.verified.keys()].sort()).toEqual(['pn-first', 'pn-second']);
    expect(mockState.opex).toHaveLength(2);
  });

  it('records no opex when VERIFF_COST_CENTS is unset', async () => {
    delete process.env.VERIFF_COST_CENTS;
    const { state, sessionId } = await VeriffService.createSession('pn-d', 'https://app.test/return');
    decisions.set(sessionId, verification(sessionId, 'approved'));
    await VeriffService.decisionFromState('pn-d', state);
    expect(mockState.verified.has('pn-d')).toBe(true);
    expect(mockState.opex).toHaveLength(0);
  });
});
