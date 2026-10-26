/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PenFeedPagePayload, PenPageLayer } from '@par-noir/pen-protocol';
import { PenFeedPageStage } from './PenFeedPageStage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const button: PenPageLayer = {
  id: 'b',
  kind: 'interactive',
  behavior: 'page.go',
  goTo: 'next',
  label: 'Go',
  x: 50,
  y: 360,
  w: 180,
  h: 60,
  zIndex: 1
};

function pageWith(contentInsetPx?: number): PenFeedPagePayload {
  return {
    slug: 'p',
    canvas: { w: 360, h: 640 },
    ...(contentInsetPx != null ? { contentInsetPx } : {}),
    actionSection: { layers: [button] }
  };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function rectOf(page: PenFeedPagePayload) {
  act(() => {
    root.render(<PenFeedPageStage penFeedPage={page} externalClockSec={0} />);
  });
  const el = host.querySelector('[data-pen-layer="b"]') as HTMLElement;
  return { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height };
}

describe('PenFeedPageStage content inset', () => {
  it('places layers inside the body padding, matching the editor page', () => {
    expect(rectOf(pageWith(40))).toEqual({
      left: `${(90 / 360) * 100}%`,
      top: `${(400 / 640) * 100}%`,
      width: '50%',
      height: `${(60 / 640) * 100}%`
    });
  });

  it('keeps posts published without an inset at the page edge', () => {
    const rect = rectOf(pageWith());
    expect(rect.left).toBe(`${(50 / 360) * 100}%`);
    expect(rect.top).toBe(`${(360 / 640) * 100}%`);
  });
});
