/**
 * Prism API client
 * Queue fetch and vote submission
 *
 * Drive-backed calls (preview) go through prismOwnerFetch: mint cloud AT and
 * fail closed. Queue / vote / admin / reputation / apply are Postgres-backed
 * and use bearer-only headers.
 */

import {
  ownerCloudHeadersAsync,
  PN_CLOUD_ACCESS_TOKEN_HEADER
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

function bearerHeaders(accessToken: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

function cloudTokenRequiredResponse(): Response {
  return new Response(
    JSON.stringify({
      error: 'cloud_token_required',
      error_description:
        'Google Drive access token required. Unlock with cloud credentials before Drive-backed calls.'
    }),
    { status: 409, headers: { 'Content-Type': 'application/json' } }
  );
}

function toUrl(pathOrUrl: string): string {
  return /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${API_ENDPOINT}${pathOrUrl}`;
}

/**
 * Drive-backed Prism request. Mints a Google cloud access token (via the shared
 * package) and fails closed with a local 409 when a pn is known but no token
 * can be produced — same contract as aggregator ownerFetch.
 */
export async function prismOwnerFetch(
  pathOrUrl: string,
  accessToken: string,
  init?: RequestInit & { pnIdentifier?: string | null }
): Promise<Response> {
  const { pnIdentifier, headers: initHeaders, ...rest } = init ?? {};
  const pn = pnIdentifier ?? prismPnIdentifier;
  const headers = await ownerCloudHeadersAsync({
    authToken: accessToken,
    pnIdentifier: pn,
    apiEndpoint: API_ENDPOINT
  });
  if (pn && !headers[PN_CLOUD_ACCESS_TOKEN_HEADER]) {
    return cloudTokenRequiredResponse();
  }
  return fetch(toUrl(pathOrUrl), {
    ...rest,
    headers: { ...headers, ...(initHeaders as Record<string, string> | undefined) }
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
  _pnIdentifier?: string | null
): Promise<PrismQueueItem[]> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/queue?limit=20`, {
    headers: bearerHeaders(accessToken)
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed to fetch queue'));
  const data = await res.json();
  return data.items || [];
}

export async function submitVote(
  accessToken: string,
  queueItemId: string,
  vote: 'approve' | 'deny' | 'skip',
  _pnIdentifier?: string | null
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/vote`, {
    method: 'POST',
    headers: bearerHeaders(accessToken),
    body: JSON.stringify({ queueItemId, vote })
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed to submit vote'));
}

export async function fetchAdminCheck(
  accessToken: string,
  _pnIdentifier?: string | null
): Promise<{ isAdmin: boolean; isBootstrapMode: boolean }> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/admin/check`, {
    headers: bearerHeaders(accessToken)
  });
  if (!res.ok) return { isAdmin: false, isBootstrapMode: false };
  return res.json();
}

export async function fetchAdminStats(
  accessToken: string,
  _pnIdentifier?: string | null
): Promise<{ pending: number; approved: number; denied: number }> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/admin/stats`, {
    headers: bearerHeaders(accessToken)
  });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function seedDemoQueue(
  accessToken: string,
  limit = 5,
  _pnIdentifier?: string | null
): Promise<{ added: number; fileIds: string[]; message: string }> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/admin/seed-demo?limit=${limit}`, {
    method: 'POST',
    headers: bearerHeaders(accessToken)
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
  _pnIdentifier?: string | null
): Promise<ReputationResult> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/reputation`, {
    headers: bearerHeaders(accessToken)
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed to fetch reputation'));
  return res.json();
}

export async function submitRayApply(
  accessToken: string,
  _pnIdentifier?: string | null
): Promise<{ success: boolean; applicationId?: string }> {
  const res = await fetch(`${API_ENDPOINT}/api/prism/apply`, {
    method: 'POST',
    headers: bearerHeaders(accessToken)
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
    ...(thumbnail && { thumbnail: 'true' })
  });
  const res = await prismOwnerFetch(`/api/prism/preview?${params}`, accessToken, {
    pnIdentifier
  });
  if (!res.ok) throw new Error('Failed to load preview');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
