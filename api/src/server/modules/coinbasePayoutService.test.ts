/**
 * @jest-environment node
 *
 * Coinbase USDC payout rail: wallets are validated and screened, sends are signed per request and
 * idempotent per payout row, a network error leaves the row for a retry under the same `idem`, and
 * definitive refusals or sanctioned destinations fail the row without paying. Crypto payouts need a
 * verified pN and snapshot the saved wallet.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';

type Row = {
  id: string;
  pn_identifier: string;
  amount_cents: number;
  status: string;
  payout_rail: string;
  crypto_network: string | null;
  crypto_destination_address: string | null;
  crypto_transaction_id?: string;
};

const mockState = {
  destinations: new Map<string, { network: string; address: string }>(),
  rows: [] as Row[],
  verified: true,
  available: 5000,
  inserted: [] as unknown[][]
};

const mockQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.startsWith('SELECT network, address FROM creator_fund_crypto_destinations')) {
    const d = mockState.destinations.get(String(params[0]));
    return { rows: d ? [d] : [] };
  }
  if (s.startsWith('INSERT INTO creator_fund_crypto_destinations')) {
    mockState.destinations.set(String(params[0]), { network: String(params[1]), address: String(params[2]) });
    return { rows: [] };
  }
  if (s.startsWith("UPDATE creator_fund_payout_requests SET status = 'processing'")) {
    const r = mockState.rows.find((x) => x.id === params[0]);
    if (!r || !['queued', 'processing'].includes(r.status)) return { rows: [] };
    r.status = 'processing';
    return { rows: [{ id: r.id }] };
  }
  if (s.startsWith("UPDATE creator_fund_payout_requests SET status = 'failed'")) {
    const r = mockState.rows.find((x) => x.id === params[0]);
    if (r && ['queued', 'processing'].includes(r.status)) r.status = 'failed';
    return { rows: [] };
  }
  if (s.startsWith("UPDATE creator_fund_payout_requests SET status = 'paid'")) {
    const r = mockState.rows.find((x) => x.id === params[0]);
    if (r?.status === 'processing') {
      r.status = 'paid';
      r.crypto_transaction_id = String(params[1]);
    }
    return { rows: [] };
  }
  if (s.startsWith('SELECT id, pn_identifier, amount_cents, status, payout_rail')) {
    return { rows: mockState.rows.filter((r) => ['queued', 'processing'].includes(r.status)).map((r) => ({ ...r })) };
  }
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s) || s.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [] };
  if (s.includes('FROM creator_fund_period_creator_allocations') && s.includes('<= NOW()')) {
    return { rows: [{ s: mockState.available }] };
  }
  if (s.includes('COALESCE(SUM')) return { rows: [{ s: 0 }] };
  if (s.startsWith('INSERT INTO creator_fund_payout_requests')) {
    mockState.inserted.push(params);
    return { rows: [{ id: '00000000-0000-4000-8000-000000000099' }] };
  }
  throw new Error(`unexpected SQL: ${s.slice(0, 90)}`);
});

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({ query: mockQuery, connect: async () => ({ query: mockQuery, release: () => undefined }) })
}));
jest.mock('./engagementService', () => ({
  EngagementService: { isIdentityVerifiedForMonetization: jest.fn(async () => mockState.verified) }
}));
jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => ({})) }));

import { CoinbasePayoutService, normalizeEvmAddress } from './coinbasePayoutService';
import { MonetizationService } from './monetizationService';

const WALLET = '0xAbCdEf0123456789aBcDeF0123456789ABCDEF01';
const BLOCKED = '0x1111111111111111111111111111111111111111';
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const KEY_NAME = 'organizations/org-1/apiKeys/key-1';
const listDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-sanctions-'));
const listPath = path.join(listDir, 'sanctioned.txt');
fs.writeFileSync(listPath, `# OFAC SDN digital currency addresses\n${BLOCKED.toUpperCase().replace('0X', '0x')}\n`);

const fetchMock = jest.fn();

function row(id: string, address: string | null = WALLET.toLowerCase(), amount = 2500): Row {
  return {
    id,
    pn_identifier: 'pn-a',
    amount_cents: amount,
    status: 'queued',
    payout_rail: 'coinbase',
    crypto_network: 'base',
    crypto_destination_address: address
  };
}

function coinbaseOk(id: string, status = 'pending') {
  return { ok: true, status: 201, json: async () => ({ data: { id, status } }) };
}

beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  fs.rmSync(listDir, { recursive: true, force: true });
});

beforeEach(() => {
  mockState.destinations.clear();
  mockState.rows = [];
  mockState.verified = true;
  mockState.inserted = [];
  fetchMock.mockReset();
  delete process.env.STRIPE_SECRET_KEY;
  process.env.COINBASE_PAYOUT_API_KEY_NAME = KEY_NAME;
  process.env.COINBASE_PAYOUT_API_KEY_SECRET = (privateKey.export({ type: 'sec1', format: 'pem' }) as string).replace(
    /\n/g,
    '\\n'
  );
  process.env.COINBASE_PAYOUT_ACCOUNT_ID = 'usdc-account';
  process.env.CRYPTO_PAYOUT_SANCTIONS_LIST_PATH = listPath;
});

describe('crypto destinations', () => {
  it('accepts only EVM addresses and stores them lowercased', async () => {
    expect(normalizeEvmAddress(` ${WALLET} `)).toBe(WALLET.toLowerCase());
    expect(normalizeEvmAddress('0x123')).toBeNull();
    expect(normalizeEvmAddress('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBeNull();
    await expect(CoinbasePayoutService.setDestination('pn-a', 'nope')).rejects.toThrow('crypto_address_invalid');
    await expect(CoinbasePayoutService.setDestination('pn-a', WALLET)).resolves.toEqual({
      network: 'base',
      address: WALLET.toLowerCase()
    });
  });

  it('refuses a sanctioned address, and fails closed when the list cannot be read', async () => {
    await expect(CoinbasePayoutService.setDestination('pn-a', BLOCKED)).rejects.toThrow('crypto_destination_blocked');
    process.env.CRYPTO_PAYOUT_SANCTIONS_LIST_PATH = path.join(listDir, 'missing.txt');
    await expect(CoinbasePayoutService.setDestination('pn-a', WALLET)).rejects.toThrow('sanctions_list_unavailable');
    expect(mockState.destinations.size).toBe(0);
  });

  it('is off without the full Coinbase config', async () => {
    delete process.env.COINBASE_PAYOUT_ACCOUNT_ID;
    await expect(CoinbasePayoutService.setDestination('pn-a', WALLET)).rejects.toThrow('crypto_payouts_not_configured');
  });
});

describe('sendUsdc', () => {
  it('signs an ES256 CDP JWT bound to the request and sends USDC on Base with idem', async () => {
    fetchMock.mockResolvedValue(coinbaseOk('tx-1'));
    const out = await CoinbasePayoutService.sendUsdc({
      idem: 'row-1',
      address: WALLET.toLowerCase(),
      amountCents: 2550,
      description: 'payout'
    });
    expect(out).toEqual({ transactionId: 'tx-1', status: 'pending' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.coinbase.com/v2/accounts/usdc-account/transactions');
    expect(JSON.parse(init.body)).toEqual({
      type: 'send',
      to: WALLET.toLowerCase(),
      amount: '25.50',
      currency: 'USDC',
      network: 'base',
      idem: 'row-1',
      description: 'payout'
    });
    const token = String(init.headers.Authorization).replace(/^Bearer /, '');
    const decoded = jwt.verify(token, publicKey.export({ type: 'spki', format: 'pem' }) as string, {
      algorithms: ['ES256'],
      complete: true
    }) as unknown as { header: Record<string, string>; payload: Record<string, unknown> };
    expect(decoded.header).toMatchObject({ alg: 'ES256', kid: KEY_NAME });
    expect(decoded.header.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(decoded.payload).toMatchObject({
      sub: KEY_NAME,
      iss: 'cdp',
      uri: 'POST api.coinbase.com/v2/accounts/usdc-account/transactions'
    });
  });
});

describe('payQueuedRow', () => {
  it('pays a queued row once and records the Coinbase transaction', async () => {
    mockState.rows = [row('r1')];
    fetchMock.mockResolvedValue(coinbaseOk('tx-r1'));
    await expect(CoinbasePayoutService.payQueuedRow(mockState.rows[0])).resolves.toEqual({ paid: true });
    expect(mockState.rows[0]).toMatchObject({ status: 'paid', crypto_transaction_id: 'tx-r1' });
  });

  it('a network error leaves the row processing; the retry reuses the same idem', async () => {
    mockState.rows = [row('r2')];
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(CoinbasePayoutService.payQueuedRow({ ...mockState.rows[0] })).resolves.toEqual({
      paid: false,
      error: 'socket hang up'
    });
    expect(mockState.rows[0].status).toBe('processing');

    fetchMock.mockResolvedValueOnce(coinbaseOk('tx-r2', 'completed'));
    await expect(CoinbasePayoutService.payQueuedRow({ ...mockState.rows[0] })).resolves.toEqual({ paid: true });
    const idems = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).idem);
    expect(idems).toEqual(['r2', 'r2']);
    expect(mockState.rows[0].status).toBe('paid');
  });

  it('a definitive refusal or a failed transaction marks the row failed', async () => {
    mockState.rows = [row('r3'), row('r4')];
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ errors: [{ id: 'validation_error' }] })
    });
    await expect(CoinbasePayoutService.payQueuedRow({ ...mockState.rows[0] })).resolves.toEqual({
      paid: false,
      error: 'validation_error'
    });
    fetchMock.mockResolvedValueOnce(coinbaseOk('tx-r4', 'failed'));
    await expect(CoinbasePayoutService.payQueuedRow({ ...mockState.rows[1] })).resolves.toEqual({
      paid: false,
      error: 'coinbase_send_failed'
    });
    expect(mockState.rows.map((r) => r.status)).toEqual(['failed', 'failed']);
  });

  it('rate limits and server errors stay retryable', async () => {
    mockState.rows = [row('r5')];
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
    await CoinbasePayoutService.payQueuedRow({ ...mockState.rows[0] });
    expect(mockState.rows[0].status).toBe('processing');
  });

  it('never sends to a sanctioned destination, and waits when the list is unavailable', async () => {
    mockState.rows = [row('r6', BLOCKED), row('r7')];
    await expect(CoinbasePayoutService.payQueuedRow({ ...mockState.rows[0] })).resolves.toEqual({
      paid: false,
      error: 'crypto_destination_blocked'
    });
    process.env.CRYPTO_PAYOUT_SANCTIONS_LIST_PATH = path.join(listDir, 'missing.txt');
    await expect(CoinbasePayoutService.payQueuedRow({ ...mockState.rows[1] })).resolves.toEqual({
      paid: false,
      error: 'sanctions_list_unavailable'
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockState.rows.map((r) => r.status)).toEqual(['failed', 'queued']);
  });

  it('the payout run sends coinbase rows without Stripe configured', async () => {
    mockState.rows = [row('r8'), { ...row('r9'), payout_rail: 'stripe_connect', crypto_network: null, crypto_destination_address: null }];
    fetchMock.mockResolvedValue(coinbaseOk('tx-r8'));
    const out = await MonetizationService.runQueuedCreatorFundPayouts({ force: true });
    expect(out).toEqual({ processed: 1, errors: ['r9:stripe_not_configured'] });
    expect(mockState.rows.map((r) => r.status)).toEqual(['paid', 'queued']);
  });
});

describe('requestCreatorFundPayout on the coinbase rail', () => {
  it('requires a verified identity and a saved wallet', async () => {
    mockState.verified = false;
    await expect(MonetizationService.requestCreatorFundPayout('pn-a', 2000, 'coinbase')).rejects.toThrow(
      'identity_verification_required'
    );
    mockState.verified = true;
    await expect(MonetizationService.requestCreatorFundPayout('pn-a', 2000, 'coinbase')).rejects.toThrow(
      'crypto_destination_missing'
    );
    expect(mockState.inserted).toHaveLength(0);
  });

  it('queues the payout with a snapshot of the saved wallet', async () => {
    mockState.destinations.set('pn-a', { network: 'base', address: WALLET.toLowerCase() });
    const out = await MonetizationService.requestCreatorFundPayout('pn-a', 2000, 'coinbase');
    expect(out).toMatchObject({ amountCents: 2000, status: 'queued', rail: 'coinbase' });
    expect(mockState.inserted).toEqual([['pn-a', 2000, 'coinbase', 'base', WALLET.toLowerCase()]]);
  });

  it('refuses a saved wallet that has since been sanctioned', async () => {
    mockState.destinations.set('pn-a', { network: 'base', address: BLOCKED });
    await expect(MonetizationService.requestCreatorFundPayout('pn-a', 2000, 'coinbase')).rejects.toThrow(
      'crypto_destination_blocked'
    );
  });
});
