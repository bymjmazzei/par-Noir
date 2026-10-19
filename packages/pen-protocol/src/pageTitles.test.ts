import { describe, expect, it } from 'vitest';
import { pageTitleFor, seedPageTitles, withPageTitle } from './pageTitles.js';

const template = {
  sections: [
    { slug: 'cover', title: 'Cover' },
    { slug: 'body', title: 'Body' },
    { slug: 'menu', title: 'Menu' }
  ]
};

describe('page titles', () => {
  it('prefers the author title, then the template, then Page N', () => {
    const manifest = { pageTitles: { menu: 'Pick a product' } };
    expect(pageTitleFor(manifest, template, 'menu', 2)).toBe('Pick a product');
    expect(pageTitleFor(manifest, template, 'cover', 0)).toBe('Cover');
    expect(pageTitleFor(manifest, template, 'page-4', 3)).toBe('Page 4');
  });

  it('treats the generic Body section as untitled', () => {
    expect(pageTitleFor(undefined, template, 'body', 1)).toBe('Page 2');
    expect(seedPageTitles(template, ['cover', 'body', 'menu'])).toEqual({ cover: 'Cover', menu: 'Menu' });
  });

  it('clears a title when the text is empty', () => {
    const named = withPageTitle(undefined, 'menu', '  Menu  ');
    expect(named).toEqual({ menu: 'Menu' });
    expect(withPageTitle(named, 'menu', '   ')).toBeUndefined();
  });
});
