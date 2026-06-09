import { describe, expect, it } from 'vitest';
import {
  deriveDeviceBindingFactor,
  isDeviceBoundPnEnvelope,
  DEVICE_BOUND_HKDF_SALT,
} from './deviceBinding';
import { generateDeviceKeypair, exportDevicePrivateKey } from './crypto';

describe('deriveDeviceBindingFactor', () => {
  it('is deterministic for the same key and deviceId', async () => {
    const kp = await generateDeviceKeypair();
    const pkcs8 = await exportDevicePrivateKey(kp.privateKey);
    const a = await deriveDeviceBindingFactor(pkcs8, kp.deviceId);
    const b = await deriveDeviceBindingFactor(pkcs8, kp.deviceId);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('differs when deviceId changes', async () => {
    const kp = await generateDeviceKeypair();
    const pkcs8 = await exportDevicePrivateKey(kp.privateKey);
    const a = await deriveDeviceBindingFactor(pkcs8, kp.deviceId);
    const b = await deriveDeviceBindingFactor(pkcs8, 'other-device-id');
    expect(a).not.toBe(b);
  });

  it('differs when private key changes (simulates copy to another profile)', async () => {
    const kp1 = await generateDeviceKeypair();
    const kp2 = await generateDeviceKeypair();
    const pkcs8_1 = await exportDevicePrivateKey(kp1.privateKey);
    const pkcs8_2 = await exportDevicePrivateKey(kp2.privateKey);
    const onCreatorDevice = await deriveDeviceBindingFactor(pkcs8_1, kp1.deviceId);
    const onOtherProfile = await deriveDeviceBindingFactor(pkcs8_2, kp1.deviceId);
    expect(onCreatorDevice).not.toBe(onOtherProfile);
  });

  it('uses expected HKDF salt constant', () => {
    expect(DEVICE_BOUND_HKDF_SALT).toBe('pn-device-bound-v1');
  });
});

describe('isDeviceBoundPnEnvelope', () => {
  it('detects device binding envelope', () => {
    expect(
      isDeviceBoundPnEnvelope({
        binding: { type: 'device', deviceId: 'd1', devicePublicKey: 'pk' },
        identities: [{}],
      })
    ).toBe(true);
  });

  it('rejects portable backup', () => {
    expect(isDeviceBoundPnEnvelope({ identities: [{}] })).toBe(false);
    expect(isDeviceBoundPnEnvelope({ binding: { type: 'nfc', uid: 'x' }, identities: [] })).toBe(false);
  });
});
