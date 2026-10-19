/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedTileSurface, type FeedTileViewModel } from './FeedTileSurface.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const model = (axis: 'x' | 'y'): FeedTileViewModel =>
  ({
    title: 'Drop',
    pageSwipeAxis: axis,
    pages: [
      { slug: 'cover', title: 'Cover' },
      { slug: 'menu', title: 'Menu' },
      { slug: 'offer', title: 'Offer' }
    ]
  }) as FeedTileViewModel;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

function swipeTo(axis: 'x' | 'y', offset: number) {
  const carousel = host.querySelector('[data-page-swipe-axis]') as HTMLElement;
  Object.defineProperty(carousel, axis === 'y' ? 'clientHeight' : 'clientWidth', { value: 300, configurable: true });
  if (axis === 'y') carousel.scrollTop = offset;
  else carousel.scrollLeft = offset;
  act(() => {
    carousel.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(200);
  });
}

describe('FeedTileSurface onPageChange', () => {
  for (const axis of ['x', 'y'] as const) {
    it(`reports the settled page on mount and after each ${axis} swipe`, () => {
      const onPageChange = vi.fn();
      act(() => {
        root.render(<FeedTileSurface model={model(axis)} mode="live" onPageChange={onPageChange} />);
      });
      expect(onPageChange).toHaveBeenLastCalledWith(0, 'cover');
      swipeTo(axis, 600);
      expect(onPageChange).toHaveBeenLastCalledWith(2, 'offer');
      swipeTo(axis, 590);
      expect(onPageChange).toHaveBeenCalledTimes(2);
      swipeTo(axis, 300);
      expect(onPageChange).toHaveBeenLastCalledWith(1, 'menu');
    });
  }
});
