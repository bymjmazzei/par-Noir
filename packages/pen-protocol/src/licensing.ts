/** Open creator contracts + work license — Pen template/doc root. */

/** Align with aggregator LICENSE_TYPES values. */
export const PEN_WORK_LICENSES = [
  'all-rights-reserved',
  'cc-by',
  'cc-by-sa',
  'cc-by-nc',
  'cc-by-nc-sa',
  'cc-by-nd',
  'cc-by-nc-nd',
  'cc0',
  'public-domain',
  'fair-use'
] as const;

export type PenWorkLicense = (typeof PEN_WORK_LICENSES)[number];

export type PenRoyaltyParty = 'content_rights' | 'music';

export interface PenSplitShare {
  holderPnHash: string;
  /** e.g. author | label | featured */
  role: string;
  /** Of claimed amount; all shares for a contract must sum to 10000. */
  shareBps: number;
}

export interface PenOpenCreatorContract {
  party: PenRoyaltyParty;
  /** 0..10000 = fraction of the platform bucket for this party. */
  claimBps: number;
  splits: PenSplitShare[];
  /** Optional ZKP / commitment proof string once minted. */
  grantProofRef?: string;
}

export interface PenLicensingRoot {
  workLicense: PenWorkLicense;
  /** At most one contract per party. */
  contracts: PenOpenCreatorContract[];
}

export interface PlatformRoyaltyConfig {
  engagerPoolBps: number;
  contentRightsBucketBps: number;
  musicBucketBps: number;
  /** Must be >= contentRightsBucketBps + musicBucketBps. */
  royaltyCapBps: number;
}

export const BPS_DENOM = 10000;

export function defaultPlatformRoyaltyConfig(): PlatformRoyaltyConfig {
  return {
    engagerPoolBps: 1500,
    contentRightsBucketBps: 1500,
    musicBucketBps: 1000,
    royaltyCapBps: 2500
  };
}

export function isPenWorkLicense(v: unknown): v is PenWorkLicense {
  return typeof v === 'string' && (PEN_WORK_LICENSES as readonly string[]).includes(v);
}

function clampClaimBps(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(BPS_DENOM, Math.round(n)));
}

/** Default ARR + full content_rights claim to owner when hash known. */
export function defaultLicensingRoot(ownerPnHash?: string | null): PenLicensingRoot {
  const hash = ownerPnHash?.trim() || '';
  const contracts: PenOpenCreatorContract[] = [];
  if (hash) {
    contracts.push({
      party: 'content_rights',
      claimBps: BPS_DENOM,
      splits: [{ holderPnHash: hash, role: 'author', shareBps: BPS_DENOM }]
    });
  } else {
    contracts.push({
      party: 'content_rights',
      claimBps: BPS_DENOM,
      splits: []
    });
  }
  return {
    workLicense: 'all-rights-reserved',
    contracts
  };
}

export type LicensingValidationError =
  | 'invalid_work_license'
  | 'duplicate_party'
  | 'claim_bps_out_of_range'
  | 'splits_sum'
  | 'empty_holder'
  | 'royalty_cap_exceeded'
  | 'invalid_config';

export function assertPlatformRoyaltyConfig(
  config: PlatformRoyaltyConfig
): LicensingValidationError | null {
  const {
    engagerPoolBps,
    contentRightsBucketBps,
    musicBucketBps,
    royaltyCapBps
  } = config;
  for (const n of [engagerPoolBps, contentRightsBucketBps, musicBucketBps, royaltyCapBps]) {
    if (!Number.isFinite(n) || n < 0 || n > BPS_DENOM) return 'invalid_config';
  }
  if (contentRightsBucketBps + musicBucketBps > royaltyCapBps) return 'royalty_cap_exceeded';
  if (engagerPoolBps + royaltyCapBps > BPS_DENOM) return 'invalid_config';
  return null;
}

function validateSplits(splits: PenSplitShare[]): LicensingValidationError | null {
  if (splits.length === 0) return null;
  let sum = 0;
  for (const s of splits) {
    if (!s.holderPnHash?.trim()) return 'empty_holder';
    if (!Number.isFinite(s.shareBps) || s.shareBps < 0) return 'splits_sum';
    sum += Math.round(s.shareBps);
  }
  if (sum !== BPS_DENOM) return 'splits_sum';
  return null;
}

