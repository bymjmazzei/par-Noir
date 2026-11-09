/**
 * The owner API JWT lives in the shared pN session: shell unlock (no Key 2) and
 * unlock-proof mint both start it bound to the pN, and sync readers see it.
 */
jest.mock('../config/api', () => ({ API_ENDPOINT: 'https://api.test', PN_CLIENT_ID: 'browser-app' }));
jest.mock('@par-noir/identity-crypto', () => ({ IdentityCrypto: {} }));
jest.mock('../../../../packages/oauth-ui/src/pnOAuthPopup', () => ({ oauthStatesMatch: jest.fn() }));
jest.mock('@par-noir/oauth-ui', () => ({
  ...jest.requireActual('../../../../packages/oauth-ui/src/session/pnSession'),
  exchangePortalAuthorizationCode: jest.fn(),
  mintAccessTokenWithUnlockProof: jest.fn(),
  oauthStatesMatch: jest.fn(),
}));
jest.mock('@par-noir/pqc-crypto/oauth-unlock-proof', () => ({
  deriveCanonicalPnIdentifier: (publicKey: string) => `pn-${publicKey.slice(0, 12)}`,
}));

import {
  beginDashboardSession,
  dashboardSession,
  getStoredToken,
  getStoredTokenForPn,
} from '../services/parNoirOAuthInline';

const publicKey = 'dGVzdC1wdWJsaWMta2V5';

beforeEach(() => {
  const store = new Map<string, string>();
  (sessionStorage.getItem as jest.Mock).mockImplementation((k: string) => store.get(k) ?? null);
  (sessionStorage.setItem as jest.Mock).mockImplementation((k: string, v: string) => store.set(k, v));
  (sessionStorage.removeItem as jest.Mock).mockImplementation((k: string) => store.delete(k));
});

test('shell unlock tokens start a pN-bound session with a refresh token', async () => {
  await beginDashboardSession(
    { access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600, idle_timeout_s: 900 },
    publicKey
  );
  const record = dashboardSession.load();
  expect(record?.refreshToken).toBe('refresh-token');
  expect(record?.idleTimeoutS).toBe(900);
  expect(getStoredToken()?.pnIdentifier).toBe(`pn-${publicKey.slice(0, 12)}`);
  expect(getStoredTokenForPn(publicKey.slice(0, 12))?.accessToken).toBe('access-token');
});

test('clear drops the API token', async () => {
  await beginDashboardSession({ access_token: 'a', expires_in: 3600 }, publicKey);
  dashboardSession.clear();
  expect(getStoredToken()).toBeNull();
});
