/**
 * Pure ranking helpers for engagement.topComments denormalization.
 * (DB-backed computeTopComments is exercised via refresh + backfill.)
 */
import { describe, expect, it } from 'vitest';
import { isPublicEngagementRead } from './l5ProductRouteBoundary';

/** Mirror of EngagementService ranking used in computeTopComments. */
function rankTopComments(
  comments: Array<{
    id: string;
    content: string;
    timestamp: string;
    likeCount: number;
    parentCommentId?: string;
  }>,
  cap = 10
) {
  return comments
    .filter((c) => !c.parentCommentId && c.content.trim().length >= 1)
    .sort((a, b) => {
      if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    })
    .slice(0, cap);
}

describe('engagement topComments ranking', () => {
  it('prefers higher likeCount then newer timestamp; caps at 10; skips replies', () => {
    const ranked = rankTopComments([
      { id: 'a', content: 'old popular', timestamp: '2020-01-01T00:00:00Z', likeCount: 5 },
      { id: 'b', content: 'new popular', timestamp: '2024-01-01T00:00:00Z', likeCount: 5 },
      { id: 'c', content: 'reply', timestamp: '2025-01-01T00:00:00Z', likeCount: 99, parentCommentId: 'a' },
      { id: 'd', content: 'lonely', timestamp: '2023-01-01T00:00:00Z', likeCount: 0 },
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `x${i}`,
        content: `c${i}`,
        timestamp: `2022-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        likeCount: 1,
      })),
    ]);
    expect(ranked[0].id).toBe('b');
    expect(ranked[1].id).toBe('a');
    expect(ranked.some((c) => c.id === 'c')).toBe(false);
    expect(ranked.length).toBe(10);
  });
});

describe('public likes list allowlist', () => {
  it('GET /api/engagement/:fileId/likes is a public engagement read', () => {
    expect(isPublicEngagementRead('GET', '/api/engagement/file1/likes')).toBe(true);
    expect(isPublicEngagementRead('GET', '/file1/likes')).toBe(true);
    expect(isPublicEngagementRead('GET', '/api/engagement/file1/like')).toBe(false);
  });
});
