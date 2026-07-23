import { sanitizeForLogs, hashIdentifier } from '../../utils/logger';

describe('sanitizeForLogs', () => {
  it('redacts sensitive keys recursively', () => {
    const input = {
      authorization: 'Bearer very-secret-token',
      nested: {
        refresh_token: 'abc',
        client_secret: 'xyz',
      },
      safe: 'ok',
    };

    const out = sanitizeForLogs(input) as any;
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.nested.refresh_token).toBe('[REDACTED]');
    expect(out.nested.client_secret).toBe('[REDACTED]');
    expect(out.safe).toBe('ok');
  });

  it('hashes pN identifier fields', () => {
    const pn = 'pn-83c1db813607';
    const input = {
      fromPnIdentifier: pn,
      toPnIdentifier: 'pn-abc123def456',
      messageId: 'msg-1',
    };
    const out = sanitizeForLogs(input) as Record<string, unknown>;
    expect(out.fromPnIdentifier).toBe(hashIdentifier(pn));
    expect(out.toPnIdentifier).toBe(hashIdentifier('pn-abc123def456'));
    expect(out.messageId).toBe('msg-1');
  });

  it('hashes bare pn- strings', () => {
    const pn = 'pn-83c1db813607';
    expect(sanitizeForLogs(pn)).toBe(hashIdentifier(pn));
  });

  it('hashes mailbox route keys', () => {
    const routeKey = 'a'.repeat(64);
    const out = sanitizeForLogs({
      routeKey,
      peerMailboxRouteKey: routeKey,
      messageId: 'msg-1'
    }) as Record<string, unknown>;
    expect(out.routeKey).toBe(hashIdentifier(routeKey));
    expect(out.peerMailboxRouteKey).toBe(hashIdentifier(routeKey));
    expect(out.messageId).toBe('msg-1');
  });
});
