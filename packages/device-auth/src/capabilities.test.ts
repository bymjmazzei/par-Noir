import { describe, expect, it } from 'vitest';
import {
  CONFIGURABLE_CAPABILITIES,
  CONFIGURABLE_CAPABILITY_LABELS,
  DEFAULT_UNKEYED_ALLOWS,
  DEVICE_CAPABILITIES,
  IMMUTABLE_UNKEYED_DENY,
  LEGACY_BOOTSTRAP_ALLOWS,
} from './capabilities';
import { defaultDevicePolicy, evaluateDeviceCapability, normalizeDevicePolicy } from './evaluate';

const ALL_CAPABILITIES = Object.values(DEVICE_CAPABILITIES);

describe('device capability catalog', () => {
  it('has unique capability identifiers', () => {
    expect(new Set(ALL_CAPABILITIES).size).toBe(ALL_CAPABILITIES.length);
  });

  it('names every capability as a dotted lowercase id', () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(capability).toMatch(/^[a-z]+(\.[a-z]+)+$/);
    }
  });

  it('never offers an immutable-deny capability as a configurable toggle', () => {
    for (const capability of CONFIGURABLE_CAPABILITIES) {
      expect(IMMUTABLE_UNKEYED_DENY.has(capability)).toBe(false);
    }
  });

  it('never allows an immutable-deny capability by default', () => {
    for (const capability of DEFAULT_UNKEYED_ALLOWS) {
      expect(IMMUTABLE_UNKEYED_DENY.has(capability)).toBe(false);
    }
  });

  it('defaults exclude mailbox drain and drive.upload', () => {
    expect(DEFAULT_UNKEYED_ALLOWS).not.toContain(DEVICE_CAPABILITIES.driveUpload);
    expect(DEFAULT_UNKEYED_ALLOWS).not.toContain(DEVICE_CAPABILITIES.messagesRead);
    expect(DEFAULT_UNKEYED_ALLOWS).not.toContain(DEVICE_CAPABILITIES.messagesSend);
    expect(DEFAULT_UNKEYED_ALLOWS).not.toContain(DEVICE_CAPABILITIES.socialRead);
    expect(DEFAULT_UNKEYED_ALLOWS).not.toContain(DEVICE_CAPABILITIES.socialWrite);
  });

  it('legacy bootstrap includes Case A first-party caps without social.*', () => {
    expect(LEGACY_BOOTSTRAP_ALLOWS).toContain(DEVICE_CAPABILITIES.driveUpload);
    expect(LEGACY_BOOTSTRAP_ALLOWS).toContain(DEVICE_CAPABILITIES.driveRead);
    expect(LEGACY_BOOTSTRAP_ALLOWS).toContain(DEVICE_CAPABILITIES.profileWrite);
    expect(LEGACY_BOOTSTRAP_ALLOWS).toContain(DEVICE_CAPABILITIES.messagesRead);
    expect(LEGACY_BOOTSTRAP_ALLOWS).toContain(DEVICE_CAPABILITIES.messagesSend);
    expect(LEGACY_BOOTSTRAP_ALLOWS).not.toContain(DEVICE_CAPABILITIES.socialRead);
    expect(LEGACY_BOOTSTRAP_ALLOWS).not.toContain(DEVICE_CAPABILITIES.socialWrite);
  });

  it('draws every known list entry from the capability catalog', () => {
    for (const capability of [
      ...IMMUTABLE_UNKEYED_DENY,
      ...DEFAULT_UNKEYED_ALLOWS,
      ...LEGACY_BOOTSTRAP_ALLOWS,
      ...CONFIGURABLE_CAPABILITIES,
    ]) {
      expect(ALL_CAPABILITIES).toContain(capability);
    }
  });

  it('labels every configurable capability', () => {
    for (const capability of CONFIGURABLE_CAPABILITIES) {
      expect(CONFIGURABLE_CAPABILITY_LABELS[capability].trim().length).toBeGreaterThan(0);
    }
  });

  it('denies every immutable capability on a restricted unkeyed device', () => {
    const policy = { ...defaultDevicePolicy(), firstDeviceKeyedAt: new Date().toISOString() };
    for (const capability of IMMUTABLE_UNKEYED_DENY) {
      const result = evaluateDeviceCapability({ policy, isKeyed: false, capability });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('device_required');
    }
  });
});

describe('normalizeDevicePolicy', () => {
  it('falls back to the default policy for non-object input', () => {
    expect(normalizeDevicePolicy(null)).toEqual(defaultDevicePolicy());
    expect(normalizeDevicePolicy('policy')).toEqual(defaultDevicePolicy());
  });

  it('drops non-string entries from unkeyedAllows', () => {
    const policy = normalizeDevicePolicy({
      version: 1,
      unkeyedAllows: [DEVICE_CAPABILITIES.profileRead, 42, null, DEVICE_CAPABILITIES.driveRead],
    });
    expect(policy.unkeyedAllows).toEqual([
      DEVICE_CAPABILITIES.profileRead,
      DEVICE_CAPABILITIES.driveRead,
    ]);
  });

  it('strips immutable caps from unkeyedAllows', () => {
    const policy = normalizeDevicePolicy({
      unkeyedAllows: [
        DEVICE_CAPABILITIES.profileRead,
        DEVICE_CAPABILITIES.messagesRead,
        DEVICE_CAPABILITIES.driveUpload,
        DEVICE_CAPABILITIES.profileWrite,
      ],
    });
    expect(policy.unkeyedAllows).toEqual([
      DEVICE_CAPABILITIES.profileRead,
      DEVICE_CAPABILITIES.profileWrite,
    ]);
  });

  it('treats an explicitly empty allow list as empty, not as the default set', () => {
    expect(normalizeDevicePolicy({ unkeyedAllows: [] }).unkeyedAllows).toEqual([]);
  });

  it('keeps firstDeviceKeyedAt only when it is a string', () => {
    expect(normalizeDevicePolicy({ firstDeviceKeyedAt: 12345 }).firstDeviceKeyedAt).toBeUndefined();
    expect(normalizeDevicePolicy({ firstDeviceKeyedAt: '2026-01-01T00:00:00.000Z' }).firstDeviceKeyedAt).toBe(
      '2026-01-01T00:00:00.000Z'
    );
  });

  it('a normalized policy without a keyed device does not permit identity.export', () => {
    const policy = normalizeDevicePolicy({ unkeyedAllows: [] });
    const result = evaluateDeviceCapability({
      policy,
      isKeyed: false,
      capability: DEVICE_CAPABILITIES.identityExport,
    });
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe('unkeyed_legacy');
    expect(result.reason).toBe('device_required');
  });
});
