import { describe, expect, it } from 'vitest';
import {
  buildHandleTransferStatement,
  buildPersonalFeedStatement,
  canonicalHandleTransferBytes,
  canonicalPersonalFeedBytes,
  parseHandleTransferStatement,
  parsePersonalFeedStatement,
} from './ownerStatements';

const NONCE = 'abcdefghijklmnop';
const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe('PersonalFeedStatement', () => {
  const s = buildPersonalFeedStatement({
    rootPublicKey: 'ROOT',
    feedPnIdentifier: 'pn-feed',
    feedPublicKey: 'FEED',
    nonce: NONCE,
    issuedAt: '2026-11-09T10:00:00.000Z',
  });

  it('round-trips through JSON with identical canonical bytes', () => {
    const parsed = parsePersonalFeedStatement(JSON.parse(JSON.stringify(s)));
    expect(parsed).not.toBeNull();
    expect(canonicalPersonalFeedBytes(parsed!)).toEqual(canonicalPersonalFeedBytes(s));
  });

  it('is domain separated', () => {
    expect(text(canonicalPersonalFeedBytes(s)).startsWith('PN-PERSONAL-FEED-V1\n')).toBe(true);
  });

  it('rejects wrong kind, version, nonce or date', () => {
    expect(parsePersonalFeedStatement({ ...s, kind: 'handle_transfer' })).toBeNull();
    expect(parsePersonalFeedStatement({ ...s, v: 2 })).toBeNull();
    expect(parsePersonalFeedStatement({ ...s, nonce: 'short' })).toBeNull();
    expect(parsePersonalFeedStatement({ ...s, issuedAt: 'nope' })).toBeNull();
  });
});

describe('HandleTransferStatement', () => {
  const s = buildHandleTransferStatement({
    name: 'bymjmazzei',
    rootPublicKey: 'ROOT',
    toPnIdentifier: 'pn-recipient',
    nonce: NONCE,
    issuedAt: '2026-11-09T10:00:00.000Z',
  });

  it('round-trips and differs from the feed statement domain', () => {
    const parsed = parseHandleTransferStatement(JSON.parse(JSON.stringify(s)));
    expect(canonicalHandleTransferBytes(parsed!)).toEqual(canonicalHandleTransferBytes(s));
    expect(text(canonicalHandleTransferBytes(s)).startsWith('PN-HANDLE-TRANSFER-V1\n')).toBe(true);
  });

  it('rejects a missing recipient', () => {
    expect(parseHandleTransferStatement({ ...s, toPnIdentifier: '' })).toBeNull();
  });
});
