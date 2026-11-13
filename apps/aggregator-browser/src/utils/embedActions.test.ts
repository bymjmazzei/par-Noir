import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PenActionEffect } from '@par-noir/pen-protocol';
import { embedEffectNeedsSignIn, openPostInNewTab } from './embedActions';

const vote: PenActionEffect = { kind: 'vote', layerId: 'l', optionId: 'yes', widgetId: 'w' };
const row: PenActionEffect = { kind: 'widget_row', widgetId: 'w', row: {} as never };
const open: PenActionEffect = { kind: 'open', url: 'https://shop.example', host: 'shop.example', warnings: [] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('embedded post actions', () => {
  it('a vote or widget row without a signed-in viewer goes to the post on par Noir', () => {
    expect(embedEffectNeedsSignIn(vote, false)).toBe(true);
    expect(embedEffectNeedsSignIn(row, false)).toBe(true);
  });

  it('a signed-in viewer votes in place', () => {
    expect(embedEffectNeedsSignIn(vote, true)).toBe(false);
    expect(embedEffectNeedsSignIn(row, true)).toBe(false);
  });

  it('links, mail, calendar and page jumps run in place', () => {
    expect(embedEffectNeedsSignIn(open, false)).toBe(false);
    expect(embedEffectNeedsSignIn({ kind: 'mailto', href: 'mailto:a@b', to: 'a@b' }, false)).toBe(false);
    expect(embedEffectNeedsSignIn({ kind: 'calendar', ics: '', filename: 'e.ics' }, false)).toBe(false);
    expect(embedEffectNeedsSignIn({ kind: 'none' }, false)).toBe(false);
  });

  it('opens the post in a new tab without giving it the embed window', () => {
    const openSpy = vi.fn();
    vi.stubGlobal('window', { open: openSpy });
    openPostInNewTab('https://pn.parnoir.com/?file=abc');
    expect(openSpy).toHaveBeenCalledWith('https://pn.parnoir.com/?file=abc', '_blank', 'noopener,noreferrer');
  });
});
