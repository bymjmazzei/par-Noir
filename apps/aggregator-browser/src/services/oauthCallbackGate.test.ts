/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  getOAuthCallbackInflight,
  isOAuthCallbackInflight,
  resetOAuthCallbackGateForTests,
  runExclusiveOAuthCallback
} from './oauthCallbackGate';
import { markOauthCodeConsumed, resetOauthConsumedCodesForTests } from './oauthConsumedCodes';

describe('runExclusiveOAuthCallback', () => {
  afterEach(() => {
    resetOAuthCallbackGateForTests();
    resetOauthConsumedCodesForTests();
  });

  it('dedupes parallel callers for the same code', async () => {
    let runs = 0;
    const work = () =>
      new Promise<void>((resolve) => {
        runs += 1;
        setTimeout(resolve, 10);
      });

    const a = runExclusiveOAuthCallback('code-1', work);
    const b = runExclusiveOAuthCallback('code-1', work);
    expect(isOAuthCallbackInflight('code-1')).toBe(true);
    expect(getOAuthCallbackInflight('code-1')).toBe(a);
    await Promise.all([a, b]);
    expect(runs).toBe(1);
  });

  it('skips work when code already consumed', async () => {
    markOauthCodeConsumed('code-2');
    let runs = 0;
    await runExclusiveOAuthCallback('code-2', async () => {
      runs += 1;
    });
    expect(runs).toBe(0);
  });
});
