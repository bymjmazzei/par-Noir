import { describe, expect, it } from 'vitest';
import * as device from '../../../packages/user-owned-storage/src/relay.js';
import * as relay from './protocol.js';

describe('relay protocol matches the device contract', () => {
  it('has the same version, paths, error codes and exposed headers', () => {
    expect(relay.RELAY_PROTOCOL_VERSION).toBe(device.RELAY_PROTOCOL_VERSION);
    expect(relay.RELAY_PATHS).toEqual(device.RELAY_PATHS);
    expect(relay.RELAY_ERROR_STATUS).toEqual(device.RELAY_ERROR_STATUS);
    expect([...relay.RELAY_EXPOSED_HEADERS]).toEqual([...device.RELAY_EXPOSED_HEADERS]);
  });

  it('agrees on which keys are safe', () => {
    for (const key of ['a/b.json', '_metadata/', '', '/x', '../x', 'a//b', 'a\\b', './a']) {
      expect(relay.isRelayKeySafe(key)).toBe(device.isRelayKeySafe(key));
    }
  });
});
