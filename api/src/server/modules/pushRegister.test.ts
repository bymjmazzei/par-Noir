/**
 * @jest-environment node
 */
import { PushService } from './pushService';

describe('push register', () => {
  it('does not store a device token', async () => {
    await expect(PushService.registerToken('pn-viewer', 'token', 'ios')).resolves.toBeUndefined();
    await expect(
      PushService.send('pn-viewer', { title: 'New message', body: 'You have a new message' })
    ).resolves.toBeUndefined();
  });
});
