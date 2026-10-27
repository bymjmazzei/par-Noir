/**
 * Visible name for a pN. Key 1 is a secret, so it is never returned, even when a stored
 * nickname happens to equal it.
 */
export function safePnDisplayName(params: {
  nickname?: string | null;
  key1?: string | null;
  pnIdentifier?: string | null;
}): string {
  const nickname = params.nickname?.trim() || '';
  const key1 = params.key1?.trim() || '';
  if (nickname && nickname !== key1) return nickname;
  const short = (params.pnIdentifier || '').replace(/^pn-/, '').slice(0, 8);
  return short ? `pN ${short}` : 'pN';
}
