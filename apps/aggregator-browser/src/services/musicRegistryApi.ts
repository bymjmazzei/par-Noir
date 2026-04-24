/**
 * Licensed music registry — catalog browse and post→track attach (API only; no Google).
 */

import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from './pnOAuthService';

export interface CatalogTrack {
  id: string;
  title: string;
  displayArtist: string | null;
}

async function bearer(): Promise<string> {
  const token = await PNOAuthService.getValidAccessToken();
  if (!token) throw new Error('Sign in required');
  return token;
}

export async function fetchMusicRegistryCatalog(q?: string): Promise<CatalogTrack[]> {
  const token = await bearer();
  const u = new URL(`${API_ENDPOINT}/api/v1/music/registry/catalog`);
  if (q?.trim()) u.searchParams.set('q', q.trim());
  u.searchParams.set('limit', '100');
  const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
  const data = (await res.json().catch(() => ({}))) as { tracks?: CatalogTrack[]; error_description?: string };
  if (!res.ok) throw new Error(data.error_description || `Catalog failed (${res.status})`);
  return data.tracks ?? [];
}

export async function fetchPostRegistryTrack(postFileId: string): Promise<string | null> {
  const token = await bearer();
  const enc = encodeURIComponent(postFileId);
  const res = await fetch(`${API_ENDPOINT}/api/v1/music/registry/post-uses/${enc}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = (await res.json().catch(() => ({}))) as { registry_track_id?: string | null };
  if (!res.ok) return null;
  return data.registry_track_id != null && String(data.registry_track_id).length > 0
    ? String(data.registry_track_id)
    : null;
}

export async function attachPostToRegistryTrack(postFileId: string, registryTrackId: string): Promise<void> {
  const token = await bearer();
  const res = await fetch(`${API_ENDPOINT}/api/v1/music/registry/post-uses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ post_file_id: postFileId, registry_track_id: registryTrackId })
  });
  const data = (await res.json().catch(() => ({}))) as { error_description?: string };
  if (!res.ok) throw new Error(data.error_description || `Attach failed (${res.status})`);
}

export async function clearRegistryTrackForPost(postFileId: string): Promise<void> {
  const token = await bearer();
  const enc = encodeURIComponent(postFileId);
  const res = await fetch(`${API_ENDPOINT}/api/v1/music/registry/post-uses/${enc}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = (await res.json().catch(() => ({}))) as { error_description?: string };
  if (!res.ok) throw new Error(data.error_description || `Clear link failed (${res.status})`);
}
