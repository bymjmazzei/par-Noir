/**
 * @jest-environment jsdom
 */
import {
  isActiveDriveSetupProgress,
  isDriveLayoutBusy,
  waitForDriveLayoutIdle,
} from '../components/storage/hooks/driveLayoutBusy';

describe('driveLayoutBusy', () => {
  it('treats complete/failed progress as not busy', () => {
    expect(isActiveDriveSetupProgress({ phase: 'starting', stepLabel: 'x', percent: 0 })).toBe(
      true
    );
    expect(isActiveDriveSetupProgress({ phase: 'complete', stepLabel: 'x', percent: 100 })).toBe(
      false
    );
    expect(isActiveDriveSetupProgress({ phase: 'failed', stepLabel: 'x', percent: 0 })).toBe(
      false
    );
    expect(isActiveDriveSetupProgress(null)).toBe(false);
  });

  it('is busy when init is in flight even if progress is null', () => {
    expect(isDriveLayoutBusy(new Set(['pn-abc']), null)).toBe(true);
    expect(isDriveLayoutBusy(new Set(), null)).toBe(false);
  });

  it('polls until idle instead of a single defer', async () => {
    jest.useFakeTimers();
    let busy = true;
    const waitPromise = waitForDriveLayoutIdle(() => busy, {
      intervalMs: 100,
      maxWaitMs: 5_000,
    });
    await jest.advanceTimersByTimeAsync(250);
    busy = false;
    await jest.advanceTimersByTimeAsync(100);
    await expect(waitPromise).resolves.toBe('ready');
    jest.useRealTimers();
  });

  it('returns timeout when still busy past maxWait', async () => {
    jest.useFakeTimers();
    const waitPromise = waitForDriveLayoutIdle(() => true, {
      intervalMs: 100,
      maxWaitMs: 500,
    });
    await jest.advanceTimersByTimeAsync(600);
    await expect(waitPromise).resolves.toBe('timeout');
    jest.useRealTimers();
  });
});
