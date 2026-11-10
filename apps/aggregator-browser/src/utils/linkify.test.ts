import { describe, expect, it } from 'vitest';
import { splitTextLinks } from './linkify';

describe('splitTextLinks', () => {
  it('splits text around links and keeps trailing punctuation as text', () => {
    expect(splitTextLinks('see https://pn.parnoir.com/?creator=a&file=b.')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'https://pn.parnoir.com/?creator=a&file=b', href: 'https://pn.parnoir.com/?creator=a&file=b' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('returns plain text unchanged', () => {
    expect(splitTextLinks('no links here')).toEqual([{ kind: 'text', text: 'no links here' }]);
  });
});
