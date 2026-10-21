/**
 * @jest-environment node
 *
 * pn-agent-mcp codes travel through the Unlock broker, so the code alone must not mint
 * tokens. Falsification: without the PKCE check, a wrong verifier would get a token.
 */
import { createHash } from 'crypto';

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({ query: jest.fn(async () => ({ rows: [] })) }),
}));

jest.mock('../utils/cache', () => ({
  getCacheClient: () => null,
}));

jest.mock('./identitySuccessionService', () => ({
  isPnRevokedForNetwork: () => false,
  isDidRevokedForNetwork: () => false,
}));

import {
  clientRequiresPkce,
  normalizePkceChallenge,
  pkceVerifierMatches,
  PNOAuthService,
} from './pnOAuthService';
import { clearMemoryAuthCodesForTests, putAuthCodeRecord } from './oauthAuthCodeStore';

const VERIFIER = 'v'.repeat(20) + 'erifier-0123456789_ABCDEFGHIJ';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const REDIRECT = 'https://unlock.parnoir.com/oauth/agent-complete';

async function putCode(code: string, clientId: string, codeChallenge?: string) {
  await putAuthCodeRecord(
    {
      code,
      clientId,
      redirectUri: REDIRECT,
      scope: ['openid', 'ai:files.published'],
      did: 'did:key:agent',
      publicKey: 'agent-pk',
      pnIdentifier: 'pn-agent',
      codeChallenge,
      expiresAt: Date.now() + 60_000,
    },
    60_000
  );
}

describe('PKCE for pn-agent-mcp', () => {
  afterEach(() => clearMemoryAuthCodesForTests());

  it('requires PKCE only for the agent client', () => {
    expect(clientRequiresPkce('pn-agent-mcp')).toBe(true);
    expect(clientRequiresPkce('browser-app')).toBe(false);
  });

  it('accepts only S256 challenges of the right shape', () => {
    expect(normalizePkceChallenge(undefined, undefined)).toBeNull();
    expect(normalizePkceChallenge(CHALLENGE, 'S256')).toBe(CHALLENGE);
    expect(() => normalizePkceChallenge(CHALLENGE, 'plain')).toThrow();
    expect(() => normalizePkceChallenge('short', 'S256')).toThrow();
  });

  it('matches the verifier against the stored challenge', () => {
    expect(pkceVerifierMatches(VERIFIER, CHALLENGE)).toBe(true);
    expect(pkceVerifierMatches(VERIFIER + 'x', CHALLENGE)).toBe(false);
    expect(pkceVerifierMatches(undefined, CHALLENGE)).toBe(false);
  });

  it('refuses the exchange with a wrong or missing verifier', async () => {
    await putCode('code-wrong', 'pn-agent-mcp', CHALLENGE);
    const wrong = await PNOAuthService.exchangeCodeForToken({
      code: 'code-wrong',
      clientId: 'pn-agent-mcp',
      redirectUri: REDIRECT,
      codeVerifier: 'w'.repeat(43),
    });
    expect(wrong).toBeNull();

    await putCode('code-missing', 'pn-agent-mcp', CHALLENGE);
    const missing = await PNOAuthService.exchangeCodeForToken({
      code: 'code-missing',
      clientId: 'pn-agent-mcp',
      redirectUri: REDIRECT,
    });
    expect(missing).toBeNull();
  });

  it('refuses an agent code minted without a challenge', async () => {
    await putCode('code-nochal', 'pn-agent-mcp');
    const token = await PNOAuthService.exchangeCodeForToken({
      code: 'code-nochal',
      clientId: 'pn-agent-mcp',
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
    });
    expect(token).toBeNull();
  });

  it('mints tokens with the matching verifier', async () => {
    await putCode('code-ok', 'pn-agent-mcp', CHALLENGE);
    const token = await PNOAuthService.exchangeCodeForToken({
      code: 'code-ok',
      clientId: 'pn-agent-mcp',
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
    });
    expect(token?.access_token).toBeTruthy();
    expect(token?.scope).toBe('openid ai:files.published');
  });
});
