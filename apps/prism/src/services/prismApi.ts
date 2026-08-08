/**
 * Prism API client
 * Queue fetch and vote submission
 */

import {
  ownerCloudHeadersAsync,
} from '@par-noir/device-cloud-credentials';
import { API_ENDPOINT } from '../config/api';

/** Last unlocked pN for prism API calls that omit pnIdentifier. */
let prismPnIdentifier: string | null = null;

export function setPrismPnIdentifier(pn: string | null | undefined): void {
  prismPnIdentifier = pn?.trim() || null;
}

export function getPrismPnIdentifier(): string | null {
  return prismPnIdentifier;
}

async function prismHeaders(
  accessToken: string,
  pnIdentifier?: string | null
): Promise<Record<string, string>> {
  const pn = pnIdentifier ?? prismPnIdentifier;
  return ownerCloudHeadersAsync({
    authToken: accessToken,
    pnIdentifier: pn,
    apiEndpoint: API_ENDPOINT
  });
}

export interface PrismQueueItem {
  id: string;
  file_id: string;
  owner_pn_identifier: string;
  flag_source: string;
  reporter_pn_identifier: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  name?: string;
  mimeType?: string;
  thumbnailFileId?: string;
}

export async function fetchQueue(
  accessToken: string,
  pnIdentifier?: string | null
): Promise<PrismQueueItem[]> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/queue?limit=20`, {
    headers: await prismHeaders(accessToken, pnIdentifier),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed to fetch queue'));
  const data = await res.json();
  return data.items || [];
}

export async function submitVote(
  accessToken: string,
  queueItemId: string,
  vote: 'approve' | 'deny' | 'skip',
  pnIdentifier?: string | null
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/vote`, {
    method: 'POST',
    headers: await prismHeaders(accessToken, pnIdentifier),
    body: JSON.stringify({ queueItemId, vote }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed to submit vote'));
}

export async function fetchAdminCheck(
  accessToken: string,
  pnIdentifier?: string | null
): Promise<{ isAdmin: boolean; isBootstrapMode: boolean }> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/admin/check`, {
    headers: await prismHeaders(accessToken, pnIdentifier),
  });
  if (!res.ok) return { isAdmin: false, isBootstrapMode: false };
  return res.json();
}

export async function fetchAdminStats(
  accessToken: string,
  pnIdentifier?: string | null
): Promise<{ pending: number; approved: number; denied: number }> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/admin/stats`, {
    headers: await prismHeaders(accessToken, pnIdentifier),
  });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function ensurePrismLedgers(
  accessToken: string,
  pnIdentifier?: string | null
): Promise<{
  processed: number;
  created: number;
  skipped: number;
  errors: string[];
  message: string;
}> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/admin/ensure-prism-ledgers`, {
    method: 'POST',
    headers: await prismHeaders(accessToken, pnIdentifier),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to ensure prism ledgers');
  return data;
}

export async function seedDemoQueue(
  accessToken: string,
  limit = 5,
  pnIdentifier?: string | null
): Promise<{ added: number; fileIds: string[]; message: string }> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/admin/seed-demo?limit=${limit}`, {
    method: 'POST',
    headers: await prismHeaders(accessToken, pnIdentifier),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to seed demo');
  return data;
}

export interface ReputationResult {
  score: number;
  breakdown: {
    activityVolume: { score: number; engagementCount: number; flaggedPenalty: number };
    contentCreation: { score: number; publicFileCount: number; deniedPenalty: number };
    accountTenure: { score: number; daysSinceCreation: number };
    reportAccuracy: { score: number; upheld: number; falseReports: number; total: number };
    rayPerformance: { score: number; matched: number; broke: number; total: number };
  };
  eligible: boolean;
  hasRequiredAttestations: boolean | null;
}

export async function fetchReputation(
  accessToken: string,
  pnIdentifier?: string | null
): Promise<ReputationResult> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/reputation`, {
    headers: await prismHeaders(accessToken, pnIdentifier),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed to fetch reputation'));
  return res.json();
}

export async function submitRayApply(
  accessToken: string,
  pnIdentifier?: string | null
): Promise<{ success: boolean; applicationId?: string }> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/apply`, {
    method: 'POST',
    headers: await prismHeaders(accessToken, pnIdentifier),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to apply');
  }
  return data;
}

export async function fetchPreviewBlobUrl(
  ownerPn: string,
  fileId: string,
  accessToken: string,
  thumbnail = true,
  pnIdentifier?: string | null
): Promise<string> {
  const params = new URLSearchParams({
    ownerPn,
    fileId,
    ...(thumbnail && { thumbnail: 'true' }),
  });
  const res = await fetch(`${API_ENDPOINT}/api/prism/preview?${params}`, {
    headers: await prismHeaders(accessToken, pnIdentifier),
  });
  if (!res.ok) throw new Error('Failed to load preview');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
