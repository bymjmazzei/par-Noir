import { describe, expect, it } from 'vitest';
import {
  sealDevicePrivateDisplay,
  unsealDevicePrivateDisplay,
} from './devicePrivateDisplay';

describe('devicePrivateDisplay', () => {
  it('round-trips label, deviceType, and lastSeenAt', async () => {
    const display = {
      label: 'MacBook',
      deviceType: 'desktop' as const,
      lastSeenAt: '2026-08-03T12:00:00.000Z',
    };
    const blob = await sealDevicePrivateDisplay(display, 'test-pn-name', 'test-passcode');
    expect(blob.includes('MacBook')).toBe(false);
    const opened = await unsealDevicePrivateDisplay(blob, 'test-pn-name', 'test-passcode');
    expect(opened).toEqual(display);
  });

  it('fails with wrong passcode', async () => {
    const blob = await sealDevicePrivateDisplay(
      { label: 'Phone', deviceType: 'mobile', lastSeenAt: '' },
      'name',
      'right'
    );
    await expect(unsealDevicePrivateDisplay(blob, 'name', 'wrong')).rejects.toThrow();
  });
});
