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

export function bucketForKey(key: string, verified: boolean): string {
  const suffix = verified ? 'verified' : 'unverified';
  if (key.startsWith('e:')) return `engager_${suffix}`;
  if (key.startsWith('r:')) return `content_rights_${suffix}`;
  if (key.startsWith('m:')) return `music_${suffix}`;
  if (key.startsWith('c:')) return `publisher_${suffix}`;
  // Legacy
  return key.startsWith('m:') ? `music_${suffix}` : suffix === 'verified' ? 'verified' : 'unverified';
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
 * Distribute cnt engagement units according to micro allocation.
 * Orphan: publisher + content portions that would go to content owner redirect to trackOwnerPn as m:.
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
    commentAuthorPns
  } = input;
  if (!Number.isFinite(cnt) || cnt <= 0) return;

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
      addWeight(target, `c:${publisherPn}`, cnt * engagerBps);
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
    } else {
      addWeight(target, `c:${publisherPn}`, cnt * alloc.publisherBps);
    }
  }

  void engagerBps;
}
