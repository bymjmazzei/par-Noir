import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  clearOutboundMessageIdsForTests,
  rememberOutboundMessageId
} from './outboundMessageIds';
import { mergeChatMessages, type Message } from './messageService';

vi.mock('./dmCryptoClient', () => ({
  UNABLE_TO_DECRYPT_MESSAGE: '[Unable to decrypt message]',
  decryptIncomingMessage: vi.fn(async (enc: string) => {
    if (enc === 'bad') return '[Unable to decrypt message]';
    return `plain:${enc}`;
  })
}));

vi.mock('./groupCryptoClient', () => ({
  decryptGroupMessage: vi.fn(async (enc: string) => `gplain:${enc}`)
}));

import { decryptOpenThreadWakeMessage } from './inboundMailboxPreview';

function msg(
  partial: Partial<Message> & Pick<Message, 'messageId' | 'fromPnIdentifier'>
): Message {
  return {
    toPnIdentifier: 'pn-peer',
    content: 'test',
    timestamp: new Date().toISOString(),
    read: false,
    encrypted: true,
    ...partial
  };
}

describe('decryptOpenThreadWakeMessage', () => {
  beforeEach(() => {
    clearOutboundMessageIdsForTests();
  });

  it('paints DM ciphertext via session and skips outbound echo', async () => {
    const painted = await decryptOpenThreadWakeMessage(
      {
        messageId: 'msg_peer',
        connectionId: 'conn_1',
        encryptedContent: 'cipher_abc',
        timestamp: '2026-09-15T12:00:00.000Z',
        fromPnIdentifier: 'pn-peer'
      },
      {
        kind: 'dm',
        myPnIdentifier: 'pn-me',
        peerPnIdentifier: 'pn-peer',
        connectionId: 'conn_1'
      }
    );
    expect(painted).not.toBeNull();
    expect(painted!.content).toBe('plain:cipher_abc');
    expect(painted!.fromPnIdentifier).toBe('pn-peer');
    expect(painted!.messageId).toBe('msg_peer');

    rememberOutboundMessageId('msg_mine');
    const echo = await decryptOpenThreadWakeMessage(
      {
        messageId: 'msg_mine',
        connectionId: 'conn_1',
        encryptedContent: 'cipher_mine'
      },
      {
        kind: 'dm',
        myPnIdentifier: 'pn-me',
        peerPnIdentifier: 'pn-peer',
        connectionId: 'conn_1'
      }
    );
    expect(echo).toBeNull();
  });

  it('merge by messageId does not duplicate after Sheets reload', async () => {
    const socketPainted = msg({
      messageId: 'msg_1',
      fromPnIdentifier: 'pn-peer',
      toPnIdentifier: 'pn-me',
      content: 'hello'
    });
    const fromSheets = msg({
      messageId: 'msg_1',
      fromPnIdentifier: 'pn-peer',
      toPnIdentifier: 'pn-me',
      content: 'hello'
    });
    const merged = mergeChatMessages([fromSheets], [socketPainted]);
    expect(merged).toHaveLength(1);
    expect(merged[0].messageId).toBe('msg_1');
  });

  it('returns null on decrypt failure', async () => {
    const painted = await decryptOpenThreadWakeMessage(
      {
        messageId: 'msg_bad',
        connectionId: 'conn_1',
        encryptedContent: 'bad'
      },
      {
        kind: 'dm',
        myPnIdentifier: 'pn-me',
        peerPnIdentifier: 'pn-peer',
        connectionId: 'conn_1'
      }
    );
    expect(painted).toBeNull();
  });

  it('paints group when fromPnIdentifier present', async () => {
    const painted = await decryptOpenThreadWakeMessage(
      {
        messageId: 'gmsg_1',
        groupId: 'grp_1',
        encryptedContent: 'gcipher',
        fromPnIdentifier: 'pn-alice'
      },
      {
        kind: 'group',
        myPnIdentifier: 'pn-me',
        groupId: 'grp_1',
        chatKey: 'chatkeyb64'
      }
    );
    expect(painted).not.toBeNull();
    expect(painted!.content).toBe('gplain:gcipher');
    expect(painted!.fromPnIdentifier).toBe('pn-alice');
  });
});
