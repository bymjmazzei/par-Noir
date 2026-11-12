/**
 * Public discovery rank — single formula for index, search popularity, and recommendations.
 * Policy: docs/business/DISCOVERY_RANKING.md
 */

import type { EngagementMetrics } from './engagementService';

export interface PublicRankOptions {
  /** 0–1, default 0.7 */
  engagementWeight?: number;
  /** 0–1, default 0.3 */
  recencyWeight?: number;
}

/**
 * Trust-weighted engagement (from metrics.recommendationScore) + recency blend.
 * Same math as legacy RecommendationService.calculatePublicScore (engagement half).
 */
export function computePublicRankFromMetrics(
  metrics: EngagementMetrics,
  uploadMs: number,
  options?: PublicRankOptions
): { score: number; reasonLine: string } {
  const weightedEngagementScore = metrics.recommendationScore;
  const normalizedEngagement = Math.log10(weightedEngagementScore + 1) * 10;

  const daysSinceUpload = (Date.now() - uploadMs) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 100 - daysSinceUpload * 2);

  const engagementWeight = options?.engagementWeight ?? 0.7;
  const recencyWeight = options?.recencyWeight ?? 0.3;

  const score = normalizedEngagement * engagementWeight + recencyScore * recencyWeight;

  const v = metrics.verified;
  const u = metrics.unverified;
  const reasonLine = `WeightedEngagement:${normalizedEngagement.toFixed(
    1
  )} verified(L${v.likes} C${v.comments} S${v.shares} Sv${v.saves}) unverified(L${u.likes} C${u.comments} S${u.shares} Sv${u.saves}) recency:${recencyScore.toFixed(1)}`;

  return { score, reasonLine };
}

/** Fixed rank shifts from a post's server-verified Content Credentials; the boost stays below the demotion. */
export const COPY_RANK_DEMOTION = 10;
export const VERIFIED_ORIGINAL_RANK_BOOST = 3;

/**
 * Copies of someone else's credited work rank lower; originals proven by a trusted signer and the
 * uploader's own pN author key rank a little higher. Stripping credentials avoids the demotion
 * but forfeits the boost.
 */
export function originalityRankAdjust(metadata: unknown): number {
  const m = metadata && typeof metadata === 'object' ? (metadata as Record<string, any>) : null;
  const o = m?.originality;
  if (o?.kind === 'copy') return -COPY_RANK_DEMOTION;
  if (o?.kind === 'original' && o.verifiedOriginal === true && m?.c2pa?.trust === 'trusted') {
    return VERIFIED_ORIGINAL_RANK_BOOST;
  }
  return 0;
}
