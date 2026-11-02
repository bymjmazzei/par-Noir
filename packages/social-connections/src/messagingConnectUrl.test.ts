import { describe, expect, it } from 'vitest';
import {
  buildMessagingConnectUrl,
  parseMessagingConnectPath
} from './messagingConnectUrl.js';

const HEX = 'abc123def4567890'.repeat(4);
const PN = `pn-${HEX}`;

describe('messagingConnectUrl', () => {
  it('builds connect URL with normalized lowercase pn id', () => {
    const url = buildMessagingConnectUrl('https://messaging.parnoir.com', PN.toUpperCase());
    expect(url).toBe(`https://messaging.parnoir.com/connect/${PN}`);
  });

  it('parses pn connect path without vanity resolve', () => {
    expect(parseMessagingConnectPath(`/connect/${PN}`)).toEqual({
      kind: 'pn',
      pnIdentifier: PN
    });
    expect(parseMessagingConnectPath(`/connect/${PN.toUpperCase()}`)).toEqual({
      kind: 'pn',
      pnIdentifier: PN
    });
  });

  it('treats a short legacy pn id as a vanity slug', () => {
    expect(parseMessagingConnectPath('/connect/pn-abc123def456')).toEqual({
      kind: 'vanity',
      slug: 'pn-abc123def456'
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
