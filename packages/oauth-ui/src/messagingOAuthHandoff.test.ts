import { describe, expect, it } from 'vitest';
import {
  buildMessagingHandoffWindowName,
  clearMessagingHandoffFromWindowName,
  parseMessagingHandoffFromStorage,
  parseMessagingHandoffFromWindowName,
  PN_MESSAGING_HANDOFF_WINDOW_PREFIX,
  serializeMessagingHandoffForStorage,
  type MessagingOAuthHandoffPayload,
} from './messagingOAuthHandoff';

const samplePayload: MessagingOAuthHandoffPayload = {
  v: 1,
  timestamp: 1_700_000_000_000,
  identity: {
    encryptedData: 'enc',
    iv: 'iv',
    salt: 'salt',
    publicKey: 'pk',
    mlKemPublicKey: 'kem-pk',
  },
  session: {
    mlKemSecretKey: 'kem-sk',
    mlKemPublicKey: 'kem-pk',
  },
};

describe('messagingOAuthHandoff', () => {
  it('round-trips window.name encoding', () => {
    const name = buildMessagingHandoffWindowName(samplePayload);
    expect(name.startsWith(PN_MESSAGING_HANDOFF_WINDOW_PREFIX)).toBe(true);
    expect(parseMessagingHandoffFromWindowName(name)).toEqual(samplePayload);
  });

  it('round-trips localStorage serialization', () => {
    const raw = serializeMessagingHandoffForStorage(samplePayload);
    expect(parseMessagingHandoffFromStorage(raw)).toEqual(samplePayload);
  });

  it('clears handoff prefix from window.name', () => {
    const name = buildMessagingHandoffWindowName(samplePayload);
    expect(clearMessagingHandoffFromWindowName(name)).toBe('');
    expect(clearMessagingHandoffFromWindowName('parnoir_oauth_parent_v1')).toBe(
      'parnoir_oauth_parent_v1'
    );
  });

  it('rejects invalid payloads', () => {
    expect(parseMessagingHandoffFromWindowName('not-a-handoff')).toBeNull();
    expect(parseMessagingHandoffFromStorage('{"v":2}')).toBeNull();
    expect(parseMessagingHandoffFromStorage('{"v":1,"timestamp":1}')).toBeNull();
  });
});
