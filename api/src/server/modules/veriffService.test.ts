/**
 * @jest-environment node
 */
import crypto from 'crypto';

type Session = { pn_identifier: string; status: string; cost_recorded_at: Date | null; decision_code: number | null };

const mockState = {
  sessions: new Map<string, Session>(),
  verifiedByDoc: new Map<string, string>(),
  opex: [] as Array<{ amount: number; note: string }>
};

const mockClientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
  if (s.includes('FROM veriff_sessions WHERE session_id = $1 FOR UPDATE')) {
    const row = mockState.sessions.get(String(params[0]));
    return { rows: row ? [{ ...row }] : [] };
  }
  if (s.includes('pg_advisory_xact_lock')) return { rows: [] };
  if (s.includes('FROM verified_identities WHERE document_hmac')) {
    const owner = mockState.verifiedByDoc.get(String(params[0]));
    return { rows: owner && owner !== params[1] ? [{ '?column?': 1 }] : [] };
  }
  if (s.startsWith('UPDATE veriff_sessions SET status = $2, decision_code')) {
    const row = mockState.sessions.get(String(params[0]))!;
    row.status = String(params[1]);
    row.decision_code = (params[2] as number | null) ?? null;
    return { rows: [] };
  }
  if (s.startsWith('UPDATE veriff_sessions SET cost_recorded_at')) {
    mockState.sessions.get(String(params[0]))!.cost_recorded_at = new Date();
    return { rows: [] };
  }
  if (s.startsWith('INSERT INTO creator_fund_opex_events')) {
    mockState.opex.push({ amount: Number(params[0]), note: String(params[1]) });
    return { rows: [] };
  }
  throw new Error(`unexpected client SQL: ${s.slice(0, 80)}`);
});

const mockPool = {
  query: jest.fn(async () => ({ rows: [] })),
  connect: jest.fn(async () => ({ query: mockClientQuery, release: jest.fn() }))
};

jest.mock('../utils/database', () => ({ getDatabasePool: () => mockPool }));

const mockSync = jest.fn(
  async (pn: string, _id: string, _at: string, _name?: string, opts?: { documentHmac?: string | null }) => {
    if (opts?.documentHmac) mockState.verifiedByDoc.set(opts.documentHmac, pn);
  }
);
jest.mock('./verificationIntegrationService', () => ({
  VerificationIntegrationService: {
    syncVerificationStatus: (...a: Parameters<typeof mockSync>) => mockSync(...a),
    isVerified: jest.fn(async () => false)
  }
}));
jest.mock('./engagementService', () => ({
  EngagementService: { isMonetizationMaintenanceActive: jest.fn(async () => true) }
}));

import { VeriffService, documentHmac, isValidVeriffSignature, veriffSignature } from './veriffService';

const SECRET = 'veriff-shared-secret';

function signed(body: unknown): { raw: Buffer; sig: string } {
  const raw = Buffer.from(JSON.stringify(body));
  return { raw, sig: veriffSignature(raw, SECRET) };
}

function decision(id: string, status: string, docNumber = 'X1234567') {
  return {
    status: 'success',
    verification: {
      id,
      code: status === 'approved' ? 9001 : 9102,
      status,
      person: { firstName: 'Ada', lastName: 'Lovelace', dateOfBirth: '1990-01-01' },
      document: { number: docNumber, type: 'PASSPORT', country: 'GB' },
      decisionTime: '2026-11-01T00:00:00.000Z'
    }
  };
}

