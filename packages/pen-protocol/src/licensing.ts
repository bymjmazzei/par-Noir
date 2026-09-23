/** Open creator contracts + license families — Pen template/doc root. */

/** Align with aggregator LICENSE_TYPES values (optional interop label). */
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

/** Implied = fund open contracts; free/paid unconditional = grants (paid needs seller Stripe MoR). */
export const PEN_LICENSE_FAMILIES = [
  'implied',
  'unconditionalFree',
  'unconditionalPaid'
] as const;

export type PenLicenseFamily = (typeof PEN_LICENSE_FAMILIES)[number];

export type PenLicenseOfferScope = 'personal' | 'commercial';

export interface PenLicenseOffer {
  scope: PenLicenseOfferScope;
  /** Must be > 0 for unconditionalPaid. */
  priceCents: number;
  currency: 'usd';
}

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
  family: PenLicenseFamily;
  /** Optional interop display label (CC / ARR). */
  workLicense?: PenWorkLicense;
  /** Meaningful under family === 'implied' only. */
  contracts: PenOpenCreatorContract[];
  /** Meaningful under family === 'unconditionalPaid' only; each priceCents > 0. */
  offers?: PenLicenseOffer[];
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

export function isPenLicenseFamily(v: unknown): v is PenLicenseFamily {
  return typeof v === 'string' && (PEN_LICENSE_FAMILIES as readonly string[]).includes(v);
}

function clampClaimBps(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(BPS_DENOM, Math.round(n)));
}

function defaultContentContract(ownerPnHash?: string | null): PenOpenCreatorContract {
  const hash = ownerPnHash?.trim() || '';
  if (hash) {
    return {
      party: 'content_rights',
      claimBps: BPS_DENOM,
      splits: [{ holderPnHash: hash, role: 'author', shareBps: BPS_DENOM }]
    };
  }
  return { party: 'content_rights', claimBps: BPS_DENOM, splits: [] };
}

function defaultMusicContract(ownerPnHash?: string | null): PenOpenCreatorContract {
  const hash = ownerPnHash?.trim() || '';
  if (hash) {
    return {
      party: 'music',
      claimBps: BPS_DENOM,
      splits: [{ holderPnHash: hash, role: 'artist', shareBps: BPS_DENOM }]
    };
  }
  return { party: 'music', claimBps: BPS_DENOM, splits: [] };
}

export type DefaultLicensingOpts = {
  /** When false/undefined, default family is unconditionalFree. When true, implied. */
  membership?: boolean;
  /** Prefer music-party contract for library.music creates. */
  musicAsset?: boolean;
  family?: PenLicenseFamily;
};

/**
 * Default licensing for create paths.
 * Unverified / non-membership → unconditionalFree.
 * Membership → implied (full claim) unless family overridden.
 */
export function defaultLicensingRoot(
  ownerPnHash?: string | null,
  opts?: DefaultLicensingOpts
): PenLicensingRoot {
  const family: PenLicenseFamily =
    opts?.family ?? (opts?.membership ? 'implied' : 'unconditionalFree');

  if (family === 'unconditionalFree') {
    return {
      family,
      workLicense: 'all-rights-reserved',
      contracts: []
    };
  }

  if (family === 'unconditionalPaid') {
    return {
      family,
      workLicense: 'all-rights-reserved',
      contracts: [],
      offers: []
    };
  }

  const contracts: PenOpenCreatorContract[] = opts?.musicAsset
    ? [defaultMusicContract(ownerPnHash)]
    : [defaultContentContract(ownerPnHash)];

  return {
    family: 'implied',
    workLicense: 'all-rights-reserved',
    contracts
  };
}

export type LicensingValidationError =
  | 'invalid_work_license'
  | 'invalid_family'
  | 'duplicate_party'
  | 'claim_bps_out_of_range'
  | 'splits_sum'
  | 'empty_holder'
  | 'royalty_cap_exceeded'
  | 'invalid_config'
  | 'paid_offers_required'
  | 'paid_offer_price'
  | 'implied_requires_contracts'
  | 'membership_required_for_family';

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

