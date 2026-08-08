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
