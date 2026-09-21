/**
 * Overscroll soft-refresh threshold helper.
 */
import { describe, expect, it } from 'vitest';
import { shouldTriggerSoftRefresh } from './useOverscrollRefresh';

describe('shouldTriggerSoftRefresh', () => {
  it('fires at top when pull exceeds threshold', () => {
    expect(shouldTriggerSoftRefresh({ scrollTop: 0, pullDeltaPx: 72 })).toBe(true);
  });

  it('does not fire when scrolled down', () => {
    expect(shouldTriggerSoftRefresh({ scrollTop: 10, pullDeltaPx: 100 })).toBe(false);
  });

  it('does not fire below threshold', () => {
    expect(shouldTriggerSoftRefresh({ scrollTop: 0, pullDeltaPx: 40 })).toBe(false);
  });

  it('does not fire while refresh is in flight', () => {
    expect(
      shouldTriggerSoftRefresh({ scrollTop: 0, pullDeltaPx: 100, inflight: true })
    ).toBe(false);
  });
});
