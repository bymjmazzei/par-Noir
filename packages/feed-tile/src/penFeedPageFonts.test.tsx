/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { PenFeedPagePayload, PenPageLayer } from '@par-noir/pen-protocol';
import { PenFeedPageStage } from './PenFeedPageStage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const button: PenPageLayer = {
  id: 'b',
  kind: 'interactive',
  behavior: 'page.go',
  x: 0,
  y: 0,
  w: 120,
  h: 40,
  zIndex: 1,
  textDoc: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Go', marks: [{ type: 'textStyle', attrs: { fontFamily: 'Bebas Neue' } }] }
        ]
      }
    ]
  }
};

describe('PenFeedPageStage fonts', () => {
  it('requests the Google fonts used by layers and the doc default', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const page: PenFeedPagePayload = {
      slug: 'p',
      canvas: { w: 360, h: 640 },
      fontFamily: 'Roboto',
      actionSection: { layers: [button] }
    };
    act(() => {
      root.render(<PenFeedPageStage penFeedPage={page} externalClockSec={0} />);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const links = [...document.head.querySelectorAll<HTMLLinkElement>('link[data-pen-google-fonts]')];
    const families = links.flatMap((l) => (l.dataset.penGoogleFonts || '').split(','));
    expect(families).toEqual(expect.arrayContaining(['Bebas Neue', 'Roboto']));
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });
});