export function assertLicensingRoot(root: PenLicensingRoot): LicensingValidationError | null {
  if (!isPenWorkLicense(root.workLicense)) return 'invalid_work_license';
  const seen = new Set<PenRoyaltyParty>();
  for (const c of root.contracts || []) {
    if (c.party !== 'content_rights' && c.party !== 'music') return 'duplicate_party';
    if (seen.has(c.party)) return 'duplicate_party';
    seen.add(c.party);
    if (!Number.isFinite(c.claimBps) || c.claimBps < 0 || c.claimBps > BPS_DENOM) {
      return 'claim_bps_out_of_range';
    }
    const splitErr = validateSplits(c.splits || []);
    if (splitErr) return splitErr;
  }
  return null;
}

/** Normalize unknown / partial licensing into a valid root (fail soft → defaults). */
export function normalizeLicensingRoot(
  raw: unknown,
  ownerPnHash?: string | null
): PenLicensingRoot {
  const fallback = defaultLicensingRoot(ownerPnHash);
  if (!raw || typeof raw !== 'object') return fallback;
  const o = raw as Record<string, unknown>;
  const workLicense = isPenWorkLicense(o.workLicense) ? o.workLicense : fallback.workLicense;
  const contractsIn = Array.isArray(o.contracts) ? o.contracts : fallback.contracts;
  const contracts: PenOpenCreatorContract[] = [];
  const seen = new Set<PenRoyaltyParty>();
  for (const item of contractsIn) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const party = c.party === 'music' ? 'music' : c.party === 'content_rights' ? 'content_rights' : null;
    if (!party || seen.has(party)) continue;
    seen.add(party);
    const splitsRaw = Array.isArray(c.splits) ? c.splits : [];
    const splits: PenSplitShare[] = [];
    for (const s of splitsRaw) {
      if (!s || typeof s !== 'object') continue;
      const sh = s as Record<string, unknown>;
      const holderPnHash = typeof sh.holderPnHash === 'string' ? sh.holderPnHash.trim() : '';
      if (!holderPnHash) continue;
      splits.push({
        holderPnHash,
        role: typeof sh.role === 'string' && sh.role.trim() ? sh.role.trim() : 'author',
        shareBps: Math.round(Number(sh.shareBps) || 0)
      });
    }
    const claimBps = clampClaimBps(Number(c.claimBps));
    const grantProofRef =
      typeof c.grantProofRef === 'string' && c.grantProofRef.trim()
        ? c.grantProofRef.trim()
        : undefined;
    contracts.push({
      party,
      claimBps,
      splits,
      ...(grantProofRef ? { grantProofRef } : {})
    });
  }
  if (contracts.length === 0) {
    return { workLicense, contracts: fallback.contracts };
  }
  const root: PenLicensingRoot = { workLicense, contracts };
  if (assertLicensingRoot(root)) {
    // Fix splits that don't sum: if single split, force 10000; else drop to default for that party
    const fixed: PenOpenCreatorContract[] = [];
    for (const c of contracts) {
      const err = validateSplits(c.splits);
      if (err === 'splits_sum' && c.splits.length === 1) {
        fixed.push({
          ...c,
          splits: [{ ...c.splits[0]!, shareBps: BPS_DENOM }]
        });
      } else if (err) {
        if (c.party === 'content_rights') {
          fixed.push(...fallback.contracts.filter((x) => x.party === 'content_rights'));
        }
      } else {
        fixed.push(c);
      }
    }
    const out = { workLicense, contracts: fixed };
    return assertLicensingRoot(out) ? fallback : out;
  }
  return root;
}

/** Ensure manifest.licensing is present and normalized. */
export function ensureManifestLicensing<
  T extends { licensing?: PenLicensingRoot; ownerPnHash?: string }
>(manifest: T, ownerPnHash?: string | null): T & { licensing: PenLicensingRoot } {
  const hash = ownerPnHash ?? manifest.ownerPnHash ?? null;
  return {
    ...manifest,
    licensing: normalizeLicensingRoot(manifest.licensing, hash)
  };
}

