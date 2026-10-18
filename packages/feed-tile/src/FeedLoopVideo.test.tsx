/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedLoopVideo } from './FeedLoopVideo.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Props = Partial<Parameters<typeof FeedLoopVideo>[0]>;

let host: HTMLDivElement;
let root: Root;
let playing: Set<HTMLMediaElement>;

function render(props: Props = {}) {
  act(() => {
    root.render(
      <FeedLoopVideo src="blob:clip" active paused={false} muted {...props} />
    );
  });
  const [a, b] = Array.from(host.querySelectorAll('video'));
  return { a: a!, b: b!, rerender: (next: Props) => render({ ...props, ...next }) };
}

function setReady(video: HTMLVideoElement, readyState: number) {
  Object.defineProperty(video, 'readyState', { value: readyState, configurable: true });
}

describe('FeedLoopVideo', () => {
  beforeEach(() => {
    playing = new Set();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      playing.add(this);
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      playing.delete(this);
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('never uses native loop', () => {
    const { a, b } = render();
    expect(a.loop).toBe(false);
    expect(b.loop).toBe(false);
  });

  it('plays the front decoder only while active and not paused', () => {
    const view = render({ active: false });
    expect(playing.size).toBe(0);
    view.rerender({ active: true });
    expect(playing.has(view.a)).toBe(true);
    expect(playing.has(view.b)).toBe(false);
    view.rerender({ paused: true });
    expect(playing.size).toBe(0);
  });

  it('hands off to the back decoder at the end, then rewinds the old front', () => {
    const onLoop = vi.fn();
    const { a, b } = render({ onLoop, muted: false });
    setReady(b, 4);
    a.currentTime = 3;
    act(() => {
      a.dispatchEvent(new Event('ended'));
    });
    expect(onLoop).toHaveBeenCalledTimes(1);
    expect(playing.has(b)).toBe(true);
    expect(a.style.zIndex).toBe('2');

    act(() => {
      b.dispatchEvent(new Event('playing'));
    });
    expect(b.style.zIndex).toBe('2');
    expect(a.style.zIndex).toBe('1');
    expect(playing.has(a)).toBe(false);
    expect(a.currentTime).toBe(0);
    expect(b.muted).toBe(false);
    expect(a.muted).toBe(true);
  });

  it('keeps only the visible decoder audible', () => {
    const view = render({ muted: true });
    view.rerender({ muted: false });
    expect(view.a.muted).toBe(false);
    expect(view.b.muted).toBe(true);
  });

  it('restarts in place when the back decoder is not ready', () => {
    const { a, b } = render();
    setReady(b, 0);
    a.currentTime = 3;
    playing.clear();
    act(() => {
      a.dispatchEvent(new Event('ended'));
    });
    expect(a.currentTime).toBe(0);
    expect(playing.has(a)).toBe(true);
    expect(playing.has(b)).toBe(false);
  });
});
