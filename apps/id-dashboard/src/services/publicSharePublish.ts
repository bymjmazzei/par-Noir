/**
 * Dashboard helper: upload public ciphertext envelope, ensure-public, return API fields.
 */

import {
  envelopeJsonBytes,
  ensurePublicContentRef,
  slimPublicTokenJson,
  type PublicContentRef,
  type PublicShareGenerationResult,
} from '@par-noir/aggregator-domain';
import { API_ENDPOINT } from '../config/api';
import { resolveOwnerApiToken } from './ownerApiToken';
import { getOwnerApiPnIdentifier, ownerFetch } from './ownerApiService';
import type { FileAggregatorService } from './aggregator/FileAggregatorService';

export async function publishPublicShareForDashboard(params: {
  generation: PublicShareGenerationResult;
  aggregatorService: FileAggregatorService;
  backendId: string;
  folderId?: string;
  pnIdentifier?: string;
  envelopeFileName?: string;
  backend?: string;
}): Promise<{ publicToken: string; publicContentRef: PublicContentRef }> {
  const ownerToken = resolveOwnerApiToken();
  if (!ownerToken) {
    throw new Error('par Noir API session not ready');
  }

  const backend = params.backend || 'google_drive';
  const fileName =
    params.envelopeFileName || `public-envelope-${Date.now()}.json`;
  const blob = envelopeJsonBytes(params.generation.envelope);
  const FileConstructor = globalThis.File || (typeof window !== 'undefined' ? window.File : File);
  const file = new FileConstructor([blob], fileName, { type: 'application/json' });

  const uploaded = await params.aggregatorService.uploadToBackend(
    params.backendId,
    file,
    params.folderId,
    {
      fileName,
      // Omit pnIdentifier so companion/public index metadata is not created for the envelope blob.
    }
  );
  const objectId = uploaded?.id || uploaded?.backendFileId;
  if (!objectId) {
    throw new Error('Envelope upload succeeded but no object id returned');
  }

  // ownerFetch attaches X-PN-Cloud-Access-Token for Drive ensure-public.
  const path = `/api/aggregator/public-content/${encodeURIComponent(objectId)}/ensure-public`;
  const res = await ownerFetch(
    ownerToken,
    'POST',
    path,
    { backend },
    { pnIdentifier: params.pnIdentifier || getOwnerApiPnIdentifier() || undefined }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`ensure-public failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { publicContentRef?: PublicContentRef };
  if (!data.publicContentRef?.objectId || !data.publicContentRef?.publicUrl) {
    // Fall back to shared validator path if shape is incomplete
    const ref = await ensurePublicContentRef({
      objectId,
      backend,
      apiBase: API_ENDPOINT,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    return {
      publicToken: slimPublicTokenJson(params.generation.token),
      publicContentRef: ref,
    };
  }

  return {
    publicToken: slimPublicTokenJson(params.generation.token),
    publicContentRef: data.publicContentRef,
  };
}

export async function revokePublishedPublicContent(params: {
  objectId: string;
  backend?: string;
  pnIdentifier?: string;
}): Promise<void> {
  const ownerToken = resolveOwnerApiToken();
  if (!ownerToken) {
    throw new Error('par Noir API session not ready');
  }
  const path = `/api/aggregator/public-content/${encodeURIComponent(params.objectId)}/revoke-public`;
  const res = await ownerFetch(
    ownerToken,
    'POST',
    path,
    { backend: params.backend || 'google_drive' },
    { pnIdentifier: params.pnIdentifier || getOwnerApiPnIdentifier() || undefined }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`revoke-public failed: ${res.status} ${text}`);
  }
}
