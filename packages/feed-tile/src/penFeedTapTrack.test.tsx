/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PenFeedPagePayload, PenPageLayer, WidgetViewPayload } from '@par-noir/pen-protocol';
import { PenFeedPageStage } from './PenFeedPageStage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const group: PenPageLayer = { id: 'g', kind: 'group', x: 0, y: 0, w: 100, h: 100, zIndex: 1 };
const vote: PenPageLayer = {
  id: 'v',
  kind: 'interactive',
  behavior: 'poll.vote',
  label: 'Yes',
  parentGroupId: 'g',
  x: 0,
  y: 0,
  w: 40,
  h: 20,
  zIndex: 2
};
const jump: PenPageLayer = {
  id: 'j',
  kind: 'interactive',
  behavior: 'page.go',
  goTo: 'slug:menu',
  label: 'Menu',
  parentGroupId: 'g',
  x: 0,
  y: 40,
  w: 40,
  h: 20,
  zIndex: 2
};

const page = {
  canvas: { w: 100, h: 100 },
  actionSection: { slug: 'p', doc: { type: 'doc', content: [] }, layers: [group, vote, jump] }
} as unknown as PenFeedPagePayload;

const locked: Record<string, WidgetViewPayload> = {
  'doc-1:g': { widgetId: 'doc-1:g', phase: 'locked', revealPolicy: 'after_response', closesAt: null }
};

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

function press(id: string) {
  act(() => {
    (host.querySelector(`[data-pen-layer="${id}"]`) as HTMLElement).click();
  });
}

describe('tap tracking on PenFeedPageStage', () => {
  it('a locked viewer still jumps pages and logs the tap; the vote waits for unlock', () => {
    const onTrack = vi.fn();
    const onEffect = vi.fn();
    const onPressBlocked = vi.fn();
    act(() => {
      root.render(
        <PenFeedPageStage
          penFeedPage={page}
          docId="doc-1"
          widgetViews={locked}
          externalClockSec={0}
          onTrack={onTrack}
          onEffect={onEffect}
          onPressBlocked={onPressBlocked}
        />
      );
    });
    press('j');
    expect(onPressBlocked).not.toHaveBeenCalled();
    expect(onEffect).toHaveBeenCalledWith({ kind: 'navigate', goTo: 'slug:menu' });
    expect(onTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        widgetId: 'doc-1:taps',
        row: expect.objectContaining({ trigger: 'widget.tap', cells: ['Menu', 'go to page', 'menu'] })
      })
    );
    press('v');
    expect(onPressBlocked).toHaveBeenCalledTimes(1);
    expect(onTrack).toHaveBeenCalledTimes(1);
  });
});
