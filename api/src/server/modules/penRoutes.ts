/**
 * Pen first-party routes: notary (hash-only) + apply-inbound for
 * current/drafts/past materialization.
 */

import type { Application, Request, Response } from 'express';
import { createHmac, createHash, timingSafeEqual } from 'crypto';
import {
  gateFirstPartyOwnerRoute,
  requireFirstPartyOAuthClient,
  DEVICE_CAPABILITIES
} from './deviceCapabilityService';
import { respondDriveTokenError } from './ownerDriveToken';
import type { GoogleDriveToken } from './googleOAuth2Helper';
import { storageCredentialsService } from './storageCredentialsService';
import { safeClientErrorMessage } from '../utils/safeError';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { verifyPromoteLink, type PenPromoteLink, type PollStructure } from '@par-noir/pen-protocol';
import { appendPollVote, createPollSpreadsheet, writePollStructure, writeWidgetActionTab } from './pollSheetDrive';
import { upsertPollStructureCache } from './pollVoteCache';
import { setupPollVoteRoutes } from './pollVoteRoutes';

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

const PEN_JOB_TYPES = [
  'pen.section_promote',
  'pen.comment',
  'pen.suggestion',
  'pen.draft_upsert',
  'pen.publish',
  'pen.doc_bootstrap',
  'pen.doc_delete',
  'pen.doc_meta',
  'pen.font_upsert',
  'pen.poll_create',
  'pen.poll_structure_put',
  'pen.poll_vote',
  'pen.widget_action'
] as const;

/** Append promote link once; same signature → no-op (guards dual client paths). */
function appendPromoteLinkIdempotent(
  chainBody: string,
  link: PenPromoteLink
): { next: string; appended: boolean } {
  const sig = typeof link.signature === 'string' ? link.signature : '';
  try {
    const parsed = chainBody ? JSON.parse(chainBody) : null;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.links)) {
      if (sig && parsed.links.some((l: { signature?: string }) => l?.signature === sig)) {
        return { next: JSON.stringify(parsed), appended: false };
      }
      parsed.links.push(link);
      return { next: JSON.stringify(parsed), appended: true };
    }
  } catch {
    /* fall through to jsonl-ish append */
  }
  if (sig && chainBody.includes(`"signature":"${sig}"`)) {
    return { next: chainBody, appended: false };
  }
  const next = `${chainBody}${chainBody && !chainBody.endsWith('\n') ? '\n' : ''}${JSON.stringify(link)}\n`;
  return { next, appended: true };
}

function getNotarySecret(): Buffer {
  const raw =
    process.env.PEN_NOTARY_HMAC_SECRET ||
    process.env.PN_OAUTH_JWT_SECRET ||
    '';
  if (!raw || raw.length < 16) {
    return createHash('sha256').update('pen-notary-dev-only').digest();
  }
  return createHash('sha256').update(raw).digest();
}

function signNotary(hash: string, notaryTime: string): string {
  const mac = createHmac('sha256', getNotarySecret());
  mac.update(`pen.notary.v1|${hash}|${notaryTime}`);
  return mac.digest('base64');
}

export function verifyNotaryToken(hash: string, notaryTime: string, notarySig: string): boolean {
  try {
    const expected = Buffer.from(signNotary(hash, notaryTime), 'base64');
    const got = Buffer.from(notarySig, 'base64');
    if (expected.length !== got.length) return false;
    return timingSafeEqual(expected, got);
  } catch {
    return false;
  }
}

async function ensureDriveFolder(
  drive: any,
  name: string,
  parentId: string
): Promise<string> {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  if (list.data.files?.[0]?.id) return list.data.files[0].id as string;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id'
  });
  return created.data.id as string;
}

async function writeDriveFile(
  drive: any,
  parentId: string,
  name: string,
  content: Buffer,
  mimeType = 'application/octet-stream'
): Promise<string> {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
  const list = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  const existingId = list.data.files?.[0]?.id as string | undefined;
  const media = { mimeType, body: Readable.from(content) };
  if (existingId) {
    await drive.files.update({ fileId: existingId, media, fields: 'id' });
    return existingId;
  }
  const created = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media,
    fields: 'id'
  });
  return created.data.id as string;
}

async function readDriveText(
  drive: any,
  parentId: string,
  name: string
): Promise<{ id?: string; text: string }> {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
  const list = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  const id = list.data.files?.[0]?.id as string | undefined;
  if (!id) return { text: '' };
  const got = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'arraybuffer' });
  return { id, text: Buffer.from(got.data as ArrayBuffer).toString('utf8') };
}

async function listChildFolders(drive: any, parentId: string): Promise<Array<{ id: string; name: string }>> {
  const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await drive.files.list({ q, fields: 'files(id,name)', pageSize: 100 });
  return (list.data.files || [])
    .filter((f: { id?: string; name?: string }) => f.id && f.name)
    .map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }));
}

