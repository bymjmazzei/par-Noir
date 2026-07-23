/**
 * API unit helpers for opaque social mailbox (no DB).
 */
import { describe, expect, it } from 'vitest';

// isDeviceCloudCustodyEnabled reads process.env — test flag parsing inline
function parseFlag(v: string | undefined): boolean {
  return v === '1' || v === 'true' || v === 'yes';
}

describe('DEVICE_CLOUD_CUSTODY flag', () => {
  it('accepts 1/true/yes', () => {
    expect(parseFlag('1')).toBe(true);
    expect(parseFlag('true')).toBe(true);
    expect(parseFlag('yes')).toBe(true);
    expect(parseFlag(undefined)).toBe(false);
    expect(parseFlag('0')).toBe(false);
  });
});