function validateOffers(offers: PenLicenseOffer[] | undefined): LicensingValidationError | null {
  if (!offers || offers.length === 0) return 'paid_offers_required';
  for (const o of offers) {
    if (o.scope !== 'personal' && o.scope !== 'commercial') return 'paid_offer_price';
    if (o.currency !== 'usd') return 'paid_offer_price';
    if (!Number.isFinite(o.priceCents) || o.priceCents <= 0) return 'paid_offer_price';
  }
  return null;
}

export function assertLicensingRoot(
  root: PenLicensingRoot,
  opts?: { membership?: boolean; connectReady?: boolean }
): LicensingValidationError | null {
  if (!isPenLicenseFamily(root.family)) return 'invalid_family';
  if (root.workLicense !== undefined && !isPenWorkLicense(root.workLicense)) {
    return 'invalid_work_license';
  }

  if (root.family === 'implied' || root.family === 'unconditionalPaid') {
    if (opts?.membership === false) return 'membership_required_for_family';
  }
  if (root.family === 'unconditionalPaid' && opts?.connectReady === false) {
    return 'membership_required_for_family';
  }

  if (root.family === 'unconditionalFree') {
    return null;
  }

  if (root.family === 'unconditionalPaid') {
    return validateOffers(root.offers);
  }

  // implied
  const contracts = root.contracts || [];
  if (contracts.length === 0) return 'implied_requires_contracts';
  const seen = new Set<PenRoyaltyParty>();
  for (const c of contracts) {
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

function parseOffers(raw: unknown): PenLicenseOffer[] {
  if (!Array.isArray(raw)) return [];
  const out: PenLicenseOffer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const scope = o.scope === 'commercial' ? 'commercial' : o.scope === 'personal' ? 'personal' : null;
    if (!scope) continue;
    const priceCents = Math.round(Number(o.priceCents));
    if (!Number.isFinite(priceCents) || priceCents <= 0) continue;
    out.push({ scope, priceCents, currency: 'usd' });
  }
  return out;
}

function parseContracts(
  contractsIn: unknown,
  fallback: PenOpenCreatorContract[]
): PenOpenCreatorContract[] {
  if (!Array.isArray(contractsIn)) return fallback;
  const contracts: PenOpenCreatorContract[] = [];
  const seen = new Set<PenRoyaltyParty>();
  for (const item of contractsIn) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const party =
      c.party === 'music' ? 'music' : c.party === 'content_rights' ? 'content_rights' : null;
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
  return contracts.length > 0 ? contracts : fallback;
}

/**
 * Normalize unknown / partial licensing.
 * @param opts.membership — when false, coerce implied/paid → unconditionalFree
 */
export function normalizeLicensingRoot(
  raw: unknown,
  ownerPnHash?: string | null,
  opts?: DefaultLicensingOpts & { membership?: boolean; connectReady?: boolean }
): PenLicensingRoot {
  const membership = opts?.membership;
  const fallback = defaultLicensingRoot(ownerPnHash, {
    membership: membership === true,
    musicAsset: opts?.musicAsset,
    family: opts?.family
  });

  if (!raw || typeof raw !== 'object') return fallback;
  const o = raw as Record<string, unknown>;

  let family: PenLicenseFamily = isPenLicenseFamily(o.family)
    ? o.family
    : // Legacy roots without family but with contracts → implied
      Array.isArray(o.contracts) && (o.contracts as unknown[]).length > 0
      ? 'implied'
      : fallback.family;

  if (membership === false && (family === 'implied' || family === 'unconditionalPaid')) {
    family = 'unconditionalFree';
  }

  const workLicense = isPenWorkLicense(o.workLicense)
    ? o.workLicense
    : fallback.workLicense;

  if (family === 'unconditionalFree') {
    return { family, workLicense, contracts: [] };
  }

  if (family === 'unconditionalPaid') {
    const offers = parseOffers(o.offers);
    const root: PenLicensingRoot = {
      family,
      workLicense,
      contracts: [],
      offers
    };
    if (assertLicensingRoot(root, { membership, connectReady: opts?.connectReady })) {
      return { family: 'unconditionalFree', workLicense, contracts: [] };
    }
    return root;
  }

  // implied
  const contracts = parseContracts(o.contracts, fallback.contracts);
  let root: PenLicensingRoot = { family: 'implied', workLicense, contracts };
  if (assertLicensingRoot(root, { membership })) {
    const fixed: PenOpenCreatorContract[] = [];
    for (const c of contracts) {
      const err = validateSplits(c.splits);
      if (err === 'splits_sum' && c.splits.length === 1) {
        fixed.push({ ...c, splits: [{ ...c.splits[0]!, shareBps: BPS_DENOM }] });
      } else if (err) {
        if (c.party === 'content_rights') {
          fixed.push(defaultContentContract(ownerPnHash));
        } else if (c.party === 'music') {
          fixed.push(defaultMusicContract(ownerPnHash));
        }
      } else {
        fixed.push(c);
      }
    }
    root = { family: 'implied', workLicense, contracts: fixed };
    if (assertLicensingRoot(root, { membership })) {
      return membership === false
        ? { family: 'unconditionalFree', workLicense, contracts: [] }
        : fallback;
    }
  }
  return root;
}

/** Ensure manifest.licensing is present and normalized. */
export function ensureManifestLicensing<
  T extends { licensing?: PenLicensingRoot; ownerPnHash?: string }
>(
  manifest: T,
  ownerPnHash?: string | null,
  opts?: DefaultLicensingOpts & { membership?: boolean }
): T & { licensing: PenLicensingRoot } {
  const hash = ownerPnHash ?? manifest.ownerPnHash ?? null;
  return {
    ...manifest,
    licensing: normalizeLicensingRoot(manifest.licensing, hash, opts)
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

/**
 * Resolve claim/splits from a licensing root for allocatePostBounty.
 * Non-implied families → zero claims (fund residual stays with publisher).
 */
export function claimsFromLicensingRoot(root: PenLicensingRoot): {
  contentClaimBps: number;
  musicClaimBps: number;
  contentSplits: PenSplitShare[];
  musicSplits: PenSplitShare[];
  musicAttached: boolean;
} {
  if (root.family !== 'implied') {
    return {
      contentClaimBps: 0,
      musicClaimBps: 0,
      contentSplits: [],
      musicSplits: [],
      musicAttached: false
    };
  }
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

/** Merge post + attached music licensing for period close. */
export function claimsForPostWithMusic(input: {
  postLicensing: PenLicensingRoot;
  musicLicensing?: PenLicensingRoot | null;
  musicAttached: boolean;
}): {
  contentClaimBps: number;
  musicClaimBps: number;
  contentSplits: PenSplitShare[];
  musicSplits: PenSplitShare[];
  musicAttached: boolean;
} {
  const post = claimsFromLicensingRoot(input.postLicensing);
  if (!input.musicAttached || !input.musicLicensing) {
    return { ...post, musicAttached: false, musicClaimBps: 0, musicSplits: [] };
  }
  const musicDoc = claimsFromLicensingRoot(input.musicLicensing);
  if (input.musicLicensing.family !== 'implied') {
    return {
      contentClaimBps: post.contentClaimBps,
      contentSplits: post.contentSplits,
      musicClaimBps: 0,
      musicSplits: [],
      musicAttached: true
    };
  }
  void musicDoc;
  const music =
    input.musicLicensing.contracts.find((c) => c.party === 'music') ||
    input.musicLicensing.contracts.find((c) => c.party === 'content_rights');
  return {
    contentClaimBps: post.contentClaimBps,
    contentSplits: post.contentSplits,
    musicClaimBps: music?.claimBps ?? BPS_DENOM,
    musicSplits: music?.splits ?? [],
    musicAttached: true
  };
}
