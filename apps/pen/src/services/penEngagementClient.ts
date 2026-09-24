/**
 * Thin first-party engagement client for public template fileIds only.
 * Does not import aggregator-browser.
 */

import { API_ENDPOINT } from '../config/api';

export type PenEngagementStats = {
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
};

export async function fetchEngagementStats(fileId: string): Promise<PenEngagementStats> {
  const res = await fetch(`${API_ENDPOINT}/api/engagement/${encodeURIComponent(fileId)}/stats`, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`engagement_stats_${res.status}`);
  const body = (await res.json()) as Record<string, unknown>;
  const likes = Number(body.likes ?? body.likeCount ?? 0) || 0;
  const comments = Number(body.comments ?? body.commentCount ?? 0) || 0;
  const shares = Number(body.shares ?? body.shareCount ?? 0) || 0;
  const saves = Number(body.saves ?? body.saveCount ?? 0) || 0;
  return { likes, comments, shares, saves };
}

export async function fetchViewerLiked(
  fileId: string,
  userPnIdentifier: string
): Promise<boolean> {
  const q = new URLSearchParams({ userPnIdentifier });
  const res = await fetch(
    `${API_ENDPOINT}/api/engagement/${encodeURIComponent(fileId)}/like?${q}`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) return false;
  const body = (await res.json()) as { liked?: boolean };
  return Boolean(body.liked);
}

export async function toggleLikePublic(
  fileId: string,
  userPnIdentifier: string
): Promise<{ liked: boolean }> {
  const res = await fetch(`${API_ENDPOINT}/api/engagement/${encodeURIComponent(fileId)}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ userPnIdentifier })
  });
  if (!res.ok) throw new Error(`engagement_like_${res.status}`);
  const body = (await res.json()) as { liked?: boolean };
  return { liked: Boolean(body.liked) };
}

export async function recordSharePublic(
  fileId: string,
  userPnIdentifier: string
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/engagement/${encodeURIComponent(fileId)}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ userPnIdentifier })
  });
  if (!res.ok) throw new Error(`engagement_share_${res.status}`);
}
