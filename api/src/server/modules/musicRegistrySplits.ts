/**
 * Parses `music_registry_tracks.splits_metadata` for multiparty music-pool (25%) shares.
 *
 * Expected shape (v1):
 * ```json
 * {
 *   "payees": [
 *     { "pn_identifier": "<pN id>", "basis_points": 6000 },
 *     { "pn_identifier": "<pN id>", "basis_points": 4000 }
 *   ]
 * }
 * ```
 * `basis_points` are integer shares of 10_000 (100.000%). `identity_id` is accepted as an alias for `pn_identifier`.
 * If missing or invalid, 100% goes to `trackOwnerPn` (same as single-party).
 */

export interface MusicPayeeBasis {
  pn: string;
  basisPoints: number;
}

export function parseMusicPayeesFromSplits(
  splitsMetadata: unknown,
  trackOwnerPn: string
): MusicPayeeBasis[] {
  const fallback = trackOwnerPn.trim();
  if (!fallback) return [];

  if (!splitsMetadata || typeof splitsMetadata !== 'object' || Array.isArray(splitsMetadata)) {
    return [{ pn: fallback, basisPoints: 10000 }];
  }

  const o = splitsMetadata as Record<string, unknown>;
  const raw = o.payees;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ pn: fallback, basisPoints: 10000 }];
  }

  const parsed: MusicPayeeBasis[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const it = item as Record<string, unknown>;
    const pn = String(it.pn_identifier ?? it.identity_id ?? '').trim();
    const bp = Math.floor(Number(it.basis_points ?? it.basisPoints ?? 0));
    if (!pn || !Number.isFinite(bp) || bp <= 0) continue;
    parsed.push({ pn, basisPoints: bp });
  }

  if (parsed.length === 0) {
    return [{ pn: fallback, basisPoints: 10000 }];
  }

  let sum = parsed.reduce((a, p) => a + p.basisPoints, 0);
  if (!Number.isFinite(sum) || sum <= 0) {
    return [{ pn: fallback, basisPoints: 10000 }];
  }

  if (sum === 10000) {
    return [...parsed].sort((a, b) => a.pn.localeCompare(b.pn));
  }

  const normalized = parsed.map((p) => ({
    pn: p.pn,
    basisPoints: Math.max(1, Math.floor((p.basisPoints * 10000) / sum))
  }));
  let nsum = normalized.reduce((a, p) => a + p.basisPoints, 0);
  let rem = 10000 - nsum;
  const sorted = [...normalized].sort((a, b) => a.pn.localeCompare(b.pn));
  let i = 0;
  while (rem > 0 && sorted.length > 0) {
    sorted[i % sorted.length].basisPoints += 1;
    rem--;
    i++;
  }
  return sorted;
}

/** Integer weights for the music slice (scaled by same factor as creator: cnt×25). */
export function musicPoolWeightsForRow(
  splitsMetadata: unknown,
  trackOwnerPn: string,
  musicScaledWeight: number
): Array<{ pn: string; weight: number }> {
  const mw = Math.floor(Number(musicScaledWeight));
  if (!Number.isFinite(mw) || mw <= 0) return [];

  const payees = parseMusicPayeesFromSplits(splitsMetadata, trackOwnerPn);
  const totalBp = payees.reduce((a, p) => a + p.basisPoints, 0);
  if (totalBp <= 0) return [];

  const sorted = [...payees].sort((a, b) => a.pn.localeCompare(b.pn));
  const out: Array<{ pn: string; weight: number }> = [];
  let allocated = 0;
  for (const p of sorted) {
    const w = Math.floor((mw * p.basisPoints) / totalBp);
    out.push({ pn: p.pn, weight: w });
    allocated += w;
  }
  let rem = mw - allocated;
  let j = 0;
  while (rem > 0 && out.length > 0) {
    out[j % out.length].weight += 1;
    rem--;
    j++;
  }
  return out.filter((x) => x.weight > 0);
}
