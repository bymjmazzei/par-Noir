/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PenPageLayer } from '@par-noir/pen-protocol';
import { PenLayerFace, type PenLayerFaceProps } from './PenLayerFace.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const box = { x: 0, y: 0, w: 120, h: 40, zIndex: 1 };

const styledDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Vote',
          marks: [
            { type: 'bold' },
            { type: 'textStyle', attrs: { fontFamily: 'Bebas Neue', fontSize: '28px' } }
          ]
        }
      ]
    }
  ]
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

function render(props: PenLayerFaceProps): HTMLElement {
  act(() => {
    root.render(<PenLayerFace {...props} />);
  });
  return host.firstElementChild as HTMLElement;
}

describe('PenLayerFace', () => {
  it('button keeps its rich text font and size', () => {
    const el = render({
      layer: { ...box, id: 'b', kind: 'interactive', behavior: 'page.go', textDoc: styledDoc } as PenPageLayer
    });
    expect(el.tagName).toBe('BUTTON');
    expect(el.getAttribute('data-pen-behavior')).toBe('page.go');
    const rich = el.querySelector('.pen-rich-face') as HTMLElement;
    expect(rich.innerHTML).toContain('<strong>');
    expect(rich.innerHTML).toContain('font-family');
    expect(rich.innerHTML).toContain('Bebas Neue');
    expect(rich.innerHTML).toContain('font-size:28px');
  });

  it('poll button shows the runtime label instead of the authored face', () => {
    const el = render({
      layer: { ...box, id: 'p', kind: 'interactive', behavior: 'poll.vote', textDoc: styledDoc } as PenPageLayer,
      runtimeLabel: '62%'
    });
    expect(el.textContent).toBe('62%');
  });

  it('button appends a live counter after the authored label', () => {
    const el = render({
      layer: { ...box, id: 'c', kind: 'interactive', behavior: 'widget.count', label: 'Likes' } as PenPageLayer,
      labelSuffix: '4'
    });
    expect(el.textContent).toBe('Likes · 4');
  });

  it('text uses the doc default font', () => {
    const el = render({
      layer: { ...box, id: 't', kind: 'text', textDoc: styledDoc } as PenPageLayer,
      fontFamily: 'Inter'
    });
    const rich = el.querySelector('.pen-rich-html') as HTMLElement;
    expect(rich.style.fontFamily).toBe('Inter');
    expect(rich.textContent).toBe('Vote');
  });

  it('text sits at its vertical alignment in the box', () => {
    const at = (textVerticalAlign?: PenPageLayer['textVerticalAlign']) => {
      const el = render({
        layer: { ...box, id: 'va', kind: 'text', textDoc: styledDoc, textVerticalAlign } as PenPageLayer
      });
      const rich = el.querySelector('.pen-rich-html') as HTMLElement;
      return { valign: rich.dataset.penValign, rich, inner: rich.firstElementChild as HTMLElement };
    };
    expect(at().valign).toBe('top');
    expect(at().rich.style.justifyContent).toBe('');
    expect(at('middle').valign).toBe('middle');
    expect(at('middle').rich.style.justifyContent).toBe('center');
    expect(at('bottom').rich.style.justifyContent).toBe('flex-end');
    expect(at('bottom').inner.textContent).toBe('Vote');
  });

  it('time shows the caption', () => {
    const el = render({
      layer: { ...box, id: 'tm', kind: 'text', widgetElement: 'time', timeFace: 'clock', clockTime: '09:30' } as PenPageLayer
    });
    expect(el.getAttribute('data-pen-time')).toBe('1');
    expect(el.textContent).toBe('09:30');
  });

  it('input reports typed values', () => {
    const typed: string[] = [];
    const el = render({
      layer: { ...box, id: 'in', kind: 'text', widgetElement: 'input', label: 'Name' } as PenPageLayer,
      inputValue: 'Ada',
      onInput: (_id, value) => typed.push(value)
    }) as HTMLInputElement;
    expect(el.tagName).toBe('INPUT');
    expect(el.placeholder).toBe('Name');
    expect(el.value).toBe('Ada');
    expect(el.style.backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('score shows its caption', () => {
    const el = render({
      layer: { ...box, id: 's', kind: 'text', widgetElement: 'score' } as PenPageLayer,
      caption: '12'
    });
    expect(el.getAttribute('data-pen-score')).toBe('1');
    expect(el.textContent).toBe('12');
  });

  it('svg draws sanitized markup', () => {
    const el = render({
      layer: {
        ...box,
        id: 'v',
        kind: 'text',
        widgetElement: 'svg',
        svgSrc: '<svg><circle r="4"/><script>alert(1)</script></svg>'
      } as PenPageLayer
    });
    expect(el.querySelector('circle')).not.toBeNull();
    expect(el.querySelector('script')).toBeNull();
  });

  it('Art structured fill paints its color', () => {
    const el = render({
      layer: { ...box, id: 'a', kind: 'text', widgetElement: 'html', backgroundColor: 'rgb(1, 2, 3)' } as PenPageLayer
    });
    expect(el.getAttribute('data-widget-art-fill')).toBe('1');
    expect(el.style.background || el.style.backgroundColor).toContain('rgb(1, 2, 3)');
  });

  it('Art snippet renders in a sandboxed frame', () => {
    const el = render({
      layer: { ...box, id: 'h', kind: 'text', widgetElement: 'html', htmlSource: '<b>hi</b>' } as PenPageLayer
    }) as HTMLIFrameElement;
    expect(el.tagName).toBe('IFRAME');
    expect(el.getAttribute('sandbox')).toBe('');
    expect(el.getAttribute('data-pen-html-snippet')).toBe('1');
  });

  it('image layer draws the resolved address', () => {
    const el = render({
      layer: { ...box, id: 'i', kind: 'image', imageSrc: 'penmedia:abc' } as PenPageLayer,
      mediaSrc: 'blob:public-poster'
    });
    expect(el.querySelector('img')?.getAttribute('src')).toBe('blob:public-poster');
  });

  it('video layer plays the resolved address', () => {
    const el = render({
      layer: { ...box, id: 'vd', kind: 'video', backgroundVideo: 'penmedia:clip' } as PenPageLayer,
      mediaSrc: 'blob:public-sd'
    });
    expect(el.querySelector('video')).not.toBeNull();
  });
});
