/**
 * Encrypt and upload identity document images into private `_metadata/zkp-docs/`.
 * Never indexes for Storage modal or aggregator public feeds.
 */

import { IdentityCrypto } from '@par-noir/identity-crypto';
import { API_ENDPOINT } from '../config/api';
import { ownerFetch } from './ownerApiService';

export async function ensureZkpDocsFolderId(
  pnIdentifier: string,
  authToken: string
): Promise<string> {
  const res = await ownerFetch(
    authToken,
    'POST',
    `/api/storage/${encodeURIComponent(pnIdentifier)}/zkp-docs/ensure`,
    {},
    { pnIdentifier }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to ensure zkp-docs folder: ${text}`);
  }
  const data = (await res.json()) as { folderId?: string };
  if (!data.folderId) throw new Error('zkp-docs folder id missing');
  return data.folderId;
}

export async function uploadZkpDocEncrypted(opts: {
  file: File;
  pnIdentifier: string;
  authToken: string;
  pnName: string;
  passcode: string;
  sessionId?: string;
}): Promise<string> {
  if (opts.sessionId) {
    const { ensureCloudSessionBootstrap } = await import('../contexts/CloudSessionContext');
    const result = await ensureCloudSessionBootstrap({
      apiToken: opts.authToken,
      pnIdentifier: opts.pnIdentifier,
      sessionId: opts.sessionId
    });
    if (result.status !== 'ready') {
      throw new Error(result.error || 'Reconnect Google Drive on this device to upload documents');
    }
  }
  const folderId = await ensureZkpDocsFolderId(opts.pnIdentifier, opts.authToken);
  const buf = await opts.file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const b64 = btoa(binary);

  const encrypted = await IdentityCrypto.encryptData(
    JSON.stringify({
      mimeType: opts.file.type || 'application/octet-stream',
      name: opts.file.name,
      dataBase64: b64
    }),
    opts.pnName,
    opts.passcode
  );

  const packageJson = JSON.stringify(encrypted);
  const fileData = btoa(unescape(encodeURIComponent(packageJson)));
  const safeName = `zkp-doc-${Date.now()}.encrypted`;

  const { resolveLocalGoogleAccessTokenAsync } = await import('./deviceApiService');
  const cloudTok = await resolveLocalGoogleAccessTokenAsync(opts.pnIdentifier);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.authToken}`
  };
  if (cloudTok) headers['X-PN-Cloud-Access-Token'] = cloudTok;

  const uploadRes = await fetch(`${API_ENDPOINT}/api/drive/files`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileData,
      fileName: safeName,
      mimeType: 'application/json',
      parents: [folderId],
      encrypt: false
    })
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`zkp-docs upload failed: ${text}`);
  }
  const out = (await uploadRes.json()) as { id?: string; fileId?: string };
  const id = out.id || out.fileId;
  if (!id) throw new Error('Upload returned no file id');
  return id;
}
