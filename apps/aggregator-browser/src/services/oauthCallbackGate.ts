/**
 * Module-level OAuth callback gate: one in-flight handler per authorization code.
 * Synchronous registration before any await — closes races between popup, storage poll, and oauth_resume.
 */

import { isOauthCodeConsumed } from './oauthConsumedCodes';

const inflightByCode = new Map<string, Promise<void>>();
let popupOAuthUnlockActive = false;

export function isOAuthPopupUnlockActive(): boolean {
  return popupOAuthUnlockActive;
}

export function setOAuthPopupUnlockActive(active: boolean): void {
  popupOAuthUnlockActive = active;
}

export function isOAuthCallbackInflight(code: string): boolean {
  return inflightByCode.has(code);
}

export function getOAuthCallbackInflight(code: string): Promise<void> | undefined {
  return inflightByCode.get(code);
}

/**
 * Run callback work exclusively for this code. Parallel callers share one promise.
 */
export function runExclusiveOAuthCallback(code: string, work: () => Promise<void>): Promise<void> {
  if (!code || isOauthCodeConsumed(code)) {
    return Promise.resolve();
  }

  const existing = inflightByCode.get(code);
  if (existing) return existing;

  const promise = work().finally(() => {
    inflightByCode.delete(code);
  });
  inflightByCode.set(code, promise);
  return promise;
}

/** Test-only. */
export function resetOAuthCallbackGateForTests(): void {
  inflightByCode.clear();
  popupOAuthUnlockActive = false;
}
