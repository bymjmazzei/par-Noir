/**
 * @jest-environment node
 *
 * Session mint is RS256 only. A shared HMAC secret must not verify.
 * Refresh tokens rotate on every use; a used token is rejected.
 */
import jwt from 'jsonwebtoken';
import { assertOauthSigningConfigured, PNOAuthService } from './pnOAuthService';

jest.mock('../utils/database', () => {
  const state: {
    row: {
      refresh_token: string;
      did: string;
      pn_identifier: string;
      client_id: string;
      scope: string[];
      expires_at: Date;
      family_id: string;
      jti: string;
      used_at: Date | null;
      replaced_by: string | null;
      revoked_at: Date | null;
      reuse_detected_at: Date | null;
    };
  } = {
    row: {
      refresh_token: 'stored-hash',
      did: 'did:key:abc',
      pn_identifier: 'pn-abc',
      client_id: 'browser-app',
      scope: ['openid'],
      expires_at: new Date(Date.now() + 86_400_000),
      family_id: 'fam-1',
      jti: 'jti-1',
      used_at: null,
      replaced_by: null,
      revoked_at: null,
      reuse_detected_at: null,
    },
  };

  return {
    getDatabasePool: () => ({
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT refresh_token')) {
          return { rows: [{ ...state.row }] };
        }
        if (sql.includes('SET used_at')) {
          state.row.used_at = new Date();
        }
        if (sql.includes('reuse_detected')) {
          state.row.revoked_at = new Date();
        }
        return { rows: [] };
      }),
    }),
    __state: state,
  };
});

jest.mock('./identitySuccessionService', () => ({
  isPnRevokedForNetwork: () => false,
  isDidRevokedForNetwork: () => false,
}));

describe('OAuth session signing', () => {
  it('refuses production boot without an RSA key or KMS version', () => {
    expect(() =>
      assertOauthSigningConfigured({
        NODE_ENV: 'production',
        PN_OAUTH_PRIVATE_KEY_PEM: '',
        PN_OAUTH_KMS_KEY_VERSION: '',
      })
    ).toThrow(/PN_OAUTH_PRIVATE_KEY_PEM or PN_OAUTH_KMS_KEY_VERSION/);
  });

  it('rejects an HS256 access token', () => {
    const forged = jwt.sign(
      {
        did: 'did:key:forged',
        pnIdentifier: 'pn-forged',
        clientId: 'browser-app',
        scope: ['openid'],
        iss: 'par-noir-api',
        aud: 'par-noir-clients',
      },
      'shared-hmac-secret',
      { algorithm: 'HS256' }
    );
    expect(PNOAuthService.validateAccessToken(forged)).toBeNull();
  });

  it('replaces a refresh token on use and rejects the used token', async () => {
    const first = await PNOAuthService.refreshAccessToken('original-refresh', 'browser-app');
    expect(first?.access_token).toBeTruthy();
    expect(first?.refresh_token).toBeTruthy();
    expect(first?.refresh_token).not.toBe('original-refresh');
    expect(PNOAuthService.validateAccessToken(first!.access_token)?.pnIdentifier).toBe('pn-abc');

    const reused = await PNOAuthService.refreshAccessToken('original-refresh', 'browser-app');
    expect(reused).toBeNull();
  });
});
