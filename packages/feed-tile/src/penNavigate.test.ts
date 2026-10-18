import { describe, expect, it } from 'vitest';
import { resolveNavigatePageIndex } from './penNavigate.js';

describe('resolveNavigatePageIndex', () => {
  const slugs = ['home', 'about', 'contact'];

  it('resolves relative and slug targets', () => {
    expect(resolveNavigatePageIndex('next', 0, 3, slugs)).toBe(1);
    expect(resolveNavigatePageIndex('prev', 1, 3, slugs)).toBe(0);
    expect(resolveNavigatePageIndex('slug:contact', 0, 3, slugs)).toBe(2);
    expect(resolveNavigatePageIndex('page:1', 0, 3, slugs)).toBe(1);
  });
});
