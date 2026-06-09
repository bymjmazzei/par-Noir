import { describe, expect, it } from 'vitest';
import { DEVICE_CAPABILITIES } from './capabilities';
import { defaultDevicePolicy, evaluateDeviceCapability } from './evaluate';

describe('evaluateDeviceCapability', () => {
  it('allows all before first device keyed', () => {
    const policy = defaultDevicePolicy();
    const result = evaluateDeviceCapability({
      policy,
      isKeyed: false,
      capability: DEVICE_CAPABILITIES.recoveryVaultWrite,
    });
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe('unkeyed_legacy');
  });

  it('allows keyed session after first device', () => {
    const policy = { ...defaultDevicePolicy(), firstDeviceKeyedAt: new Date().toISOString() };
    const result = evaluateDeviceCapability({
      policy,
      isKeyed: true,
      capability: DEVICE_CAPABILITIES.recoveryVaultWrite,
    });
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe('keyed');
  });

  it('blocks immutable deny on unkeyed restricted', () => {
    const policy = { ...defaultDevicePolicy(), firstDeviceKeyedAt: new Date().toISOString() };
    const result = evaluateDeviceCapability({
      policy,
      isKeyed: false,
      capability: DEVICE_CAPABILITIES.recoveryVaultWrite,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('device_required');
  });

  it('allows recovery initiate on unkeyed restricted', () => {
    const policy = { ...defaultDevicePolicy(), firstDeviceKeyedAt: new Date().toISOString() };
    const result = evaluateDeviceCapability({
      policy,
      isKeyed: false,
      capability: DEVICE_CAPABILITIES.recoveryInitiate,
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks non-configured capability on unkeyed restricted', () => {
    const policy = { ...defaultDevicePolicy(), firstDeviceKeyedAt: new Date().toISOString() };
    const result = evaluateDeviceCapability({
      policy,
      isKeyed: false,
      capability: DEVICE_CAPABILITIES.driveUpload,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('capability_not_allowed');
  });
});
