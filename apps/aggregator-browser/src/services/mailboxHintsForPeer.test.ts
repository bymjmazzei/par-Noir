import { describe, expect, it } from 'vitest';
import {
  filterMailboxHintsByFromToLegacy,
  filterMailboxHintsForPeer,
  type Message,
} from './messageService';

const USER = 'pn-87f49f0fb345';
const PEER = 'pn-b2f31d3ddf76';
const CONN = 'conn-live-1';

function opaqueHint(overrides: Partial<Message> = {}): Message {
  return {
    messageId: 'msg_opaque_1',
    fromPnIdentifier: '',
    toPnIdentifier: '',
    content: '',
    encryptedContent: 'eyJ2IjoyfQ==',
    cryptoVersion: 2,
    timestamp: '2026-09-11T18:00:00.000Z',
    read: false,
    encrypted: true,
    connectionId: CONN,
    role: 'recipient',
    ...overrides,
  };
}

describe('filterMailboxHintsForPeer (M3 opaque throughway)', () => {
  it('legacy from/to filter drops sanitized mailbox jobs (falsification)', () => {
    const hints = [opaqueHint()];
    const legacy = filterMailboxHintsByFromToLegacy(hints, USER, PEER);
    expect(legacy).toHaveLength(0);
  });

  it('keeps opaque hints when connectionId matches the open thread', () => {
    const hints = [opaqueHint(), opaqueHint({ messageId: 'msg_other', connectionId: 'conn-other' })];
    const matched = filterMailboxHintsForPeer(hints, {
      userPnIdentifier: USER,
      participantPnIdentifier: PEER,
      connectionId: CONN,
    });
    expect(matched).toHaveLength(1);
    expect(matched[0].messageId).toBe('msg_opaque_1');
    expect(matched[0].fromPnIdentifier).toBe(PEER);
    expect(matched[0].toPnIdentifier).toBe(USER);
  });

  it('falls back to threadId when connectionId is absent on the thread', () => {
    const threadId = [USER, PEER].sort().join('_');
    const hints = [
      opaqueHint({
        connectionId: undefined,
        threadId,
      }),
    ];
    const matched = filterMailboxHintsForPeer(hints, {
      userPnIdentifier: USER,
      participantPnIdentifier: PEER,
      connectionId: undefined,
    });
    expect(matched).toHaveLength(1);
    expect(matched[0].fromPnIdentifier).toBe(PEER);
  });
});
