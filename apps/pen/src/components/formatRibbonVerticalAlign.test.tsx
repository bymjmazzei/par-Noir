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

function openMenu(title: string): HTMLButtonElement[] {
  const trigger = host.querySelector(`button[title="${title}"]`) as HTMLButtonElement;
  expect(trigger).toBeTruthy();
  act(() => trigger.click());
  return [...document.body.querySelectorAll<HTMLButtonElement>('.pen-ribbon-menu-item')];
}

function item(items: HTMLButtonElement[], text: string): HTMLButtonElement {
  const found = items.find((el) => el.textContent?.trim() === text);
  expect(found).toBeTruthy();
  return found!;
}

describe('FormatRibbon alignment menus', () => {
  it('horizontal align is one dropdown with left, center, right and justify', () => {
    act(() => {
      root.render(<FormatRibbon editor={editor as never} />);
    });
    expect(host.querySelector('button[title="Align left"]')).toBeNull();
    const items = openMenu('Horizontal align');
    expect(items.map((el) => el.textContent?.trim())).toEqual(['Left', 'Center', 'Right', 'Justify']);
    act(() => item(items, 'Center').click());
    expect(editor.isActive({ textAlign: 'center' })).toBe(true);
  });

  it('vertical align is one dropdown with top, middle and bottom', () => {
    const picked: PenTextVerticalAlign[] = [];
    act(() => {
      root.render(
        <FormatRibbon editor={editor as never} verticalAlign="middle" onVerticalAlign={(v) => picked.push(v)} />
      );
    });
    const items = openMenu('Vertical align');
    expect(items.map((el) => el.textContent?.trim())).toEqual(['Top', 'Middle', 'Bottom']);
    expect(item(items, 'Middle').className).toContain('is-active');
    act(() => item(items, 'Bottom').click());
    expect(picked).toEqual(['bottom']);
  });

  it('hides vertical align where nothing can be aligned', () => {
    act(() => {
      root.render(<FormatRibbon editor={editor as never} />);
    });
    expect(host.querySelector('button[title="Vertical align"]')).toBeNull();
  });
});
