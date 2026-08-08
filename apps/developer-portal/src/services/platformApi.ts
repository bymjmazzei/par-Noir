import { ownerCloudHeaders } from '@par-noir/device-cloud-credentials';
import { API_ENDPOINT } from '../config/api';

function authHeaders(): HeadersInit {
  const t = sessionStorage.getItem('dev_portal_access_token')?.trim();
  if (!t) return { 'Content-Type': 'application/json' };
  const pn = sessionStorage.getItem('dev_portal_pn_identifier')?.trim() || null;
  return ownerCloudHeaders({
    authToken: t,
    pnIdentifier: pn,
    extra: { 'Content-Type': 'application/json' }
  });
}

async function platformFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function fetchPlatformAccess(): Promise<{ isOperator: boolean; registryConfigured: boolean }> {
  const { ok, data } = await platformFetch('/api/developer/platform/access');
  if (!ok) return { isOperator: false, registryConfigured: false };
  return {
    isOperator: Boolean((data as { isOperator?: boolean }).isOperator),
    registryConfigured: Boolean((data as { registryConfigured?: boolean }).registryConfigured)
  };
}

export async function fetchPlatformOverview() {
  return platformFetch('/api/developer/platform/overview');
}

export async function fetchPlatformApplications(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return platformFetch(`/api/developer/platform/applications${q}`);
}

export async function fetchMyApplications() {
  return platformFetch('/api/developer/applications/mine');
}

export async function approveApplication(id: string, body: { verified?: boolean; commercialLicenseId?: string; notes?: string }) {
  return platformFetch(`/api/developer/platform/applications/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export async function rejectApplication(id: string, notes?: string) {
  return platformFetch(`/api/developer/platform/applications/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ notes })
  });
}

export async function fetchPlatformLicenses() {
  return platformFetch('/api/developer/platform/licenses');
}

export async function createPlatformLicense(body: Record<string, unknown>) {
  return platformFetch('/api/developer/platform/licenses', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export async function patchPlatformLicense(licenseId: string, body: Record<string, unknown>) {
  return platformFetch(`/api/developer/platform/licenses/${encodeURIComponent(licenseId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export async function fetchPlatformOAuthClients() {
  return platformFetch('/api/developer/platform/oauth-clients');
}

export async function patchPlatformOAuthClient(clientId: string, body: Record<string, unknown>) {
  return platformFetch(`/api/developer/platform/oauth-clients/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export async function initializePlatformRegistry() {
  return platformFetch('/api/developer/platform/registry/initialize', { method: 'POST' });
}

export async function syncPlatformRegistry() {
  return platformFetch('/api/developer/platform/registry/sync', { method: 'POST' });
}
