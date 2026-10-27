import { describe, expect, it } from 'vitest';
import { safePnDisplayName } from './displayName';

describe('safePnDisplayName', () => {
  it('uses the nickname when it is not Key 1', () => {
    expect(safePnDisplayName({ nickname: 'Studio', key1: 'secret-one', pnIdentifier: 'pn-87f49f0fb345' })).toBe(
      'Studio'
    );
  });

  it('never returns Key 1, even when the nickname equals it', () => {
    expect(safePnDisplayName({ nickname: 'secret-one', key1: 'secret-one', pnIdentifier: 'pn-87f49f0fb345' })).toBe(
      'pN 87f49f0f'
    );
  });

  it('falls back to the pN id, then to a neutral label', () => {
    expect(safePnDisplayName({ pnIdentifier: 'pn-87f49f0fb345' })).toBe('pN 87f49f0f');
    expect(safePnDisplayName({})).toBe('pN');
  });
});
