/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquirePenMediaController, peekPenMediaController } from './penMediaController.js';

function releaseKey(key: string) {
  const ctrl = peekPenMediaController(key);
  if (ctrl) ctrl.release();
}

describe('PenMediaController transport', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  afterEach(() => {
    releaseKey('test-replay');
    vi.restoreAllMocks();
  });

  it('playAtTime seeks to 0 and plays when ended', async () => {
    const ctrl = acquirePenMediaController('test-replay', 'blob:test', { autoPlay: false });
    const v = ctrl.master;
    Object.defineProperty(v, 'duration', { value: 5, configurable: true });
    v.currentTime = 5;
    Object.defineProperty(v, 'ended', { value: true, configurable: true });
    const play = vi.spyOn(v, 'play').mockResolvedValue(undefined);
    await ctrl.playAtTime(0);
    expect(v.currentTime).toBe(0);
    expect(play).toHaveBeenCalled();
    expect(v.loop).toBe(false);
    ctrl.release();
  });

  it('editor masters do not loop by default', () => {
    const ctrl = acquirePenMediaController('test-replay', 'blob:test', { autoPlay: false });
    expect(ctrl.master.loop).toBe(false);
    ctrl.release();
  });
});
