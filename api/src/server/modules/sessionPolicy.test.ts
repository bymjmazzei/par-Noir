/**
 * @jest-environment node
 *
 * Idle backstop on refresh, browser binding on the access token, the 30-day hard
 * cap on rotation, and lock-browser revoking every family in one browser.
 */
import {
  idleTimeoutSeconds,
  isFamilyIdleExpired,
  normalizeBrowserId,
  normalizeSessionPolicy,
} from './sessionPolicy';
import { PNOAuthService } from './pnOAuthService';

type Row = Record<string, unknown>;

jest.mock('../utils/database', () => {
  const state: { row: Row; policy: Row | null; queries: Array<{ sql: string; params: unknown[] }> } = {
    row: {},
    policy: null,
    queries: [],
  };
  return {
    getDatabasePool: () => ({
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        state.queries.push({ sql, params });
        if (sql.includes('FROM pn_session_policy')) {
          return { rows: state.policy ? [state.policy] : [] };
        }
        if (sql.includes('SELECT refresh_token')) return { rows: [{ ...state.row }] };
        if (sql.includes('SELECT public_key, family_id, browser_id')) {
          return { rows: [{ ...state.row }] };
        }
        if (sql.includes("revoked_reason = 'browser_lock'")) {
          return { rows: [{ family_id: 'fam-1' }, { family_id: 'fam-2' }] };
        }
        return { rows: [] };
      }),
    }),
    __state: state,
  };
});

jest.mock('@par-noir/pqc-crypto/oauth-unlock-proof', () => ({
  ...jest.requireActual('@par-noir/pqc-crypto/oauth-unlock-proof'),
  deriveCanonicalPnIdentifier: () => 'pn-abcdef012345',
}));

jest.mock('./identitySuccessionService', () => ({
  isPnRevokedForNetwork: () => false,
  isDidRevokedForNetwork: () => false,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dbState = require('../utils/database').__state as {
  row: Row;
  policy: Row | null;
  queries: Array<{ sql: string; params: unknown[] }>;
};

const HOUR = 60 * 60 * 1000;
const BID = 'bid_abcdefghijklmnop';

function freshRow(overrides: Row = {}): Row {
  return {
    refresh_token: 'stored-hash',
    did: 'did:key:abc',
    public_key: 'dGVzdC1wdWJsaWMta2V5',
    client_id: 'pen-app',
    scope: ['openid'],
    expires_at: new Date(Date.now() + 10 * 24 * HOUR),
    family_id: 'fam-1',
    jti: 'jti-1',
    used_at: null,
    replaced_by: null,
    revoked_at: null,
    reuse_detected_at: null,
    created_at: new Date(),
    browser_id: BID,
    ...overrides,
  };
}

beforeEach(() => {
  dbState.row = freshRow();
  dbState.policy = null;
  dbState.queries = [];
});

describe('session policy helpers', () => {
  it('accepts only the offered idle options', () => {
    expect(normalizeSessionPolicy({ idleMinutes: 60 })).toEqual({ idleMinutes: 60, trustedDevice: false });
    expect(normalizeSessionPolicy({ idleMinutes: 7 })).toBeNull();
    expect(normalizeSessionPolicy({ idleMinutes: 480, trustedDevice: true })).toEqual({
      idleMinutes: 480,
      trustedDevice: true,
    });
  });

  it('reports 0 idle seconds for a trusted device', () => {
    expect(idleTimeoutSeconds({ idleMinutes: 60, trustedDevice: false })).toBe(3600);
    expect(idleTimeoutSeconds({ idleMinutes: 60, trustedDevice: true })).toBe(0);
  });

  it('expires a family only past idle + one access-token lifetime', () => {
    const now = Date.now();
    const policy = { idleMinutes: 60, trustedDevice: false };
    expect(isFamilyIdleExpired(new Date(now - 1.9 * HOUR), policy, HOUR, now)).toBe(false);
    expect(isFamilyIdleExpired(new Date(now - 2.1 * HOUR), policy, HOUR, now)).toBe(true);
    expect(
      isFamilyIdleExpired(new Date(now - 30 * HOUR), { ...policy, trustedDevice: true }, HOUR, now)
    ).toBe(false);
  });

  it('validates browser ids', () => {
    expect(normalizeBrowserId(BID)).toBe(BID);
    expect(normalizeBrowserId('short')).toBeUndefined();
    expect(normalizeBrowserId('has spaces in it here!')).toBeUndefined();
  });
});

describe('refresh with session policy', () => {
  it('carries the browser binding into the access token and inherits the family expiry', async () => {
    const res = await PNOAuthService.refreshAccessToken('rt-1', 'pen-app');
    expect(res?.idle_timeout_s).toBe(3600);
    expect(PNOAuthService.validateAccessToken(res!.access_token)?.bid).toBe(BID);

    const insert = dbState.queries.find((q) => q.sql.includes('INSERT INTO oauth_refresh_tokens'));
    expect(insert?.params[5]).toEqual(dbState.row.expires_at);
    expect(insert?.params[9]).toBe(BID);
  });

  it('refuses and revokes a family idle past the policy', async () => {
    dbState.row = freshRow({ created_at: new Date(Date.now() - 3 * HOUR) });
    const res = await PNOAuthService.refreshAccessToken('rt-2', 'pen-app');
    expect(res).toBeNull();
    expect(dbState.queries.some((q) => q.sql.includes("revoked_reason = 'idle_timeout'"))).toBe(true);
  });

  it('lets a trusted device refresh after a long gap', async () => {
    dbState.row = freshRow({ created_at: new Date(Date.now() - 20 * HOUR) });
    dbState.policy = { idle_minutes: 60, trusted_device: true };
    const res = await PNOAuthService.refreshAccessToken('rt-3', 'pen-app');
    expect(res?.access_token).toBeTruthy();
    expect(res?.idle_timeout_s).toBe(0);
  });
});

describe('lockBrowser', () => {
  it('revokes every family for the pN in the browser when bound', async () => {
    const res = await PNOAuthService.lockBrowser('rt-4');
    expect(res?.browserId).toBe(BID);
    expect(res?.pnIdentifier).toMatch(/^pn-/);
    expect(res?.revokedFamilies).toBe(2);
    const revoke = dbState.queries.find((q) => q.sql.includes("revoked_reason = 'browser_lock'"));
    expect(revoke?.sql).toContain('browser_id = $1 AND public_key = $2');
  });

  it('revokes only the caller family without a browser binding', async () => {
    dbState.row = freshRow({ browser_id: null });
    await PNOAuthService.lockBrowser('rt-5');
    const revoke = dbState.queries.find((q) => q.sql.includes("revoked_reason = 'browser_lock'"));
    expect(revoke?.sql).toContain('family_id = $1');
  });
});
