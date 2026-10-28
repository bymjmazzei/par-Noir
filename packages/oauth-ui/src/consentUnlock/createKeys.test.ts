import { describe, expect, it } from 'vitest';
import { validateCreateKeys } from './createKeys';

describe('validateCreateKeys', () => {
  const ok = { key1: 'alpha', key1Confirm: 'alpha', key2: 'bravo', key2Confirm: 'bravo' };

  it('accepts matching keys', () => {
    expect(validateCreateKeys(ok)).toBeNull();
  });

  it('requires all four fields', () => {
    expect(validateCreateKeys({ ...ok, key2Confirm: '' })).toBe('Enter Key 1 and Key 2, then confirm both');
  });

  it('rejects a Key 1 mismatch', () => {
    expect(validateCreateKeys({ ...ok, key1Confirm: 'alphA' })).toBe('Key 1 entries do not match');
  });

  it('rejects a Key 2 mismatch', () => {
    expect(validateCreateKeys({ ...ok, key2Confirm: 'brav0' })).toBe('Key 2 entries do not match');
  });
});
