/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as feedTile from '@par-noir/feed-tile';
import { probeVideoFileDurationSec } from './probeVideoDuration';
import { layerMediaSyncKey, waitForVideoLayerDurationSec } from './videoLayerDuration';

vi.mock('./probeVideoDuration', () => ({
  probeVideoFileDurationSec: vi.fn()
}));

describe('waitForVideoLayerDurationSec', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  afterEach(() => {
    const ctrl = feedTile.peekPenMediaController(layerMediaSyncKey('clip'));
    if (ctrl) ctrl.release();
    vi.restoreAllMocks();
  });

  it('returns master duration without calling probe', async () => {
    const probe = vi.mocked(probeVideoFileDurationSec);
    const ctrl = feedTile.acquirePenMediaController(layerMediaSyncKey('clip'), 'blob:x', {
      autoPlay: false
    });
    Object.defineProperty(ctrl.master, 'duration', { value: 7, configurable: true });
    const sec = await waitForVideoLayerDurationSec('clip', 'blob:x', { timeoutMs: 500 });
    expect(sec).toBe(7);
    expect(probe).not.toHaveBeenCalled();
    ctrl.release();
  });
});
