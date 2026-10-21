/**
 * The three private reads an approved agent may run. Everything comes from the owner's own
 * Drive through the shared package paths, and leaves through the allowlisted projections.
 */

import {
  decryptCloudDoc,
  deviceDriveCall,
  openDocKeysFromGroups,
  penCloudDocPlainText,
  readLibraryIndex,
  readPenCloudDoc,
} from '@par-noir/device-cloud-credentials';
import { decryptPrivateFile } from '@par-noir/identity-crypto';
import {
  PRIVATE_FILE_MAX_BYTES,
  PRIVATE_SEARCH_MAX_RESULTS,
  isPrivateTextType,
  projectPrivateFileText,
  projectPrivatePenText,
  projectPrivateSearch,
  type PrivateFileText,
  type PrivatePenText,
  type PrivateSearchResult,
} from '@par-noir/standard-data-points';
import { AgentCustodyError } from './errors';
import type { OwnerCustody } from './ownerCustody';

export type PrivateReadContext = { accessToken: string; custody: OwnerCustody };

const ENCRYPTED_SUFFIX = '.encrypted';
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const QUERY_MAX = 200;
const SEARCH_MAX_PAGES = 3;

const MIME_BY_EXT: Record<string, string> = {
  txt: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  html: 'text/html',
  htm: 'text/html',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
};

/** Drive stores every private package as JSON; the original type comes from the original name. */
function mimeFromName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() || '';
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function originalName(driveName: string): string | null {
  return driveName.endsWith(ENCRYPTED_SUFFIX) ? driveName.slice(0, -ENCRYPTED_SUFFIX.length) || null : null;
}

function driveQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function cleanQuery(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, QUERY_MAX) : '';
}

type DriveFile = { id?: string; name?: string; size?: string; modifiedTime?: string; parents?: string[] };

async function listCabinetFiles(ctx: PrivateReadContext, query: string): Promise<unknown[]> {
  const folderId = ctx.custody.layout.filesFolderId;
  if (!folderId) return [];
  let q = `'${driveQuoted(folderId)}' in parents and trashed = false`;
  if (query) q += ` and name contains '${driveQuoted(query)}'`;
  const hits: unknown[] = [];
  let pageToken = '';
  for (let page = 0; page < SEARCH_MAX_PAGES && hits.length < PRIVATE_SEARCH_MAX_RESULTS; page++) {
    const params = new URLSearchParams({ q, pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await deviceDriveCall('GET', `/api/drive/files?${params.toString()}`, null, {
      accessToken: ctx.accessToken,
    });
    if (!res.ok) throw new AgentCustodyError('unavailable');
    const body = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    for (const f of body.files || []) {
      const name = originalName(String(f.name || ''));
      if (!f.id || !name) continue;
      hits.push({ fileId: f.id, name, mimeType: mimeFromName(name), modifiedTime: f.modifiedTime });
    }
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return hits;
}

async function listPenDocs(ctx: PrivateReadContext, query: string): Promise<unknown[]> {
  const rows = await readLibraryIndex(ctx.accessToken, ctx.custody.layout.pnFolderId);
  const needle = query.toLowerCase();
  return rows
    .filter((row) => !needle || String(row.title || '').toLowerCase().includes(needle))
    .map((row) => ({ docId: row.docId, title: row.title, updatedAt: row.updatedAt }));
}

export async function searchPrivate(
  ctx: PrivateReadContext,
  args: { query?: unknown; files: boolean; pen: boolean }
): Promise<PrivateSearchResult> {
  const query = cleanQuery(args.query);
  const [files, penDocuments] = await Promise.all([
    args.files ? listCabinetFiles(ctx, query) : Promise.resolve([]),
    args.pen ? listPenDocs(ctx, query) : Promise.resolve([]),
  ]);
  return projectPrivateSearch({ files, penDocuments });
}

export async function readPrivateFileText(ctx: PrivateReadContext, fileId: unknown): Promise<PrivateFileText> {
  if (typeof fileId !== 'string' || !DRIVE_ID_RE.test(fileId)) throw new AgentCustodyError('not_found');
  const folderId = ctx.custody.layout.filesFolderId;
  if (!folderId) throw new AgentCustodyError('not_found');
  const init = { accessToken: ctx.accessToken };

  const metaRes = await deviceDriveCall('GET', `/api/drive/files/${encodeURIComponent(fileId)}`, null, init);
  if (metaRes.status === 404) throw new AgentCustodyError('not_found');
  if (!metaRes.ok) throw new AgentCustodyError('unavailable');
  const meta = ((await metaRes.json()) as { file?: DriveFile }).file || {};
  const name = originalName(String(meta.name || ''));
  // Only packages in the owner's private cabinet; any other Drive file is invisible here.
  if (!name || !Array.isArray(meta.parents) || !meta.parents.includes(folderId)) {
    throw new AgentCustodyError('not_found');
  }
  if (Number(meta.size) > PRIVATE_FILE_MAX_BYTES) throw new AgentCustodyError('too_large');
  if (!isPrivateTextType(mimeFromName(name), name)) throw new AgentCustodyError('unsupported_type');

  const bodyRes = await deviceDriveCall(
    'GET',
    `/api/drive/files/${encodeURIComponent(fileId)}?download=true`,
    null,
    init
  );
  if (!bodyRes.ok) throw new AgentCustodyError('unavailable');
  let pkg: { encrypted: string; iv: string; salt: string; metadata?: { originalMimeType?: string } };
  try {
    pkg = JSON.parse(await bodyRes.text());
  } catch {
    throw new AgentCustodyError('unavailable');
  }
  const mimeType = pkg?.metadata?.originalMimeType || mimeFromName(name);
  if (!isPrivateTextType(mimeType, name)) throw new AgentCustodyError('unsupported_type');

  let text: string;
  try {
    const { bytes } = await decryptPrivateFile(pkg, ctx.custody.fileOwner);
    text = new TextDecoder('utf-8').decode(bytes);
  } catch {
    throw new AgentCustodyError('unavailable');
  }
  const out = projectPrivateFileText({ fileId, name, mimeType, text });
  if (!out) throw new AgentCustodyError('unavailable');
  return out;
}

export async function readPrivatePenText(ctx: PrivateReadContext, docId: unknown): Promise<PrivatePenText> {
  if (typeof docId !== 'string' || !DOC_ID_RE.test(docId)) throw new AgentCustodyError('not_found');
  const { layout, mlKemSecretKey } = ctx.custody;
  const raw = await readPenCloudDoc({ accessToken: ctx.accessToken, pnFolderId: layout.pnFolderId, docId });
  if (!raw.manifest) throw new AgentCustodyError('not_found');

  const groupsSheetId = layout.sheetIds?.groups;
  const keys =
    raw.manifest.groupId && groupsSheetId
      ? await openDocKeysFromGroups({
          accessToken: ctx.accessToken,
          groupsSheetId,
          groupId: raw.manifest.groupId,
          mlKemSecretKey,
        })
      : [];
  let text: string;
  try {
    const doc = await decryptCloudDoc({
      raw,
      docKey: keys[0]?.docKey ?? null,
      fallbackKeys: keys.map((k) => k.docKey),
    });
    text = penCloudDocPlainText(doc);
  } catch {
    throw new AgentCustodyError('unavailable');
  }
  const out = projectPrivatePenText({
    docId,
    title: raw.manifest.title,
    updatedAt: raw.manifest.updatedAt,
    text,
  });
  if (!out) throw new AgentCustodyError('unavailable');
  return out;
}
