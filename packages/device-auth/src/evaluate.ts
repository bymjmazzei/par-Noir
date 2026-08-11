import {
  DEFAULT_UNKEYED_ALLOWS,
  IMMUTABLE_UNKEYED_DENY,
  LEGACY_BOOTSTRAP_ALLOWS,
  isAllowedInUnkeyedPolicyList,
} from './capabilities';
import type { DeviceAccessMode, DeviceCapabilityResult, DevicePolicy } from './types';

export function defaultDevicePolicy(): DevicePolicy {
  return {
    version: 1,
    unkeyedAllows: [...DEFAULT_UNKEYED_ALLOWS],
  };
}

export function getDeviceAccessMode(policy: DevicePolicy, isKeyed: boolean): DeviceAccessMode {
  if (!policy.firstDeviceKeyedAt) return 'unkeyed_legacy';
  if (isKeyed) return 'keyed';
  return 'unkeyed_restricted';
}

export function evaluateDeviceCapability(params: {
  policy: DevicePolicy;
  isKeyed: boolean;
  capability: string;
}): DeviceCapabilityResult {
  const mode = getDeviceAccessMode(params.policy, params.isKeyed);

  if (mode === 'keyed') {
    return { allowed: true, mode };
  }

  // Case A: explicit bootstrap list only (not allow-all). drive.upload may be
  // listed in IMMUTABLE for restricted mode but is allowed here for first seal.
  if (mode === 'unkeyed_legacy') {
    if (LEGACY_BOOTSTRAP_ALLOWS.includes(params.capability)) {
      return { allowed: true, mode };
    }
    if (IMMUTABLE_UNKEYED_DENY.has(params.capability)) {
      return { allowed: false, mode, reason: 'device_required' };
    }
    return { allowed: false, mode, reason: 'capability_not_allowed' };
  }

  // unkeyed_restricted
  if (IMMUTABLE_UNKEYED_DENY.has(params.capability)) {
    return { allowed: false, mode, reason: 'device_required' };
  }

  if (params.policy.unkeyedAllows.includes(params.capability)) {
    return { allowed: true, mode };
  }

  return { allowed: false, mode, reason: 'capability_not_allowed' };
}

export function normalizeDevicePolicy(raw: unknown): DevicePolicy {
  if (!raw || typeof raw !== 'object') return defaultDevicePolicy();
  const o = raw as Record<string, unknown>;
  const rawAllows = Array.isArray(o.unkeyedAllows)
    ? o.unkeyedAllows.filter((x): x is string => typeof x === 'string')
    : [...DEFAULT_UNKEYED_ALLOWS];
  // Drop immutable / non-configurable entries so stored policy cannot re-open blast radius.
  // Recovery always-on caps are not configurable toggles but are part of DEFAULT — keep those.
  const allows = rawAllows.filter((cap) => {
    if (IMMUTABLE_UNKEYED_DENY.has(cap)) return false;
    if (DEFAULT_UNKEYED_ALLOWS.includes(cap)) return true;
    return isAllowedInUnkeyedPolicyList(cap);
  });
  return {
    version: typeof o.version === 'number' ? o.version : 1,
    unkeyedAllows: allows,
    firstDeviceKeyedAt:
      typeof o.firstDeviceKeyedAt === 'string' ? o.firstDeviceKeyedAt : undefined,
  };
}
