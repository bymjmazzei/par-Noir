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

/** The server keeps only public counts; who liked what stays on this device. */
const likedKey = (pn: string) => `pen_template_liked_v1:${pn}`;

function readLikedSet(pn: string): Set<string> {
  try {
    const raw = localStorage.getItem(likedKey(pn));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function readViewerLiked(pn: string, fileId: string): boolean {
  return readLikedSet(pn).has(fileId);
}

export function writeViewerLiked(pn: string, fileId: string, liked: boolean): void {
  const set = readLikedSet(pn);
  if (liked) set.add(fileId);
  else set.delete(fileId);
  try {
    localStorage.setItem(likedKey(pn), JSON.stringify([...set]));
  } catch {
    /* storage full / blocked */
  }
}

function mutationHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`
  };
}

export async function toggleLikePublic(
  fileId: string,
  userPnIdentifier: string,
  liked: boolean,
  accessToken: string
): Promise<{ liked: boolean }> {
  const res = await fetch(`${API_ENDPOINT}/api/engagement/${encodeURIComponent(fileId)}/like`, {
    method: 'POST',
    headers: mutationHeaders(accessToken),
    body: JSON.stringify({ userPnIdentifier, liked })
  });
  if (!res.ok) throw new Error(`engagement_like_${res.status}`);
  const body = (await res.json()) as { liked?: boolean };
  return { liked: typeof body.liked === 'boolean' ? body.liked : liked };
}

export async function recordSharePublic(
  fileId: string,
  userPnIdentifier: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/engagement/${encodeURIComponent(fileId)}/share`, {
    method: 'POST',
    headers: mutationHeaders(accessToken),
    body: JSON.stringify({ userPnIdentifier })
  });
  if (!res.ok) throw new Error(`engagement_share_${res.status}`);
}
