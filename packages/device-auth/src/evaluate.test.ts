import { describe, expect, it } from 'vitest';
import { DEVICE_CAPABILITIES } from './capabilities';
import { defaultDevicePolicy, evaluateDeviceCapability } from './evaluate';

describe('evaluateDeviceCapability', () => {
  it('denies vault write in unkeyed_legacy (not allow-all)', () => {
    const policy = defaultDevicePolicy();
    const result = evaluateDeviceCapability({
      policy,
      isKeyed: false,
      capability: DEVICE_CAPABILITIES.recoveryVaultWrite,
    });
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe('unkeyed_legacy');
    expect(result.reason).toBe('device_required');
  });

  it('denies social.* and high-risk immutables in unkeyed_legacy (not allow-all)', () => {
    const policy = defaultDevicePolicy();
    for (const capability of [
      DEVICE_CAPABILITIES.socialRead,
      DEVICE_CAPABILITIES.socialWrite,
      DEVICE_CAPABILITIES.recoveryVaultWrite,
      DEVICE_CAPABILITIES.identityExport,
    ]) {
      const result = evaluateDeviceCapability({ policy, isKeyed: false, capability });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('device_required');
    }
  });

  it('allows Case A bootstrap drive, profile.write, and messages in unkeyed_legacy', () => {
    const policy = defaultDevicePolicy();
    for (const capability of [
      DEVICE_CAPABILITIES.driveUpload,
      DEVICE_CAPABILITIES.driveRead,
      DEVICE_CAPABILITIES.profileWrite,
      DEVICE_CAPABILITIES.messagesRead,
      DEVICE_CAPABILITIES.messagesSend,
    ]) {
      expect(
        evaluateDeviceCapability({ policy, isKeyed: false, capability }).allowed
      ).toBe(true);
    }
  });

  it('allows recovery initiate in unkeyed_legacy', () => {
    const policy = defaultDevicePolicy();
    const result = evaluateDeviceCapability({
      policy,
      isKeyed: false,
      capability: DEVICE_CAPABILITIES.recoveryInitiate,
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

  it('denies drive.upload on unkeyed restricted even if sneaked into unkeyedAllows', () => {
    const policy = {
      ...defaultDevicePolicy(),
      firstDeviceKeyedAt: new Date().toISOString(),
      unkeyedAllows: [...defaultDevicePolicy().unkeyedAllows, DEVICE_CAPABILITIES.driveUpload],
    };
    const result = evaluateDeviceCapability({
      policy,
      isKeyed: false,
      capability: DEVICE_CAPABILITIES.driveUpload,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('device_required');
  });

  it('denies messages.read on unkeyed restricted by default', () => {
    const policy = { ...defaultDevicePolicy(), firstDeviceKeyedAt: new Date().toISOString() };
    const result = evaluateDeviceCapability({
      policy,
      isKeyed: false,
      capability: DEVICE_CAPABILITIES.messagesRead,
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
      capability: DEVICE_CAPABILITIES.profileWrite,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('capability_not_allowed');
  });

  it('allows profile.write on unkeyed when owner toggled it in policy', () => {
    const policy = {
      ...defaultDevicePolicy(),
      firstDeviceKeyedAt: new Date().toISOString(),
      unkeyedAllows: [...defaultDevicePolicy().unkeyedAllows, DEVICE_CAPABILITIES.profileWrite],
    };
    const result = evaluateDeviceCapability({
      policy,
      isKeyed: false,
      capability: DEVICE_CAPABILITIES.profileWrite,
    });
    expect(result.allowed).toBe(true);
  });

  it('allows drive.upload for keyed session', () => {
    const policy = { ...defaultDevicePolicy(), firstDeviceKeyedAt: new Date().toISOString() };
    const result = evaluateDeviceCapability({
      policy,
      isKeyed: true,
      capability: DEVICE_CAPABILITIES.driveUpload,
    });
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe('keyed');
  });
});
