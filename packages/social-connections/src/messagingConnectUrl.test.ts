import { describe, expect, it } from 'vitest';
import {
  buildMessagingConnectUrl,
  parseMessagingConnectPath
} from './messagingConnectUrl.js';

describe('messagingConnectUrl', () => {
  it('builds connect URL with normalized lowercase pn id', () => {
    const url = buildMessagingConnectUrl('https://messaging.parnoir.com', 'PN-ABC123DEF456');
    expect(url).toBe('https://messaging.parnoir.com/connect/pn-abc123def456');
  });

  it('parses pn connect path without vanity resolve', () => {
    expect(parseMessagingConnectPath('/connect/pn-abc123def456')).toEqual({
      kind: 'pn',
      pnIdentifier: 'pn-abc123def456'
    });
    expect(parseMessagingConnectPath('/connect/PN-ABC123DEF456')).toEqual({
      kind: 'pn',
      pnIdentifier: 'pn-abc123def456'
    });
  });

  it('parses vanity slug on connect path', () => {
    expect(parseMessagingConnectPath('/connect/alice')).toEqual({
      kind: 'vanity',
      slug: 'alice'
    });
    expect(parseMessagingConnectPath('/connect/@bob')).toEqual({
      kind: 'vanity',
      slug: 'bob'
    });
  });

  it('does not treat root vanity paths as pn connect', () => {
    expect(parseMessagingConnectPath('/alice')).toBeNull();
  });

  it('returns null for invalid connect paths', () => {
    expect(parseMessagingConnectPath('/connect')).toBeNull();
    expect(parseMessagingConnectPath('/connect/foo.bar')).toBeNull();
  });
});
