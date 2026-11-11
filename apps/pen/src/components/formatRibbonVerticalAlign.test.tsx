/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PenTextVerticalAlign } from '@par-noir/pen-protocol';
import { penEditorExtensions } from '../services/penEditorExtensions';
import { FormatRibbon } from './PageCanvas';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let editor: Editor;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  editor = new Editor({ extensions: penEditorExtensions({ pnIdentifier: '', sectionTitle: 'Text' }) });
});

afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  host.remove();
});

describe('FormatRibbon vertical alignment', () => {
  it('shows top, middle and bottom for a text layer and reports the choice', () => {
    const picked: PenTextVerticalAlign[] = [];
    act(() => {
      root.render(
        <FormatRibbon editor={editor as never} verticalAlign="middle" onVerticalAlign={(v) => picked.push(v)} />
      );
    });
    const top = host.querySelector('button[title="Align top"]') as HTMLButtonElement;
    const middle = host.querySelector('button[title="Align middle"]') as HTMLButtonElement;
    const bottom = host.querySelector('button[title="Align bottom"]') as HTMLButtonElement;
    expect(top && middle && bottom).toBeTruthy();
    expect(middle.getAttribute('aria-pressed')).toBe('true');
    act(() => bottom.click());
    expect(picked).toEqual(['bottom']);
  });

  it('hides them where there is no text box to align', () => {
    act(() => {
      root.render(<FormatRibbon editor={editor as never} />);
    });
    expect(host.querySelector('button[title="Align top"]')).toBeNull();
  });
});
