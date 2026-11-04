/**
 * Held ZK proofs read from the pN's Pen Knowledge claim docs (par-noir-pen/{docId}/doc.json).
 * Only manifests are read: claims carry proofs; raw answers stay in docKey-sealed sections.
 */

import { google } from 'googleapis';
import {
  KNOWLEDGE_CLAIM_CLASS_ID,
  PEN_ROOT,
  docRootPath,
  sanitizeSegment,
  type PenDocManifest
} from '@par-noir/pen-protocol';
import { GoogleOAuth2Helper, type GoogleDriveToken } from './googleOAuth2Helper';

export interface HeldKnowledgeProof {
  dataPointId: string;
  proofType: string;
  zkpProof: string;
  verifiedAt: string;
  expiresAt?: string;
  verificationLevel: 'basic' | 'enhanced' | 'verified';
  provider: string;
}

type DriveClient = ReturnType<typeof google.drive>;

function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findChild(
  drive: DriveClient,
  parentId: string,
  name: string,
  folder = false
): Promise<string | null> {
  const mime = folder ? " and mimeType='application/vnd.google-apps.folder'" : '';
  const list = await drive.files.list({
    q: `name='${escapeQuery(name)}' and '${parentId}' in parents and trashed=false${mime}`,
    fields: 'files(id)',
    pageSize: 1
  });
  return (list.data.files?.[0]?.id as string | undefined) || null;
}

async function readJson<T>(drive: DriveClient, fileId: string): Promise<T | null> {
  const got = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  try {
    return JSON.parse(Buffer.from(got.data as ArrayBuffer).toString('utf8')) as T;
  } catch {
    return null;
  }
}

function docFolderName(docId: string): string {
  return docRootPath(docId).split('/').pop() || sanitizeSegment(docId);
}

export async function listKnowledgeProofs(params: {
  token: GoogleDriveToken;
  pnFolderId: string;
  pnIdentifier: string;
  accountId?: string;
}): Promise<HeldKnowledgeProof[]> {
  const auth = GoogleOAuth2Helper.createClient(params.token, params.pnIdentifier, params.accountId);
  const drive = google.drive({ version: 'v3', auth });
  const penRoot = await findChild(drive, params.pnFolderId, PEN_ROOT, true);
  if (!penRoot) return [];
  const indexId = await findChild(drive, penRoot, 'library.index.json');
  if (!indexId) return [];
  const rows = (await readJson<Array<Record<string, unknown>>>(drive, indexId)) || [];
  const out: HeldKnowledgeProof[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row.classId !== KNOWLEDGE_CLAIM_CLASS_ID || typeof row.docId !== 'string' || !row.docId) continue;
    const folder = await findChild(drive, penRoot, docFolderName(row.docId), true);
    if (!folder) continue;
    const manifestId = await findChild(drive, folder, 'doc.json');
    if (!manifestId) continue;
    const manifest = await readJson<PenDocManifest>(drive, manifestId);
    for (const claim of manifest?.knowledge?.claims || []) {
      if (!claim.proofRef) continue;
      out.push({
        dataPointId: claim.dataPointId,
        proofType: claim.proofType || '',
        zkpProof: claim.proofRef,
        verifiedAt: claim.verifiedAt || manifest!.createdAt,
        expiresAt: claim.expiresAt,
        verificationLevel: claim.verificationLevel || 'basic',
        provider: claim.provider || ''
      });
    }
  }
  return out;
}