describe('VeriffService', () => {
  beforeEach(() => {
    mockState.sessions.clear();
    mockState.verifiedByDoc.clear();
    mockState.opex.length = 0;
    process.env.VERIFF_API_KEY = 'veriff-key';
    process.env.VERIFF_SHARED_SECRET = SECRET;
    process.env.VERIFF_COST_CENTS = '180';
    process.env.VERIFICATION_DEDUPE_SECRET = 'dedupe-secret';
  });

  it('validates webhook signatures (hex HMAC-SHA256 of the raw body)', () => {
    const raw = Buffer.from('{"a":1}');
    const sig = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    expect(isValidVeriffSignature(raw, sig, SECRET)).toBe(true);
    expect(isValidVeriffSignature(raw, sig.toUpperCase(), SECRET)).toBe(true);
    expect(isValidVeriffSignature(Buffer.from('{"a":2}'), sig, SECRET)).toBe(false);
    expect(isValidVeriffSignature(raw, 'not-hex', SECRET)).toBe(false);
    expect(isValidVeriffSignature(raw, undefined, SECRET)).toBe(false);
  });

  it('rejects a webhook with a bad signature before touching the DB', async () => {
    mockState.sessions.set('s1', { pn_identifier: 'pn-a', status: 'submitted', cost_recorded_at: null, decision_code: null });
    const { raw } = signed(decision('s1', 'approved'));
    await expect(VeriffService.handleWebhook(raw, 'f'.repeat(64))).rejects.toThrow('invalid_signature');
    expect(mockSync).not.toHaveBeenCalled();
    expect(mockState.opex).toHaveLength(0);
  });

  it('approves, records the Veriff cost once, and is idempotent on replay', async () => {
    mockState.sessions.set('s1', { pn_identifier: 'pn-a', status: 'submitted', cost_recorded_at: null, decision_code: null });
    const { raw, sig } = signed(decision('s1', 'approved'));
    await VeriffService.handleWebhook(raw, sig);
    await VeriffService.handleWebhook(raw, sig);

    expect(mockState.sessions.get('s1')!.status).toBe('approved');
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync.mock.calls[0][0]).toBe('pn-a');
    expect(mockSync.mock.calls[0][1]).toBe('veriff:s1');
    expect(mockSync.mock.calls[0][3]).toBe('Ada Lovelace');
    expect(mockSync.mock.calls[0][4]?.documentHmac).toBe(documentHmac({ number: 'X1234567', country: 'GB' }));
    expect(mockState.opex).toEqual([{ amount: 180, note: 'veriff session s1' }]);
  });

  it('declined is billed but does not verify', async () => {
    mockState.sessions.set('s2', { pn_identifier: 'pn-b', status: 'submitted', cost_recorded_at: null, decision_code: null });
    const out = await VeriffService.applyDecision(decision('s2', 'declined').verification);
    expect(out).toEqual({ status: 'declined', pnIdentifier: 'pn-b' });
    expect(mockSync).not.toHaveBeenCalled();
    expect(mockState.opex).toHaveLength(1);
  });

  it('resubmission then approval on the same session bills once', async () => {
    mockState.sessions.set('s3', { pn_identifier: 'pn-c', status: 'submitted', cost_recorded_at: null, decision_code: null });
    await VeriffService.applyDecision(decision('s3', 'resubmission_requested').verification);
    await VeriffService.applyDecision(decision('s3', 'approved').verification);
    expect(mockState.sessions.get('s3')!.status).toBe('approved');
    expect(mockState.opex).toHaveLength(1);
  });

  it('rejects a document that already backs another verified pN', async () => {
    mockState.sessions.set('s4', { pn_identifier: 'pn-first', status: 'submitted', cost_recorded_at: null, decision_code: null });
    mockState.sessions.set('s5', { pn_identifier: 'pn-second', status: 'submitted', cost_recorded_at: null, decision_code: null });
    await VeriffService.applyDecision(decision('s4', 'approved', 'DOC-42').verification);
    const out = await VeriffService.applyDecision(decision('s5', 'approved', 'doc 42').verification);

    expect(out.status).toBe('duplicate');
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockState.sessions.get('s5')!.status).toBe('duplicate');
    expect(mockState.opex).toHaveLength(2);
  });

  it('records no opex when VERIFF_COST_CENTS is unset', async () => {
    delete process.env.VERIFF_COST_CENTS;
    mockState.sessions.set('s6', { pn_identifier: 'pn-d', status: 'submitted', cost_recorded_at: null, decision_code: null });
    await VeriffService.applyDecision(decision('s6', 'approved').verification);
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockState.opex).toHaveLength(0);
  });

  it('documentHmac normalizes number formatting and needs the dedupe secret', () => {
    expect(documentHmac({ number: 'ab-12 34', country: 'gb' })).toBe(documentHmac({ number: 'AB1234', country: 'GB' }));
    delete process.env.VERIFICATION_DEDUPE_SECRET;
    expect(documentHmac({ number: 'AB1234', country: 'GB' })).toBeNull();
  });
});
