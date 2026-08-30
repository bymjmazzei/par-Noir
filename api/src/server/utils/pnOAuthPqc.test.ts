/**
 * @jest-environment node
 */
/**
 * Gate tests: OAuth session mint requires ML-DSA unlock proof.
 * Forged identity claims without a valid challenge signature MUST fail.
 * Real unlock proof MUST still issue code → token.
 */
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import {
  deriveCanonicalPnIdentifier,
  deriveDidFromPublicKey,
  signOauthUnlockProof,
} from '@par-noir/pqc-crypto/oauth-unlock-proof';
import {
  OauthUnlockProofError,
  PNOAuthService,
} from '../modules/pnOAuthService';

jest.mock('./database', () => {
  const query = jest.fn().mockResolvedValue({ rows: [] });
  return {
    getDatabasePool: jest.fn(() => ({ query })),
  };
});

jest.mock('../modules/identitySuccessionService', () => ({
  isPnRevokedForNetwork: () => false,
  isDidRevokedForNetwork: () => false,
}));

describe('OAuth unlock proof gate', () => {
  const clientId = 'browser-app';
  const redirectUri = 'https://browse.parnoir.com/oauth-callback.html';
  const scope = ['openid', 'profile'];

  it('rejects forged authenticate without a valid unlock signature', () => {
    const issued = PNOAuthService.createUnlockChallenge({ clientId, redirectUri });
    const forged = mlDsa65Keygen();
    const publicKey = bytesToBase64(forged.publicKey);

    expect(() =>
      PNOAuthService.authenticateWithUnlockProof({
        clientId,
        redirectUri,
        scope,
        state: 'st',
        nonce: 'nn',
        challengeId: issued.challengeId,
        publicKey,
        signature: Buffer.from('not-a-real-signature').toString('base64'),
      })
    ).toThrow(OauthUnlockProofError);
  });

  it('rejects authenticate that reuses a consumed challenge', () => {
    const dsa = mlDsa65Keygen();
    const publicKey = bytesToBase64(dsa.publicKey);
    const issued = PNOAuthService.createUnlockChallenge({ clientId, redirectUri });
    const signature = signOauthUnlockProof(
      {
        challenge: issued.challenge,
        clientId,
        redirectUri,
        scope: scope.join(' '),
        state: 'st',
        nonce: 'nn',
        publicKey,
      },
      dsa.secretKey
    );

    const first = PNOAuthService.authenticateWithUnlockProof({
      clientId,
      redirectUri,
      scope,
      state: 'st',
      nonce: 'nn',
      challengeId: issued.challengeId,
      publicKey,
      signature,
    });
    expect(first.code).toBeTruthy();

    expect(() =>
      PNOAuthService.authenticateWithUnlockProof({
        clientId,
        redirectUri,
        scope,
        state: 'st',
        nonce: 'nn',
        challengeId: issued.challengeId,
        publicKey,
        signature,
      })
    ).toThrow(OauthUnlockProofError);
  });

  it('rejects signature from a different key than public_key', () => {
    const owner = mlDsa65Keygen();
    const attacker = mlDsa65Keygen();
    const publicKey = bytesToBase64(owner.publicKey);
    const issued = PNOAuthService.createUnlockChallenge({ clientId, redirectUri });
    const signature = signOauthUnlockProof(
      {
        challenge: issued.challenge,
        clientId,
        redirectUri,
        scope: scope.join(' '),
        publicKey,
      },
      attacker.secretKey
    );

    expect(() =>
      PNOAuthService.authenticateWithUnlockProof({
        clientId,
        redirectUri,
        scope,
        challengeId: issued.challengeId,
        publicKey,
        signature,
      })
    ).toThrow(OauthUnlockProofError);
  });

  it('real unlock proof issues code → token with derived did/pnIdentifier', async () => {
    const dsa = mlDsa65Keygen();
    const publicKey = bytesToBase64(dsa.publicKey);
    const expectedDid = deriveDidFromPublicKey(publicKey);
    const expectedPn = deriveCanonicalPnIdentifier(publicKey);

    const issued = PNOAuthService.createUnlockChallenge({ clientId, redirectUri });
    const signature = signOauthUnlockProof(
      {
        challenge: issued.challenge,
        clientId,
        redirectUri,
        scope: scope.join(' '),
        state: 'good',
        nonce: 'nonce1',
        publicKey,
      },
      dsa.secretKey
    );

    const auth = PNOAuthService.authenticateWithUnlockProof({
      clientId,
      redirectUri,
      scope,
      state: 'good',
      nonce: 'nonce1',
      challengeId: issued.challengeId,
      publicKey,
      signature,
    });

    expect(auth.did).toBe(expectedDid);
    expect(auth.pnIdentifier).toBe(expectedPn);
    expect(auth.code).toMatch(/^[a-f0-9]{64}$/);

    const tokenResponse = await PNOAuthService.exchangeCodeForToken({
      code: auth.code,
      clientId,
      redirectUri,
    });
    expect(tokenResponse).not.toBeNull();
    expect(tokenResponse!.access_token).toBeTruthy();

    const payload = await PNOAuthService.validateAccessToken(tokenResponse!.access_token);
    expect(payload?.did).toBe(expectedDid);
    expect(payload?.pnIdentifier).toBe(expectedPn);
  });
});
