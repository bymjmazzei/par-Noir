import { describe, expect, it } from 'vitest';
import {
  getDataPointMinLevel,
  grantCoversRequest,
  proofMeetsMinLevel,
} from './verificationLevel';
import { applyStaticContract } from './clientContracts';

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
    const applied = applyStaticContract('browser-app', {
      requiredDataPoints: ['email'],
      optionalDataPoints: ['age_attestation'],
    });
    expect(applied.requiredDataPoints).toEqual([]);
    expect(applied.optionalDataPoints).toEqual(['over_21']);
    expect(applied.dataPointLevels).toEqual({ over_21: 'verified' });
    expect(applied.permissions).toContain('zkp:over_21');
    expect(applied.permissions).not.toContain('zkp:age_attestation');
  });

  it('gives messaging-app no data points and no age scope', () => {
    const applied = applyStaticContract('messaging-app', {});
    expect(applied.requiredDataPoints).toEqual([]);
    expect(applied.optionalDataPoints).toEqual([]);
    expect(applied.permissions).toEqual(['openid', 'profile', 'cloud:read']);
  });

  it('leaves unknown clients untouched', () => {
    const original = { optionalDataPoints: ['email'] };
    expect(applyStaticContract('some-third-party', original)).toBe(original);
  });

  it('treats a declined data point as covered but a new one as uncovered', () => {
    expect(grantCoversRequest(['over_21'], ['over_21'])).toBe(true);
    expect(grantCoversRequest([], [])).toBe(true);
    expect(grantCoversRequest(['over_21'], ['over_21', 'email'])).toBe(false);
    expect(grantCoversRequest([], ['over_21'])).toBe(false);
  });
});
