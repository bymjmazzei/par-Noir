import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startFramePump } from './framePump.js';

function fakeVideo() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    paused: false,
    pending,
    requestVideoFrameCallback: vi.fn((cb: () => void) => {
      const id = next++;
      pending.set(id, cb);
      return id;
    }),
    cancelVideoFrameCallback: vi.fn((id: number) => {
      pending.delete(id);
    }),
    /** Deliver one decoded frame to every pending callback. */
    frame() {
      const cbs = [...pending.values()];
      pending.clear();
      for (const cb of cbs) cb();
    }
  };
}

describe('startFramePump', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps one paint chain no matter how often it is kicked', () => {
    const video = fakeVideo();
    const paint = vi.fn(() => true);
    const pump = startFramePump(video, paint);
    for (let i = 0; i < 20; i++) pump.kick();
    expect(video.pending.size).toBe(1);
    paint.mockClear();
    video.frame();
    expect(paint).toHaveBeenCalledTimes(1);
    expect(video.pending.size).toBe(1);
    pump.stop();
    expect(video.pending.size).toBe(0);
  });

  it('stops repainting once paused and a frame is drawn', () => {
    const video = fakeVideo();
    video.paused = true;
    const paint = vi.fn(() => true);
    startFramePump(video, paint).kick();
    expect(paint).toHaveBeenCalledTimes(1);
    expect(video.pending.size).toBe(0);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