async function moveFolderContents(
  drive: any,
  fromFolderId: string,
  toFolderId: string
): Promise<void> {
  const q = `'${fromFolderId}' in parents and trashed=false`;
  const list = await drive.files.list({ q, fields: 'files(id)', pageSize: 200 });
  for (const f of list.data.files || []) {
    if (!f.id) continue;
    await drive.files.update({
      fileId: f.id,
      addParents: toFolderId,
      removeParents: fromFolderId,
      fields: 'id'
    });
  }
}

async function upsertLibraryIndex(
  drive: any,
  penRootId: string,
  summary: Record<string, unknown>
): Promise<void> {
  const { text } = await readDriveText(drive, penRootId, 'library.index.json');
  let rows: Record<string, unknown>[] = [];
  try {
    rows = text ? (JSON.parse(text) as Record<string, unknown>[]) : [];
    if (!Array.isArray(rows)) rows = [];
  } catch {
    rows = [];
  }
  const docId = String(summary.docId || '');
  rows = rows.filter((r) => String(r.docId || '') !== docId);
  rows.unshift(summary);
  await writeDriveFile(
    drive,
    penRootId,
    'library.index.json',
    Buffer.from(JSON.stringify(rows), 'utf8'),
    'application/json'
  );
}

async function removeFromLibraryIndex(
  drive: any,
  penRootId: string,
  docId: string
): Promise<void> {
  const { text } = await readDriveText(drive, penRootId, 'library.index.json');
  let rows: Record<string, unknown>[] = [];
  try {
    rows = text ? (JSON.parse(text) as Record<string, unknown>[]) : [];
    if (!Array.isArray(rows)) rows = [];
  } catch {
    rows = [];
  }
  const next = rows.filter((r) => String(r.docId || '') !== docId);
  if (next.length === rows.length) {
    // Still rewrite when missing so a partial index stays consistent after trash.
  }
  await writeDriveFile(
    drive,
    penRootId,
    'library.index.json',
    Buffer.from(JSON.stringify(next), 'utf8'),
    'application/json'
  );
}

async function findChildFolderId(
  drive: any,
  parentId: string,
  name: string
): Promise<string | null> {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  return (list.data.files?.[0]?.id as string | undefined) || null;
}

function sanitizeName(s: string): string {
  return String(s || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128) || 'x';
}

type OwnerTokenShape = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
};

function readPollStructureBody(body: { structure?: PollStructure } | undefined): PollStructure | null {
  const raw = body?.structure;
  if (!raw || typeof raw.question !== 'string' || !Array.isArray(raw.options)) return null;
  const options = raw.options
    .filter((option) => option && typeof option.id === 'string' && option.id.trim())
    .map((option) => ({ id: option.id.trim(), label: String(option.label || '') }));
  if (!options.length) return null;
  return {
    question: raw.question,
    options,
    closesAt: raw.closesAt ? String(raw.closesAt) : null,
    correctOptionId: raw.correctOptionId ? String(raw.correctOptionId) : null
  };
}

