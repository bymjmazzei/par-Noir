/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PenFeedPagePayload, PenPageLayer } from '@par-noir/pen-protocol';
import { PenFeedPageStage } from './PenFeedPageStage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function page(layers: PenPageLayer[]): PenFeedPagePayload {
  return {
    canvas: { w: 100, h: 100 },
    actionSection: { slug: 'p', doc: { type: 'doc', content: [] }, layers }
  } as unknown as PenFeedPagePayload;
}

const openButton: PenPageLayer = {
  id: 'b',
  kind: 'interactive',
  behavior: 'cta.open',
  openUrl: 'https://example.com/setup.exe',
  label: 'Go',
  x: 0,
  y: 0,
  w: 40,
  h: 20,
  zIndex: 2
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

function render(props: Partial<Parameters<typeof PenFeedPageStage>[0]>) {
  act(() => {
    root.render(<PenFeedPageStage penFeedPage={page([openButton])} externalClockSec={0} {...props} />);
  });
}

function click(el: Element | null) {
  act(() => {
    (el as HTMLElement).click();
  });
}

function buttonByText(text: string) {
  return Array.from(host.querySelectorAll('button')).find((b) => b.textContent === text) || null;
}

describe('LeaveSheet on PenFeedPageStage', () => {
  it('holds an open press until Continue', () => {
    const onEffect = vi.fn();
    render({ onEffect });
    click(host.querySelector('[data-pen-layer="b"]'));
    expect(onEffect).not.toHaveBeenCalled();
    expect(host.querySelector('[data-pen-leave-host]')?.textContent).toBe('example.com');
    expect(host.querySelector('[data-pen-leave-warning="download"]')).not.toBeNull();
    click(buttonByText('Continue'));
    expect(onEffect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'open', url: 'https://example.com/setup.exe' })
    );
    expect(host.querySelector('[data-pen-leave-sheet]')).toBeNull();
  });

  it('Cancel drops the press', () => {
    const onEffect = vi.fn();
    render({ onEffect });
    click(host.querySelector('[data-pen-layer="b"]'));
    click(buttonByText('Cancel'));
    expect(onEffect).not.toHaveBeenCalled();
    expect(host.querySelector('[data-pen-leave-sheet]')).toBeNull();
  });

  it('Report link only shows when the host can report', () => {
    render({ onEffect: vi.fn() });
    click(host.querySelector('[data-pen-layer="b"]'));
    expect(buttonByText('Report link')).toBeNull();
    click(buttonByText('Cancel'));

    const onReportLink = vi.fn();
    render({ onEffect: vi.fn(), onReportLink });
    click(host.querySelector('[data-pen-layer="b"]'));
    click(buttonByText('Report link'));
    expect(onReportLink).toHaveBeenCalledWith('https://example.com/setup.exe');
  });
});
