/**
 * Map allocatePostBounty BPS onto engagement count weights for period close.
 */

import {
  allocatePostBounty,
  claimsForPostWithMusic,
  normalizeLicensingRoot,
  type PenLicensingRoot,
  type PostBountyAllocation,
  BPS_DENOM
} from '@par-noir/pen-protocol';
import { parseMusicPayeesFromSplits } from './musicRegistrySplits';

export type WeightKey =
  | `e:${string}`
  | `r:${string}`
  | `m:${string}`
  | `c:${string}`;

/** Fund recipients are always verified (engagement only counts verified, member actors). */
export function bucketForKey(key: string): string {
  if (key.startsWith('e:')) return 'engager_verified';
  if (key.startsWith('r:')) return 'content_rights_verified';
  if (key.startsWith('m:')) return 'music_verified';
  if (key.startsWith('c:')) return 'publisher_verified';
  return 'verified';
}

export function recipientIdFromKey(key: string): string {
  return key.slice(2);
}

function addWeight(map: Map<string, number>, key: string, w: number): void {
  if (!Number.isFinite(w) || w <= 0) return;
  map.set(key, (map.get(key) || 0) + w);
}

/** Legacy registry splits → music contract splits for allocatePostBounty. */
export function legacySplitsToMusicLicensing(
  splitsMeta: unknown,
  trackOwnerPn: string
): PenLicensingRoot {
  const payees = parseMusicPayeesFromSplits(splitsMeta, trackOwnerPn);
  const splits = payees.map((p) => ({
    holderPnHash: p.pn,
    role: 'artist',
    shareBps: p.basisPoints
  }));
  return {
    family: 'implied',
    contracts: [
      {
        party: 'music',
        claimBps: BPS_DENOM,
        splits: splits.length
          ? splits
          : [{ holderPnHash: trackOwnerPn.trim(), role: 'artist', shareBps: BPS_DENOM }]
      }
    ]
  };
}

export function licensingFromMetadata(meta: unknown, ownerPn: string): PenLicensingRoot {
  const o = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : null;
  return normalizeLicensingRoot(o?.licensing ?? null, ownerPn, { membership: true });
}

/**
 * Someone else credited by the post's verified Content Credentials.
 * `creatorPn` is set only when the creator is a fund member.
 */
export type PayeeOriginality = { kind: 'copy' | 'licensed_remix'; creatorPn: string | null };

/** The indexed originality of a post, with the credited creator's pN when they have one. */
export function originalityFromMetadata(meta: unknown): PayeeOriginality | null {
  const o = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : null;
  const kind = (o?.originality as { kind?: unknown } | undefined)?.kind;
  if (kind !== 'copy' && kind !== 'licensed_remix') return null;
  const pn = typeof o?.originalityCreatorPn === 'string' ? o.originalityCreatorPn.trim() : '';
  return { kind, creatorPn: pn || null };
}

/**
 * Distribute cnt engagement units according to micro allocation.
 * Orphan: publisher + content portions that would go to content owner redirect to trackOwnerPn as m:.
 * Copy: publisher and content-rights shares go to a member creator, otherwise back to the fund.
 * Licensed remix: the content-rights share goes to a member creator, otherwise back to the fund.
 * The uploader never earns another creator's share.
 */
export function addMicroWeights(input: {
  target: Map<string, number>;
  cnt: number;
  contentOwnerPn: string;
  orphan: boolean;
  trackOwnerPn: string;
  postLicensing: PenLicensingRoot;
  musicLicensing: PenLicensingRoot | null;
  musicAttached: boolean;
  commentAuthorPns: string[];
  originality?: PayeeOriginality | null;
}): void {
  const {
    target,
    cnt,
    contentOwnerPn,
    orphan,
    trackOwnerPn,
    postLicensing,
    musicLicensing,
    musicAttached,
    commentAuthorPns,
    originality
  } = input;
  if (!Number.isFinite(cnt) || cnt <= 0) return;
  const credited = orphan ? null : originality ?? null;
  const creatorPn = credited?.creatorPn?.trim() || '';
  const copy = credited?.kind === 'copy';

  const claims = claimsForPostWithMusic({
    postLicensing,
    musicLicensing,
    musicAttached
  });
  const alloc: PostBountyAllocation = allocatePostBounty(claims);

  const publisherPn = orphan && trackOwnerPn.trim() ? trackOwnerPn.trim() : contentOwnerPn.trim();
  if (!publisherPn) return;

  // Engager pool
  let engagerBps = alloc.engagerPoolBps;
  const authors = commentAuthorPns.map((p) => p.trim()).filter(Boolean);
  if (engagerBps > 0) {
    if (authors.length === 0) {
      // Fold to publisher
      if (!copy) addWeight(target, `c:${publisherPn}`, cnt * engagerBps);
      else if (creatorPn) addWeight(target, `c:${creatorPn}`, cnt * engagerBps);
    } else {
      const each = Math.floor(engagerBps / authors.length);
      let rem = engagerBps - each * authors.length;
      for (let i = 0; i < authors.length; i++) {
        const w = each + (i < rem ? 1 : 0);
        addWeight(target, `e:${authors[i]}`, cnt * w);
      }
    }
  }

  // Content rights — orphan: redirect content-owner-shaped payees to track owner as m:
  for (const p of alloc.contentPayees) {
    const pn = p.holderPnHash.trim();
    if (!pn || p.bps <= 0) continue;
    if (orphan) {
      addWeight(target, `m:${trackOwnerPn.trim() || pn}`, cnt * p.bps);
    } else if (credited) {
      if (creatorPn) addWeight(target, `r:${creatorPn}`, cnt * p.bps);
    } else {
      addWeight(target, `r:${pn}`, cnt * p.bps);
    }
  }

  for (const p of alloc.musicPayees) {
    const pn = p.holderPnHash.trim();
    if (!pn || p.bps <= 0) continue;
    addWeight(target, `m:${pn}`, cnt * p.bps);
  }

  if (alloc.publisherBps > 0) {
    if (orphan) {
      addWeight(target, `m:${publisherPn}`, cnt * alloc.publisherBps);
    } else if (copy) {
      if (creatorPn) addWeight(target, `c:${creatorPn}`, cnt * alloc.publisherBps);
    } else {
      addWeight(target, `c:${publisherPn}`, cnt * alloc.publisherBps);
    }
  }

  void engagerBps;
}