export function setupPenRoutes(
  app: Application,
  deps: {
    extractAccountId: (account: any) => string | undefined;
    getMetadataFolder: (
      token: OwnerTokenShape,
      pnIdentifier: string,
      accountId?: string
    ) => Promise<{ metadataFolderId?: string; pnFolderId?: string } | null>;
  }
): void {
  setupPollVoteRoutes(app);
  app.post('/api/pen/notary/timestamp', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const hash = String(req.body?.hash || '').trim().toLowerCase();
      if (!/^[a-f0-9]{32,128}$/.test(hash)) {
        return res.status(400).json({ error: 'hash_required' });
      }
      const notaryTime = new Date().toISOString();
      const notarySig = signNotary(hash, notaryTime);
      return res.json({ hash, notaryTime, notarySig });
    } catch (e) {
      safeLogger.warn('[pen/notary] failed', {
        err: e instanceof Error ? e.message : 'unknown'
      });
      return res.status(500).json({ error: safeClientErrorMessage(e, isProduction) });
    }
  });

  /**
   * POST /api/pen/apply-inbound
   * Materialize pen.* jobs into caller's Drive under current/drafts/past.
   */
  app.post('/api/pen/apply-inbound', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const pnForGate = String(req.body?.userPnIdentifier || '').trim() || undefined;
      if (!(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnForGate))) {
        return;
      }

      const jobType = String(req.body?.jobType || '').trim();
      const userPnIdentifier = String(req.body?.userPnIdentifier || '').trim();
      const docId = String(req.body?.docId || '').trim();

      if (!userPnIdentifier || !docId || !(PEN_JOB_TYPES as readonly string[]).includes(jobType)) {
        return res.status(400).json({
          error:
            'userPnIdentifier, docId, and jobType=pen.doc_bootstrap|pen.draft_upsert|pen.publish|pen.comment|pen.suggestion|pen.section_promote|pen.doc_delete|pen.doc_meta|pen.font_upsert|pen.poll_create|pen.poll_structure_put|pen.poll_vote|pen.widget_action required'
        });
      }

      const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
      const submitted = readDeviceCloudResult(req.body);
      if (!submitted) {
        respondCloudOnDevice(res);
        return;
      }
      return res.json({ success: true, jobType, docId, ...submitted });

    } catch (e) {
      safeLogger.warn('[pen/apply-inbound] failed', {
        err: e instanceof Error ? e.message : 'unknown'
      });
      return res.status(500).json({ error: safeClientErrorMessage(e, isProduction) });
    }
  });

  /** Load one doc tree (manifest + current sections + drafts metadata). */
  app.get('/api/pen/docs/:docId', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const userPnIdentifier = String(req.query.userPnIdentifier || '').trim();
      const docId = String(req.params.docId || '').trim();
      if (!userPnIdentifier || !docId) {
        return res.status(400).json({ error: 'userPnIdentifier and docId required' });
      }
      if (
        !(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, userPnIdentifier))
      ) {
        return;
      }
      const credentials = await storageCredentialsService.getCredentials(userPnIdentifier);
      if (!credentials?.credentials) {
        return res.status(404).json({ error: 'User credentials not found' });
      }
      const accounts =
        credentials.credentials.googleDriveAccounts ||
        (credentials.credentials.googleDrive ? [credentials.credentials.googleDrive] : []);
      const account = accounts.length > 0 ? accounts[0] : null;
      let accountId = account ? deps.extractAccountId(account) : undefined;
      let driveToken: GoogleDriveToken;
      try {
        driveToken = { access_token: '' };
        const { respondCloudOnDevice } = await import('./deviceCloudResult');
        respondCloudOnDevice(res);
        return;
      } catch (e) {
        if (respondDriveTokenError(res, e)) return;
        throw e;
      }
    } catch (e) {
      return res.status(500).json({ error: safeClientErrorMessage(e, isProduction) });
    }
  });

  /** List docs from library.index.json (first-party + Drive). */
  app.get('/api/pen/library', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const userPnIdentifier = String(req.query.userPnIdentifier || '').trim();
      if (!userPnIdentifier) {
        return res.status(400).json({ error: 'userPnIdentifier required' });
      }
      if (
        !(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, userPnIdentifier))
      ) {
        return;
      }

      const credentials = await storageCredentialsService.getCredentials(userPnIdentifier);
      if (!credentials?.credentials) {
        return res.status(404).json({ error: 'User credentials not found' });
      }
      const accounts =
        credentials.credentials.googleDriveAccounts ||
        (credentials.credentials.googleDrive ? [credentials.credentials.googleDrive] : []);
      const account = accounts.length > 0 ? accounts[0] : null;
      let accountId = account ? deps.extractAccountId(account) : undefined;
      let driveToken: GoogleDriveToken;
      try {
        driveToken = { access_token: '' };
        const { respondCloudOnDevice } = await import('./deviceCloudResult');
        respondCloudOnDevice(res);
        return;
      } catch (e) {
        if (respondDriveTokenError(res, e)) return;
        throw e;
      }
    } catch (e) {
      return res.status(500).json({ error: safeClientErrorMessage(e, isProduction) });
    }
  });

  app.get('/api/pen/stickers/search', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const key = process.env.GIPHY_API_KEY?.trim();
      if (!key) return res.status(503).json({ error: 'giphy_unconfigured' });
      const q = String(req.query.q || '').trim().slice(0, 50);
      const endpoint = q
        ? `https://api.giphy.com/v1/stickers/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=20&rating=g`
        : `https://api.giphy.com/v1/stickers/trending?api_key=${encodeURIComponent(key)}&limit=20&rating=g`;
      const upstream = await fetch(endpoint);
      if (!upstream.ok) return res.status(502).json({ error: 'giphy_failed' });
      const body = (await upstream.json()) as {
        data?: Array<{ id?: string; title?: string; images?: Record<string, { url?: string }> }>;
      };
      const results = (body.data || [])
        .map((row) => {
          const raw = row.images?.fixed_height?.url || row.images?.original?.url || '';
          let url = '';
          try {
            const parsed = new URL(raw);
            if (
              parsed.protocol === 'https:' &&
              (parsed.hostname === 'giphy.com' || parsed.hostname.endsWith('.giphy.com'))
            ) {
              url = parsed.toString();
            }
          } catch {
            url = '';
          }
          if (!url) return null;
          return { id: String(row.id || url), title: String(row.title || 'Sticker'), url };
        })
        .filter((row): row is { id: string; title: string; url: string } => Boolean(row));
      return res.json({ results });
    } catch (e) {
      return res.status(500).json({ error: safeClientErrorMessage(e, isProduction) });
    }
  });

  app.get('/api/pen/templates', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const { listStarterTemplates, listClasses } = await import('@par-noir/pen-protocol');
      return res.json({
        classes: listClasses(),
        templates: listStarterTemplates()
      });
    } catch (e) {
      return res.status(500).json({ error: safeClientErrorMessage(e, isProduction) });
    }
  });
}
