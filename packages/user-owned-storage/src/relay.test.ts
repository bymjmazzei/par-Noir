import { describe, expect, it } from 'vitest';
import { isRelayKeySafe } from './relay.js';

describe('isRelayKeySafe', () => {
  it('accepts relative keys under the prefix', () => {
    expect(isRelayKeySafe('_metadata/connections.db')).toBe(true);
    expect(isRelayKeySafe('par-noir-messages/outbox/a.json')).toBe(true);
    expect(isRelayKeySafe('_metadata/')).toBe(true);
  });

  it('refuses keys that could leave the prefix', () => {
    for (const key of ['', '/etc/passwd', '../x', 'a/../../x', 'a//b', './a', 'a\\b', 'a\u0000b']) {
      expect(isRelayKeySafe(key)).toBe(false);
    }
  });
});
