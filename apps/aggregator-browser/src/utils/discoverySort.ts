/**
 * Client-side ordering for feeds. Primary key is server `publicRankScore`
 * (verified-weighted engagement + recency). Personalization bonuses are capped
 * so they cannot override the server's trust-aligned ordering.
 * Policy: docs/business/DISCOVERY_RANKING.md
 */

import type { IndexedFile } from '../types/aggregator';

const PERSONALIZATION_BONUS_CAP = 22;

export interface DiscoverySortUserContext {
  isUnlocked: boolean;
  subscribedSubjects?: string[];
  blockedSubjects?: string[];
  subscribedFeedIds?: string[];
}

function basePublicRank(file: IndexedFile): number {
  const m = file.metadata as { publicRankScore?: number; recommendationScore?: number };
  if (typeof m.publicRankScore === 'number' && Number.isFinite(m.publicRankScore)) {
    return m.publicRankScore;
  }
  if (typeof m.recommendationScore === 'number' && Number.isFinite(m.recommendationScore)) {
    return m.recommendationScore;
  }
  const engagement = file.metadata.engagement;
  const engagementScore =
    (engagement?.likes || 0) +
    (engagement?.comments || 0) * 2 +
    (engagement?.shares || 0) * 1.5;
  const uploadDate = file.metadata.uploadDate
    ? new Date(file.metadata.uploadDate).getTime()
    : Date.now();
  const daysSinceUpload = (Date.now() - uploadDate) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 100 - daysSinceUpload * 2);
  return engagementScore * 0.7 + recencyScore * 0.3;
}

function personalizationBonus(file: IndexedFile, ctx: DiscoverySortUserContext): number {
  if (!ctx.isUnlocked) return 0;
  let bonus = 0;
  const fileSubjects = (file.metadata.subjects || []).map((s) => s.toLowerCase().trim());
  const subscribedSubjects = (ctx.subscribedSubjects || []).map((s) => s.toLowerCase().trim());
  if (subscribedSubjects.length > 0 && fileSubjects.some((s) => subscribedSubjects.includes(s))) {
    bonus += 15;
  }
  const blockedSubjects = (ctx.blockedSubjects || []).map((s) => s.toLowerCase().trim());
  if (blockedSubjects.length > 0 && fileSubjects.some((s) => blockedSubjects.includes(s))) {
    bonus -= 30;
  }
  const subscribedFeedIds = ctx.subscribedFeedIds || [];
  if (
    subscribedFeedIds.length > 0 &&
    file.metadata.feedIds?.some((id) => subscribedFeedIds.includes(id))
  ) {
    bonus += 15;
  }
  return Math.max(-PERSONALIZATION_BONUS_CAP, Math.min(PERSONALIZATION_BONUS_CAP, bonus));
}

/**
 * Sort by server discovery score, with optional capped personalization when unlocked.
 */
export function sortIndexedFilesForDiscovery(
  files: IndexedFile[],
  personalization: boolean,
  ctx: DiscoverySortUserContext
): IndexedFile[] {
  return [...files].sort((a, b) => {
    const baseA = basePublicRank(a);
    const baseB = basePublicRank(b);
    const effA = baseA + (personalization ? personalizationBonus(a, ctx) : 0);
    const effB = baseB + (personalization ? personalizationBonus(b, ctx) : 0);
    if (effB !== effA) return effB - effA;
    const dateA = a.metadata.uploadDate ? new Date(a.metadata.uploadDate).getTime() : 0;
    const dateB = b.metadata.uploadDate ? new Date(b.metadata.uploadDate).getTime() : 0;
    return dateB - dateA;
  });
}
