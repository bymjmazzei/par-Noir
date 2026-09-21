/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { redirectWithAuthCode } from './redirectWithAuthCode';
import {
  handoffProvidesMessagingSession,
  parseMessagingHandoffFromHash,
  PN_MESSAGING_HANDOFF_HASH_PREFIX,
} from '../messagingOAuthHandoff';

describe('redirectWithAuthCode cross-process', () => {
  it('puts full messaging handoff in hash when openExternal is set', async () => {
    const opened: string[] = [];
    await redirectWithAuthCode({
      code: 'auth-code',
      redirectUri: 'https://browse.parnoir.com/oauth-callback.html',
      state: 'st',
      popupFlow: false,
      clientId: 'browser-app',
      grantedDataPoints: [],
      consentShown: false,
      encryptedIdentity: {
        encryptedData: 'enc',
        iv: 'iv',
        salt: 'salt',
        publicKey: 'pk',
      },
      decryptedIdentity: {
        pqcSecrets: { mlKemSecretKey: 'sk', mlKemPublicKey: 'pk' },
      },
      openExternal: async (url) => {
        opened.push(url);
      },
    });

    expect(opened).toHaveLength(1);
    const u = new URL(opened[0]!);
    expect(u.searchParams.get('code')).toBe('auth-code');
    expect(u.hash.startsWith('#' + PN_MESSAGING_HANDOFF_HASH_PREFIX) || u.hash.startsWith(PN_MESSAGING_HANDOFF_HASH_PREFIX)).toBe(
      true
    );
    const handoff = parseMessagingHandoffFromHash(u.hash);
    expect(handoffProvidesMessagingSession(handoff)).toBe(true);
    expect(handoff?.session?.mlKemSecretKey).toBe('sk');
    expect(handoff?.identity?.encryptedData).toBe('enc');
  });
});
