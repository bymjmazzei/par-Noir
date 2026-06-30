import { describe, expect, it } from 'vitest';
import {
  buildMessagingHandoffFromUnlock,
  buildMessagingHandoffWindowName,
  buildMessagingIdentityHash,
  buildMessagingIdentityPayload,
  buildMessagingSessionWindowName,
  clearMessagingHandoffFromWindowName,
  extractMessagingSessionFromDecrypted,
  handoffProvidesMessagingSession,
  normalizeMessagingHandoffPayload,
  mergeMessagingHandoffParts,
  parseMessagingHandoffFromStorage,
  parseMessagingHandoffFromWindowName,
  parseMessagingIdentityFromHash,
  PN_MESSAGING_OAUTH_HANDOFF_STORAGE,
  PN_MESSAGING_HANDOFF_WINDOW_PREFIX,
  serializeMessagingHandoffForStorage,
  stashMessagingHandoffOnOrigin,
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

  it('merges session-only window.name with identity from hash', () => {
    const ts = samplePayload.timestamp;
    const sessionName = buildMessagingSessionWindowName(samplePayload.session!, ts);
    const identityHash = buildMessagingIdentityHash(samplePayload.identity!, ts);
    const merged = mergeMessagingHandoffParts(
      parseMessagingHandoffFromWindowName(sessionName),
      parseMessagingIdentityFromHash(identityHash)
    );
    expect(merged?.session).toEqual(samplePayload.session);
    expect(merged?.identity).toEqual(samplePayload.identity);
  });

  it('returns null when merge has neither session nor identity', () => {
    expect(mergeMessagingHandoffParts(null, null)).toBeNull();
  });

  it('accepts identity-only merge for hash-only handoff', () => {
    const identity = samplePayload.identity!;
    const merged = mergeMessagingHandoffParts(null, identity);
    expect(merged?.identity).toEqual(identity);
    expect(merged?.session).toBeUndefined();
  });

  it('handoffProvidesMessagingSession requires ML-KEM session', () => {
    expect(handoffProvidesMessagingSession(samplePayload)).toBe(true);
    expect(
      handoffProvidesMessagingSession({ v: 1, timestamp: 1, identity: samplePayload.identity })
    ).toBe(false);
    expect(handoffProvidesMessagingSession(null)).toBe(false);
  });

  it('normalize keeps valid session when identity is corrupt', () => {
    const normalized = normalizeMessagingHandoffPayload({
      v: 1,
      timestamp: 1,
      session: samplePayload.session,
      identity: { encryptedData: 'bad' },
    });
    expect(normalized?.session).toEqual(samplePayload.session);
    expect(normalized?.identity).toBeUndefined();
  });

  it('extractMessagingSessionFromDecrypted reads pqcSecrets', () => {
    const session = extractMessagingSessionFromDecrypted({
      pqcSecrets: { mlKemSecretKey: 'sk', mlKemPublicKey: 'pk' },
    });
    expect(session).toEqual({ mlKemSecretKey: 'sk', mlKemPublicKey: 'pk' });
  });

  it('buildMessagingHandoffFromUnlock combines identity and session', () => {
    const decrypted = {
      pqcSecrets: { mlKemSecretKey: 'sk', mlKemPublicKey: 'pk' },
    };
    const encrypted = samplePayload.identity!;
    const handoff = buildMessagingHandoffFromUnlock(encrypted, decrypted, 42);
    expect(handoff?.session?.mlKemSecretKey).toBe('sk');
    expect(handoff?.identity?.encryptedData).toBe('enc');
    expect(handoff?.timestamp).toBe(42);
  });

  it('buildMessagingIdentityPayload normalizes encrypted identity', () => {
    const identity = buildMessagingIdentityPayload(samplePayload.identity, {
      pqcSecrets: { mlKemPublicKey: 'kem-pk' },
    });
    expect(identity?.mlKemPublicKey).toBe('kem-pk');
  });

  it('stashMessagingHandoffOnOrigin writes localStorage', () => {
    const store = new Map<string, string>();
    const ls = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      clear: () => store.clear(),
    };
    const prev = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
    try {
      stashMessagingHandoffOnOrigin(samplePayload, { requireSession: true });
      const raw = ls.getItem(PN_MESSAGING_OAUTH_HANDOFF_STORAGE);
      expect(parseMessagingHandoffFromStorage(raw)).toEqual(samplePayload);
      expect(handoffProvidesMessagingSession(parseMessagingHandoffFromStorage(raw))).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        value: prev,
        configurable: true,
      });
    }
  });

  it('stashMessagingHandoffOnOrigin fails closed without session when required', () => {
    expect(() =>
      stashMessagingHandoffOnOrigin(
        { v: 1, timestamp: 1, identity: samplePayload.identity },
        { requireSession: true }
      )
    ).toThrow(/messaging encryption keys/);
  });
});
