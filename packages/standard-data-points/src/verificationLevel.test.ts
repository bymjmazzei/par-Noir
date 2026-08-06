import { describe, expect, it } from 'vitest';
import {
  applyBrowserAppStaticContract,
  browserAppOver21Shared,
  getDataPointMinLevel,
  proofMeetsMinLevel,
} from './verificationLevel';

describe('verificationLevel', () => {
  it('defaults min level to attested', () => {
    expect(getDataPointMinLevel(undefined, 'full_name')).toBe('attested');
    expect(getDataPointMinLevel({}, 'full_name')).toBe('attested');
  });

  it('reads per-id min level', () => {
    expect(getDataPointMinLevel({ over_21: 'verified' }, 'over_21')).toBe('verified');
  });

  it('verified satisfies attested; attested does not satisfy verified', () => {
    expect(proofMeetsMinLevel('basic', 'attested')).toBe(true);
    expect(proofMeetsMinLevel('verified', 'attested')).toBe(true);
    expect(proofMeetsMinLevel('basic', 'verified')).toBe(false);
    expect(proofMeetsMinLevel('verified', 'verified')).toBe(true);
    expect(proofMeetsMinLevel(undefined, 'attested')).toBe(false);
  });

  it('applies browser-app static contract', () => {
    const applied = applyBrowserAppStaticContract({
      dataPoints: ['over_21'],
      requiredDataPoints: ['email'],
      optionalDataPoints: ['age_attestation'],
    });
    expect(applied.requiredDataPoints).toEqual([]);
    expect(applied.optionalDataPoints).toEqual(['over_21']);
    expect(applied.dataPointLevels).toEqual({ over_21: 'verified' });
  });

  it('detects over_21 grant for consent cache', () => {
    expect(browserAppOver21Shared(['age_attestation'])).toBe(false);
    expect(browserAppOver21Shared(['over_21'])).toBe(true);
  });
});
