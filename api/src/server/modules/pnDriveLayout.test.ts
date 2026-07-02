/**
 * @jest-environment node
 */
import { findFolderByNameUnderParent } from './pnDriveLayout';

describe('pnDriveLayout', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('throws on 503 folder search instead of returning null', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => {
      return new Response('unavailable', { status: 503 });
    }) as typeof fetch;

    const promise = findFolderByNameUnderParent('token', 'media', 'parent-id');
    const rejection = expect(promise).rejects.toThrow(/503/);
    await jest.runAllTimersAsync();
    await rejection;
  });
});
