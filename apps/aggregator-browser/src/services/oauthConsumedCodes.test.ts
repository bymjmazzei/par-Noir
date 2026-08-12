/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  isOauthCodeConsumed,
  markOauthCodeConsumed,
  resetOauthConsumedCodesForTests,
} from './oauthConsumedCodes';

describe('oauthConsumedCodes', () => {
  afterEach(() => {
    resetOauthConsumedCodesForTests();
  });

  it('marks a code consumed so it cannot be exchanged twice', () => {
    expect(isOauthCodeConsumed('abc')).toBe(false);
    markOauthCodeConsumed('abc');
    expect(isOauthCodeConsumed('abc')).toBe(true);
    markOauthCodeConsumed('abc');
    expect(isOauthCodeConsumed('abc')).toBe(true);
    expect(isOauthCodeConsumed('other')).toBe(false);
  });
});
