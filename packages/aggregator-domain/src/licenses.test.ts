import { describe, expect, it } from 'vitest';
import { LICENSE_TYPES, getLicenseInfo } from './licenses';

describe('license catalog', () => {
  it('has unique license values', () => {
    const values = LICENSE_TYPES.map((l) => l.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('gives every license a label and description', () => {
    for (const license of LICENSE_TYPES) {
      expect(license.label.trim().length).toBeGreaterThan(0);
      expect(license.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('uses lowercase, hyphenated values so they are safe as stored keys', () => {
    for (const license of LICENSE_TYPES) {
      expect(license.value).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('keeps all-rights-reserved available as the restrictive default', () => {
    expect(getLicenseInfo('all-rights-reserved')?.label).toBe('All Rights Reserved');
  });

  it('returns undefined for an unknown license value', () => {
    expect(getLicenseInfo('cc-by-nc-nd-sa-xyz')).toBeUndefined();
  });
});
