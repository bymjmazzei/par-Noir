import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearOutboundMessageIdsForTests,
  isRecentOutboundMessageId,
  rememberOutboundMessageId
} from './outboundMessageIds';
import { mergeChatMessages, type Message } from './messageService';

function msg(partial: Partial<Message> & Pick<Message, 'messageId' | 'fromPnIdentifier'>): Message {
  return {
    toPnIdentifier: 'pn-peer',
    content: 'test',
    timestamp: new Date().toISOString(),
    read: false,
    encrypted: true,
    ...partial
  };
}

describe('outboundMessageIds', () => {
  beforeEach(() => clearOutboundMessageIdsForTests());

  it('remembers recent outbound ids', () => {
    rememberOutboundMessageId('msg_1');
    expect(isRecentOutboundMessageId('msg_1')).toBe(true);
    expect(isRecentOutboundMessageId('msg_other')).toBe(false);
  });
});

describe('mergeChatMessages sender echo', () => {
  beforeEach(() => clearOutboundMessageIdsForTests());

  it('drops pending own send when peer-attributed echo arrives with same content', () => {
    const pending = msg({
      messageId: 'temp-1',
      fromPnIdentifier: 'pn-me',
      toPnIdentifier: 'pn-peer',
      content: 'hello',
      timestamp: '2026-09-14T18:24:29.000Z'
    });
    const echo = msg({
      messageId: 'msg_real',
      fromPnIdentifier: 'pn-peer',
      toPnIdentifier: 'pn-me',
      content: 'hello',
      timestamp: '2026-09-14T18:24:29.100Z'
    });
    const merged = mergeChatMessages([echo], [pending]);
    expect(merged).toHaveLength(1);
    expect(merged[0].messageId).toBe('msg_real');
    expect(merged[0].fromPnIdentifier).toBe('pn-me');
    expect(merged[0].content).toBe('hello');
  });

  it('keeps own attribution when confirmed send and peer echo share messageId', () => {
    const own = msg({
      messageId: 'msg_real',
      fromPnIdentifier: 'pn-me',
      toPnIdentifier: 'pn-peer',
      content: 'hello'
    });
    const echo = msg({
      messageId: 'msg_real',
      fromPnIdentifier: 'pn-peer',
      toPnIdentifier: 'pn-me',
      content: 'hello'
    });
    const merged = mergeChatMessages([echo], [own]);
    expect(merged).toHaveLength(1);
    expect(merged[0].fromPnIdentifier).toBe('pn-me');
  });
});
