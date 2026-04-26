import { computePublicRankFromMetrics } from '../modules/discoveryRank';
import type { EngagementMetrics } from '../modules/engagementService';
import { EngagementService } from '../modules/engagementService';

describe('computePublicRankFromMetrics', () => {
  const baseMetrics = (): EngagementMetrics => ({
    total: { likes: 0, comments: 0, shares: 0, saves: 0 },
    verified: { likes: 0, comments: 0, shares: 0, saves: 0 },
    unverified: { likes: 0, comments: 0, shares: 0, saves: 0 },
    recommendationScore: 0
  });

  it('ranks verified engagement higher than same-count unverified', () => {
    const mVerified = { ...baseMetrics(), verified: { likes: 10, comments: 0, shares: 0, saves: 0 } };
    mVerified.recommendationScore = EngagementService.computeRecommendationScore(mVerified);

    const mUnverified = { ...baseMetrics(), unverified: { likes: 10, comments: 0, shares: 0, saves: 0 } };
    mUnverified.recommendationScore = EngagementService.computeRecommendationScore(mUnverified);

    const upload = Date.now();
    const sV = computePublicRankFromMetrics(mVerified, upload, {}).score;
    const sU = computePublicRankFromMetrics(mUnverified, upload, {}).score;
    expect(sV).toBeGreaterThan(sU);
  });

  it('gives newer uploads higher recency component', () => {
    const m = { ...baseMetrics(), verified: { likes: 1, comments: 0, shares: 0, saves: 0 } };
    m.recommendationScore = EngagementService.computeRecommendationScore(m);
    const old = Date.now() - 40 * 86400000;
    const recent = Date.now() - 1 * 86400000;
    const scoreOld = computePublicRankFromMetrics(m, old, {}).score;
    const scoreRecent = computePublicRankFromMetrics(m, recent, {}).score;
    expect(scoreRecent).toBeGreaterThan(scoreOld);
  });
});
