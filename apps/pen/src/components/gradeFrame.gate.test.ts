import { describe, expect, it } from 'vitest';
import { GRADE_UNPACK_FLIP_Y } from '@par-noir/feed-tile';

describe('tonal grade', () => {
  it('does not flip the picture when a grade slider turns the shader on', () => {
    expect(GRADE_UNPACK_FLIP_Y).toBe(0);
  });
});
