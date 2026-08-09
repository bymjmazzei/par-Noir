/**
 * Attested vs verified for ZKP data points.
 * Same catalog id can exist at either level; tools request a minimum.
 */

export type DataPointMinLevel = 'attested' | 'verified';

export type ProofVerificationLevel = 'basic' | 'enhanced' | 'verified';

/** Tool-declared min level per data point id. Omitted id ⇒ attested (any level). */
export type DataPointLevels = Record<string, DataPointMinLevel>;

export function getDataPointMinLevel(
  levels: DataPointLevels | null | undefined,
  dataPointId: string
): DataPointMinLevel {
  return levels?.[dataPointId] ?? 'attested';
}

/** Verified satisfies attested; attested never satisfies verified. */
export function proofMeetsMinLevel(
  verificationLevel: string | null | undefined,
  minLevel: DataPointMinLevel = 'attested'
): boolean {
  if (minLevel === 'attested') {
    return Boolean(verificationLevel);
  }
  return verificationLevel === 'verified';
}

/** Proof metadata a user holds. Never carries the proof or the underlying data. */
export interface HeldProofSummary {
  dataPointId: string;
  verificationLevel: string;
  expiresAt?: string;
}

/**
 * Which requested data points the user can actually offer.
 *
 * A tool declaring `over_21` at `verified` does not mean the user has a verified
 * age proof. Offering it anyway asks them to share something that does not
 * exist, and any "yes" records a grant that can never be honoured.
 */
export function resolveOfferableDataPoints(params: {
  requestedDataPoints: string[];
  dataPointLevels: DataPointLevels | null | undefined;
  heldProofs: HeldProofSummary[] | null | undefined;
  now?: number;
}): Record<string, { available: boolean; reason?: 'missing' | 'below_level' | 'expired' }> {
  const nowMs = params.now ?? Date.now();
  const held = new Map<string, HeldProofSummary>();
  for (const proof of params.heldProofs ?? []) {
    if (proof?.dataPointId) held.set(proof.dataPointId, proof);
  }

  const out: Record<string, { available: boolean; reason?: 'missing' | 'below_level' | 'expired' }> =
    {};
  for (const id of params.requestedDataPoints) {
    const proof = held.get(id);
    if (!proof) {
      out[id] = { available: false, reason: 'missing' };
      continue;
    }
    if (proof.expiresAt) {
      const expiry = Date.parse(proof.expiresAt);
      if (!Number.isNaN(expiry) && expiry <= nowMs) {
        out[id] = { available: false, reason: 'expired' };
        continue;
      }
    }
    const minLevel = getDataPointMinLevel(params.dataPointLevels, id);
    out[id] = proofMeetsMinLevel(proof.verificationLevel, minLevel)
      ? { available: true }
      : { available: false, reason: 'below_level' };
  }
  return out;
}

/**
 * A stored grant satisfies a request when every requested data point is already
 * granted. A request for something new sends the user back to consent for the
 * delta instead of silently widening an old grant.
 */
export function grantCoversRequest(
  grantedDataPoints: string[] | null | undefined,
  requestedDataPoints: string[] | null | undefined
): boolean {
  if (!requestedDataPoints?.length) return true;
  const granted = new Set(grantedDataPoints ?? []);
  return requestedDataPoints.every((id) => granted.has(id));
}
