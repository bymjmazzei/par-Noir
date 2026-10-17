/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquirePenMediaController,
  peekPenMediaController,
  readMasterDurationSec
} from './penMediaController.js';

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

  it('editor transport guard pauses before ended', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const ctrl = acquirePenMediaController('test-guard', 'blob:test', { autoPlay: false });
    const v = ctrl.master;
    expect(v.preload).toBe('metadata');
    Object.defineProperty(v, 'duration', { value: 5, configurable: true, writable: true });
    Object.defineProperty(v, 'paused', { value: false, configurable: true, writable: true });
    v.currentTime = 4.95;
    v.dispatchEvent(new Event('timeupdate'));
    expect(pause).toHaveBeenCalled();
    expect(ctrl.paused).toBe(true);
    ctrl.release();
    releaseKey('test-guard');
  });

  it('readMasterDurationSec returns duration when ready', () => {
    const ctrl = acquirePenMediaController('test-dur', 'blob:test', { autoPlay: false });
    Object.defineProperty(ctrl.master, 'duration', { value: 12.5, configurable: true });
    expect(readMasterDurationSec('test-dur')).toBe(12.5);
    ctrl.release();
    releaseKey('test-dur');
  });
});
