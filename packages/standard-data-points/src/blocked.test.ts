import { describe, expect, it } from 'vitest';
import { BLOCKED_DATA_POINTS, filterAllowedDataPointIds, isBlockedDataPoint } from './blocked';

describe('blocked data points', () => {
  it('blocks every id in the deny list', () => {
    for (const id of BLOCKED_DATA_POINTS) {
      expect(isBlockedDataPoint(id)).toBe(true);
    }
  });

  it('keeps the three identity factors on the deny list', () => {
    expect(BLOCKED_DATA_POINTS).toContain('pn_file');
    expect(BLOCKED_DATA_POINTS).toContain('pn_name');
    expect(BLOCKED_DATA_POINTS).toContain('passcode');
  });

  it('allows ordinary catalog ids', () => {
    expect(isBlockedDataPoint('age_attestation')).toBe(false);
    expect(isBlockedDataPoint('')).toBe(false);
  });

  it('is case-sensitive so near-miss ids are not silently allowed through a rename', () => {
    expect(isBlockedDataPoint('PN_NAME')).toBe(false);
  });

  it('strips blocked ids while preserving the order of the rest', () => {
    expect(
      filterAllowedDataPointIds(['age_attestation', 'passcode', 'email_verification', 'pn_name'])
    ).toEqual(['age_attestation', 'email_verification']);
  });

  it('returns an empty list when every requested id is blocked', () => {
    expect(filterAllowedDataPointIds([...BLOCKED_DATA_POINTS])).toEqual([]);
  });
});