export interface BountyPayeeLine {
  holderPnHash: string;
  role: string;
  bps: number;
}

export interface PostBountyAllocation {
  engagerPoolBps: number;
  contentRightsClaimedBps: number;
  musicClaimedBps: number;
  publisherBps: number;
  contentPayees: BountyPayeeLine[];
  musicPayees: BountyPayeeLine[];
}

function distributeClaimed(
  claimedBps: number,
  splits: PenSplitShare[]
): BountyPayeeLine[] {
  if (claimedBps <= 0) return [];
  if (splits.length === 0) return [];
  return splits.map((s) => ({
    holderPnHash: s.holderPnHash,
    role: s.role,
    bps: Math.floor((claimedBps * s.shareBps) / BPS_DENOM)
  }));
}

/**
 * Pure micro allocation for one post's bounty (10000 bps).
 * Does not touch creator-fund period close — call site later.
 */
export function allocatePostBounty(input: {
  config?: PlatformRoyaltyConfig;
  contentClaimBps?: number;
  musicClaimBps?: number;
  contentSplits?: PenSplitShare[];
  musicSplits?: PenSplitShare[];
  /** When false, music bucket is unused (no library attach). Default true if musicClaim set. */
  musicAttached?: boolean;
}): PostBountyAllocation {
  const config = input.config || defaultPlatformRoyaltyConfig();
  const cfgErr = assertPlatformRoyaltyConfig(config);
  if (cfgErr) {
    throw new Error(`invalid_platform_royalty_config:${cfgErr}`);
  }

  const contentClaim = clampClaimBps(
    input.contentClaimBps === undefined ? BPS_DENOM : input.contentClaimBps
  );
  const musicAttached =
    input.musicAttached === true ||
    (input.musicAttached !== false &&
      (input.musicClaimBps !== undefined || (input.musicSplits?.length ?? 0) > 0));
  const musicClaim = musicAttached
    ? clampClaimBps(input.musicClaimBps === undefined ? BPS_DENOM : input.musicClaimBps)
    : 0;

  const contentBucket = config.contentRightsBucketBps;
  const musicBucket = musicAttached ? config.musicBucketBps : 0;
  const engagerPoolBps = config.engagerPoolBps;

  const contentRightsClaimedBps = Math.floor((contentBucket * contentClaim) / BPS_DENOM);
  const musicClaimedBps = Math.floor((musicBucket * musicClaim) / BPS_DENOM);
  const contentUnclaimed = contentBucket - contentRightsClaimedBps;
  const musicUnclaimed = musicBucket - musicClaimedBps;

  const publisherBps =
    BPS_DENOM - engagerPoolBps - contentRightsClaimedBps - musicClaimedBps;
  // Unclaimed rights already included in publisher residual via the formula above
  // (we subtract only claimed). contentUnclaimed + musicUnclaimed are part of publisherBps.
  void contentUnclaimed;
  void musicUnclaimed;

  const contentSplits = input.contentSplits || [];
  const musicSplits = input.musicSplits || [];

  return {
    engagerPoolBps,
    contentRightsClaimedBps,
    musicClaimedBps,
    publisherBps,
    contentPayees: distributeClaimed(contentRightsClaimedBps, contentSplits),
    musicPayees: distributeClaimed(musicClaimedBps, musicSplits)
  };
}

/** Resolve claim/splits from a licensing root for allocatePostBounty. */
export function claimsFromLicensingRoot(root: PenLicensingRoot): {
  contentClaimBps: number;
  musicClaimBps: number;
  contentSplits: PenSplitShare[];
  musicSplits: PenSplitShare[];
  musicAttached: boolean;
} {
  const content = root.contracts.find((c) => c.party === 'content_rights');
  const music = root.contracts.find((c) => c.party === 'music');
  return {
    contentClaimBps: content?.claimBps ?? BPS_DENOM,
    musicClaimBps: music?.claimBps ?? BPS_DENOM,
    contentSplits: content?.splits ?? [],
    musicSplits: music?.splits ?? [],
    musicAttached: Boolean(music)
  };
}
