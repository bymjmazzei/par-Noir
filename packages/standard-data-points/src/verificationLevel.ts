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

/** First-party browser app: NSFW requires Veriff-verified over_21. */
export const BROWSER_APP_CLIENT_ID = 'browser-app';

export const BROWSER_APP_OPTIONAL_DATA_POINTS: readonly string[] = ['over_21'];

export const BROWSER_APP_REQUIRED_DATA_POINTS: readonly string[] = [];

export const BROWSER_APP_DATA_POINT_LEVELS: DataPointLevels = {
  over_21: 'verified',
};

export const BROWSER_APP_SCOPES: readonly string[] = [
  'openid',
  'profile',
  'zkp:over_21',
  'cloud:read',
];

export function applyBrowserAppStaticContract<T extends {
  requiredDataPoints?: string[];
  optionalDataPoints?: string[];
  dataPointLevels?: DataPointLevels;
  permissions?: string[];
}>(permission: T): T {
  return {
    ...permission,
    requiredDataPoints: [...BROWSER_APP_REQUIRED_DATA_POINTS],
    optionalDataPoints: [...BROWSER_APP_OPTIONAL_DATA_POINTS],
    dataPointLevels: { ...BROWSER_APP_DATA_POINT_LEVELS },
    permissions: [...BROWSER_APP_SCOPES],
  };
}

/** Consent/cache hint: browser has been granted over_21 (verified NSFW gate). */
export function browserAppOver21Shared(dataPoints: string[] | null | undefined): boolean {
  return Boolean(dataPoints?.includes('over_21'));
}
