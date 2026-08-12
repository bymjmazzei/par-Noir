/** Authorization codes already exchanged this page lifetime — never reuse. */
const consumed = new Set<string>();

export function isOauthCodeConsumed(code: string): boolean {
  return consumed.has(code);
}

export function markOauthCodeConsumed(code: string): void {
  if (code) consumed.add(code);
}

/** Test-only. */
export function resetOauthConsumedCodesForTests(): void {
  consumed.clear();
}
