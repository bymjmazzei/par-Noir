/**
 * Map micro-allocation weight keys (plain pn, SHA3 holder hash, HMAC actor id) to pn_identifier.
 */

import { hashPnIdentifier } from '@par-noir/pen-protocol';
import { cacheActorId } from '../utils/cacheActor';

export function buildPayeeAliasMap(pnIdentifiers: Iterable<string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of pnIdentifiers) {
    const pn = String(raw ?? '').trim();
    if (!pn) continue;
    map.set(pn, pn);
    map.set(hashPnIdentifier(pn), pn);
    try {
      map.set(cacheActorId(pn), pn);
    } catch {
      /* pepper unset in some unit contexts */
    }
  }
  return map;
}

/** Resolve one weight key; engager / rights / music fold to publisher when unknown. */
export function resolveWeightKey(
  key: string,
  aliasMap: Map<string, string>,
  foldPublisherPn: string
): string {
  if (!key || key.length < 3 || key[1] !== ':') return key;
  const prefix = key.slice(0, 2);
  const raw = key.slice(2).trim();
  if (!raw) return key;
  const publisher = foldPublisherPn.trim();
  const resolved = aliasMap.get(raw) ?? (prefix === 'c:' ? raw : publisher);
  if (!resolved) return key;
  return `${prefix}${resolved}`;
}

export function mergeResolvedWeights(
  global: Map<string, number>,
  local: Map<string, number>,
  aliasMap: Map<string, string>,
  foldPublisherPn: string
): void {
  const pub = foldPublisherPn.trim();
  if (!pub) return;
  for (const [key, w] of local) {
    if (!Number.isFinite(w) || w <= 0) continue;
    const resolved = resolveWeightKey(key, aliasMap, pub);
    global.set(resolved, (global.get(resolved) || 0) + w);
  }
}
