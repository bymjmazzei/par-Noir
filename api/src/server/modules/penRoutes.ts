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
import { resolveOwnerDriveToken, respondDriveTokenError } from './ownerDriveToken';
import type { GoogleDriveToken } from './googleOAuth2Helper';
import { storageCredentialsService } from './storageCredentialsService';
import { safeClientErrorMessage } from '../utils/safeError';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { verifyPromoteLink, type PenPromoteLink } from '@par-noir/pen-protocol';

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
  'pen.font_upsert'
] as const;

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
            'userPnIdentifier, docId, and jobType=pen.doc_bootstrap|pen.draft_upsert|pen.publish|pen.comment|pen.suggestion|pen.section_promote|pen.doc_delete|pen.doc_meta|pen.font_upsert required'
        });
      }

      const pnIdentifier = userPnIdentifier;
      const credentials = await storageCredentialsService.getCredentials(pnIdentifier);
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
        const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
        driveToken = resolved.token;
        accountId = resolved.accountId ?? accountId;
      } catch (e) {
        if (respondDriveTokenError(res, e)) return;
        throw e;
      }

      const accessToken = String(driveToken.access_token || '').trim();
      if (!accessToken) {
        return res.status(409).json({ error: 'cloud_token_required' });
      }

      const meta = await deps.getMetadataFolder(driveToken, pnIdentifier, accountId);
      if (!meta?.pnFolderId) {
        return res.status(404).json({ error: 'pn_folder_not_found' });
      }

      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: 'v3', auth });

      const penRootId = await ensureDriveFolder(drive, 'par-noir-pen', meta.pnFolderId);

      if (jobType === 'pen.doc_delete') {
        await removeFromLibraryIndex(drive, penRootId, docId);
        const existingDocFolderId = await findChildFolderId(drive, penRootId, String(docId));
        if (existingDocFolderId) {
          await drive.files.update({
            fileId: existingDocFolderId,
            requestBody: { trashed: true }
          });
        }
        safeLogger.info('[pen/apply-inbound] doc_delete ok', {
          pn: hashIdentifier(pnIdentifier),
          doc: hashIdentifier(docId)
        });
        return res.json({ ok: true });
      }

      if (jobType === 'pen.doc_meta') {
        const title =
          req.body?.title != null ? String(req.body.title).trim() : undefined;
        const folderId =
          req.body?.folderId === null
            ? null
            : req.body?.folderId != null
              ? String(req.body.folderId)
              : undefined;
        const galleryPreviewRef =
          req.body?.galleryPreviewRef != null
            ? String(req.body.galleryPreviewRef)
            : undefined;
        const galleryPreviewKind =
          req.body?.galleryPreviewKind === 'image' || req.body?.galleryPreviewKind === 'video'
            ? (req.body.galleryPreviewKind as 'image' | 'video')
            : undefined;
        const galleryPreviewPosterRef =
          req.body?.galleryPreviewPosterRef != null
            ? String(req.body.galleryPreviewPosterRef)
            : undefined;
        const galleryPreviewCommitHash =
          req.body?.galleryPreviewCommitHash != null
            ? String(req.body.galleryPreviewCommitHash)
            : undefined;
        const patchGallery =
          galleryPreviewRef !== undefined ||
          galleryPreviewKind !== undefined ||
          galleryPreviewPosterRef !== undefined ||
          galleryPreviewCommitHash !== undefined;
        const { text } = await readDriveText(drive, penRootId, 'library.index.json');
        let rows: Record<string, unknown>[] = [];
        try {
          rows = text ? (JSON.parse(text) as Record<string, unknown>[]) : [];
          if (!Array.isArray(rows)) rows = [];
        } catch {
          rows = [];
        }
        const idx = rows.findIndex((r) => String(r.docId || '') === docId);
        if (idx < 0) {
          return res.status(404).json({ error: 'doc_not_in_library_index' });
        }
        const next = { ...rows[idx] } as Record<string, unknown>;
        if (title !== undefined) next.title = title || 'Untitled';
        if (folderId !== undefined) next.folderId = folderId;
        next.updatedAt = new Date().toISOString();
        rows[idx] = next;
        await writeDriveFile(
          drive,
          penRootId,
          'library.index.json',
          Buffer.from(JSON.stringify(rows), 'utf8'),
          'application/json'
        );
        // Patch doc.json title / gallery preview when provided
        if (title !== undefined || patchGallery || folderId !== undefined) {
          const existingDocFolderId = await findChildFolderId(drive, penRootId, String(docId));
          if (existingDocFolderId) {
            const { text: manifestText } = await readDriveText(
              drive,
              existingDocFolderId,
              'doc.json'
            );
            if (manifestText) {
              try {
                const manifest = JSON.parse(manifestText) as Record<string, unknown>;
                if (title !== undefined) manifest.title = title || 'Untitled';
                if (folderId !== undefined) manifest.folderId = folderId;
                if (galleryPreviewRef !== undefined) manifest.galleryPreviewRef = galleryPreviewRef;
                if (galleryPreviewKind !== undefined) {
                  manifest.galleryPreviewKind = galleryPreviewKind;
                }
                if (galleryPreviewPosterRef !== undefined) {
                  manifest.galleryPreviewPosterRef = galleryPreviewPosterRef;
                }
                if (galleryPreviewCommitHash !== undefined) {
                  manifest.galleryPreviewCommitHash = galleryPreviewCommitHash;
                }
                manifest.updatedAt = next.updatedAt;
                await writeDriveFile(
                  drive,
                  existingDocFolderId,
                  'doc.json',
                  Buffer.from(JSON.stringify(manifest), 'utf8'),
                  'application/json'
                );
              } catch {
                /* ignore corrupt manifest */
              }
            }
          }
        }
        safeLogger.info('[pen/apply-inbound] doc_meta ok', {
          pn: hashIdentifier(pnIdentifier),
          doc: hashIdentifier(docId)
        });
        return res.json({ ok: true });
      }

      const docFolderId = await ensureDriveFolder(drive, String(docId), penRootId);
      const currentId = await ensureDriveFolder(drive, 'current', docFolderId);
      const draftsId = await ensureDriveFolder(drive, 'drafts', docFolderId);
      const pastRootId = await ensureDriveFolder(drive, 'past', docFolderId);

      if (jobType === 'pen.font_upsert') {
        const fontId = String(req.body?.fontId || '').trim();
        const fontCiphertextB64 = String(req.body?.fontCiphertextB64 || '');
        if (!fontId || !fontCiphertextB64) {
          return res.status(400).json({ error: 'fontId_and_fontCiphertextB64_required' });
        }
        const fontsDirId = await ensureDriveFolder(drive, 'fonts', docFolderId);
        const buf = Buffer.from(fontCiphertextB64, 'base64');
        if (!buf.length) {
          return res.status(400).json({ error: 'font_ciphertext_empty' });
        }
        // Opaque only — never write plain TTF/OTF MIME or extension.
        await writeDriveFile(
          drive,
          fontsDirId,
          `${sanitizeName(fontId)}.penfont`,
          buf,
          'application/octet-stream'
        );
        safeLogger.info('[pen/apply-inbound] font_upsert ok', {
          pn: hashIdentifier(pnIdentifier),
          doc: hashIdentifier(docId),
          font: hashIdentifier(fontId)
        });
        return res.json({ ok: true });
      }

      if (jobType === 'pen.doc_bootstrap') {
        const manifest = req.body?.manifest;
        const draft = req.body?.draft;
        const sectionCiphertextsB64 = (req.body?.sectionCiphertextsB64 || {}) as Record<
          string,
          string
        >;
        if (!manifest?.docId || !draft?.draftId) {
          return res.status(400).json({ error: 'manifest_and_draft_required' });
        }
        await writeDriveFile(
          drive,
          docFolderId,
          'doc.json',
          Buffer.from(JSON.stringify(manifest), 'utf8'),
          'application/json'
        );
        const draftFolderId = await ensureDriveFolder(
          drive,
          sanitizeName(String(draft.draftId)),
          draftsId
        );
        await writeDriveFile(
          drive,
          draftFolderId,
          'draft.json',
          Buffer.from(JSON.stringify(draft), 'utf8'),
          'application/json'
        );
        for (const [slug, b64] of Object.entries(sectionCiphertextsB64)) {
          const buf = Buffer.from(String(b64 || ''), 'base64');
          if (!buf.length) continue;
          await writeDriveFile(drive, draftFolderId, `${sanitizeName(slug)}.pen`, buf);
        }
        if (req.body?.chain) {
          await writeDriveFile(
            drive,
            docFolderId,
            'history.chain',
            Buffer.from(JSON.stringify(req.body.chain), 'utf8'),
            'application/json'
          );
        }
        await upsertLibraryIndex(drive, penRootId, {
          docId: manifest.docId,
          title: manifest.title,
          templateId: manifest.templateId,
          classId: manifest.classId,
          updatedAt: manifest.updatedAt,
          folderId: manifest.folderId ?? null,
          lifecycle: manifest.lifecycle || 'draft'
        });
        safeLogger.info('[pen/apply-inbound] bootstrap ok', {
          pn: hashIdentifier(pnIdentifier),
          doc: hashIdentifier(docId)
        });
        return res.json({ ok: true });
      }

      if (jobType === 'pen.draft_upsert') {
        const draft = req.body?.draft;
        const sectionCiphertextsB64 = (req.body?.sectionCiphertextsB64 || {}) as Record<
          string,
          string
        >;
        if (!draft?.draftId) {
          return res.status(400).json({ error: 'draft_required' });
        }
        const draftFolderId = await ensureDriveFolder(
          drive,
          sanitizeName(String(draft.draftId)),
          draftsId
        );
        await writeDriveFile(
          drive,
          draftFolderId,
          'draft.json',
          Buffer.from(JSON.stringify(draft), 'utf8'),
          'application/json'
        );
        for (const [slug, b64] of Object.entries(sectionCiphertextsB64)) {
          const buf = Buffer.from(String(b64 || ''), 'base64');
          if (!buf.length) continue;
          await writeDriveFile(drive, draftFolderId, `${sanitizeName(slug)}.pen`, buf);
        }
        if (req.body?.manifest) {
          await writeDriveFile(
            drive,
            docFolderId,
            'doc.json',
            Buffer.from(JSON.stringify(req.body.manifest), 'utf8'),
            'application/json'
          );
        }
        safeLogger.info('[pen/apply-inbound] draft_upsert ok', {
          pn: hashIdentifier(pnIdentifier),
          doc: hashIdentifier(docId)
        });
        return res.json({ ok: true });
      }

      if (jobType === 'pen.publish') {
        const versionId = sanitizeName(String(req.body?.versionId || `v-${Date.now()}`));
        const sectionCiphertextsB64 = (req.body?.sectionCiphertextsB64 || {}) as Record<
          string,
          string
        >;
        const link = req.body?.link as PenPromoteLink | undefined;
        if (link?.signature) {
          if (!verifyPromoteLink(link)) {
            return res.status(400).json({ error: 'promote_sig_invalid' });
          }
        }

        const existingCurrent = await listChildFolders(drive, currentId).catch(() => []);
        void existingCurrent;
        // Move current files into past/{versionId}
        const pastVersionId = await ensureDriveFolder(drive, versionId, pastRootId);
        await moveFolderContents(drive, currentId, pastVersionId);

        for (const [slug, b64] of Object.entries(sectionCiphertextsB64)) {
          const buf = Buffer.from(String(b64 || ''), 'base64');
          if (!buf.length) continue;
          await writeDriveFile(drive, currentId, `${sanitizeName(slug)}.pen`, buf);
        }

        if (req.body?.manifest) {
          const manifest = {
            ...req.body.manifest,
            lifecycle: 'published',
            updatedAt: new Date().toISOString()
          };
          await writeDriveFile(
            drive,
            docFolderId,
            'doc.json',
            Buffer.from(JSON.stringify(manifest), 'utf8'),
            'application/json'
          );
          await upsertLibraryIndex(drive, penRootId, {
            docId: manifest.docId,
            title: manifest.title,
            templateId: manifest.templateId,
            classId: manifest.classId,
            updatedAt: manifest.updatedAt,
            folderId: manifest.folderId ?? null,
            lifecycle: 'published'
          });
        }

        if (link) {
          const { text: chainBody } = await readDriveText(drive, docFolderId, 'history.chain');
          let next = chainBody;
          try {
            const parsed = chainBody ? JSON.parse(chainBody) : null;
            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.links)) {
              parsed.links.push(link);
              next = JSON.stringify(parsed);
            } else {
              next = `${chainBody}${chainBody && !chainBody.endsWith('\n') ? '\n' : ''}${JSON.stringify(link)}\n`;
            }
          } catch {
            next = `${chainBody}${JSON.stringify(link)}\n`;
          }
          await writeDriveFile(
            drive,
            docFolderId,
            'history.chain',
            Buffer.from(next, 'utf8'),
            'application/json'
          );
        }

        if (req.body?.sourceDraftId) {
          const draftFolderId = await ensureDriveFolder(
            drive,
            sanitizeName(String(req.body.sourceDraftId)),
            draftsId
          );
          const { text: draftText } = await readDriveText(drive, draftFolderId, 'draft.json');
          if (draftText) {
            try {
              const draft = JSON.parse(draftText) as Record<string, unknown>;
              draft.status = 'accepted';
              await writeDriveFile(
                drive,
                draftFolderId,
                'draft.json',
                Buffer.from(JSON.stringify(draft), 'utf8'),
                'application/json'
              );
            } catch {
              /* ignore */
            }
          }
        }

        safeLogger.info('[pen/apply-inbound] publish ok', {
          pn: hashIdentifier(pnIdentifier),
          doc: hashIdentifier(docId),
          version: versionId.slice(0, 32)
        });
        return res.json({ ok: true });
      }

      if (jobType === 'pen.comment') {
        const comment = req.body?.comment;
        if (!comment?.id || !comment?.body || !comment?.sectionSlug) {
          return res.status(400).json({ error: 'comment_required' });
        }
        const { text: body } = await readDriveText(drive, docFolderId, 'comments.jsonl');
        const next = `${body}${JSON.stringify(comment)}\n`;
        await writeDriveFile(
          drive,
          docFolderId,
          'comments.jsonl',
          Buffer.from(next, 'utf8'),
          'application/json'
        );
        safeLogger.info('[pen/apply-inbound] comment ok', {
          pn: hashIdentifier(pnIdentifier),
          doc: hashIdentifier(docId)
        });
        return res.json({ ok: true });
      }

      if (jobType === 'pen.suggestion') {
        const suggestion = req.body?.suggestion;
        if (!suggestion?.id || !suggestion?.sectionSlug || !suggestion?.proposedDoc) {
          return res.status(400).json({ error: 'suggestion_required' });
        }
        // Suggestions are drafts submitted for review — store under drafts/{id} with status submitted
        const draftFolderId = await ensureDriveFolder(
          drive,
          sanitizeName(String(suggestion.id)),
          draftsId
        );
        const draftManifest = {
          draftId: suggestion.id,
          docId,
          authorPnHash: suggestion.authorPnHash,
          createdAt: suggestion.createdAt,
          updatedAt: suggestion.createdAt,
          status: suggestion.status === 'pending' ? 'submitted' : suggestion.status,
          toc: [suggestion.sectionSlug],
          summary: suggestion.summary
        };
        await writeDriveFile(
          drive,
          draftFolderId,
          'draft.json',
          Buffer.from(JSON.stringify(draftManifest), 'utf8'),
          'application/json'
        );
        const sectionBody = Buffer.from(
          JSON.stringify({
            slug: suggestion.sectionSlug,
            doc: suggestion.proposedDoc
          }),
          'utf8'
        );
        await writeDriveFile(
          drive,
          draftFolderId,
          `${sanitizeName(String(suggestion.sectionSlug))}.pen`,
          sectionBody
        );

        const acceptPromote = req.body?.acceptPromote;
        if (acceptPromote?.sectionCiphertextsB64 || acceptPromote?.sectionCiphertextB64) {
          // Fall through by rewriting body for publish
          req.body = {
            ...req.body,
            jobType: 'pen.publish',
            versionId: acceptPromote.versionId || `accept-${Date.now()}`,
            sectionCiphertextsB64:
              acceptPromote.sectionCiphertextsB64 ||
              (acceptPromote.sectionCiphertextB64
                ? {
                    [String(acceptPromote.sectionSlug || suggestion.sectionSlug)]:
                      acceptPromote.sectionCiphertextB64
                  }
                : {}),
            link: acceptPromote.link,
            sourceDraftId: suggestion.id,
            manifest: acceptPromote.manifest || req.body.manifest
          };
          // Recursive handle via inline publish logic would duplicate — re-post style:
          // jump by setting jobType and continuing is messy; call publish path via goto
        } else {
          safeLogger.info('[pen/apply-inbound] suggestion ok', {
            pn: hashIdentifier(pnIdentifier),
            doc: hashIdentifier(docId)
          });
          return res.json({ ok: true });
        }

        // Accept-as-publish
        if (req.body.jobType === 'pen.publish') {
          const versionId = sanitizeName(String(req.body?.versionId || `v-${Date.now()}`));
          const sectionCiphertextsB64 = (req.body?.sectionCiphertextsB64 || {}) as Record<
            string,
            string
          >;
          const link = req.body?.link as PenPromoteLink | undefined;
          if (link?.signature && !verifyPromoteLink(link)) {
            return res.status(400).json({ error: 'promote_sig_invalid' });
          }
          const pastVersionFolder = await ensureDriveFolder(drive, versionId, pastRootId);
          await moveFolderContents(drive, currentId, pastVersionFolder);
          for (const [slug, b64] of Object.entries(sectionCiphertextsB64)) {
            const buf = Buffer.from(String(b64 || ''), 'base64');
            if (!buf.length) continue;
            await writeDriveFile(drive, currentId, `${sanitizeName(slug)}.pen`, buf);
          }
          if (req.body?.manifest) {
            const manifest = {
              ...req.body.manifest,
              lifecycle: 'published',
              updatedAt: new Date().toISOString()
            };
            await writeDriveFile(
              drive,
              docFolderId,
              'doc.json',
              Buffer.from(JSON.stringify(manifest), 'utf8'),
              'application/json'
            );
          }
          safeLogger.info('[pen/apply-inbound] suggestion accept→publish ok', {
            pn: hashIdentifier(pnIdentifier),
            doc: hashIdentifier(docId)
          });
          return res.json({ ok: true });
        }
      }

      // pen.section_promote — write into current/ (legacy + accept path)
      const sectionSlug = String(req.body?.sectionSlug || '').trim();
      const sectionCiphertextB64 = req.body?.sectionCiphertextB64;
      const link = req.body?.link as PenPromoteLink | undefined;

      if (!sectionSlug) {
        return res.status(400).json({ error: 'sectionSlug required' });
      }
      if (!link?.signature || !link?.contentHash) {
        return res.status(400).json({ error: 'promote_link_required' });
      }
      if (!verifyPromoteLink(link)) {
        return res.status(400).json({ error: 'promote_sig_invalid' });
      }

      const pastName = String(req.body?.pastName || link.pastName || '').trim();
      if (pastName) {
        const pastVersionFolder = await ensureDriveFolder(
          drive,
          sanitizeName(pastName.replace(/\.pen$/i, '')),
          pastRootId
        );
        const currentName = `${sanitizeName(sectionSlug)}.pen`;
        const q = `name='${currentName.replace(/'/g, "\\'")}' and '${currentId}' in parents and trashed=false`;
        const cur = await drive.files.list({ q, fields: 'files(id,name)', pageSize: 1 });
        const curFileId = cur.data.files?.[0]?.id;
        if (curFileId) {
          await drive.files.update({
            fileId: curFileId,
            addParents: pastVersionFolder,
            removeParents: currentId,
            requestBody: { name: currentName },
            fields: 'id'
          });
        }
      }

      const cipherBuf = Buffer.from(String(sectionCiphertextB64 || ''), 'base64');
      if (!cipherBuf.length) {
        return res.status(400).json({ error: 'section_ciphertext_required' });
      }
      await writeDriveFile(drive, currentId, `${sanitizeName(sectionSlug)}.pen`, cipherBuf);

      const { text: chainBody } = await readDriveText(drive, docFolderId, 'history.chain');
      let nextChain = chainBody;
      try {
        const parsed = chainBody ? JSON.parse(chainBody) : null;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.links)) {
          parsed.links.push(link);
          nextChain = JSON.stringify(parsed);
        } else {
          nextChain = `${chainBody}${chainBody && !chainBody.endsWith('\n') ? '\n' : ''}${JSON.stringify(link)}\n`;
        }
      } catch {
        nextChain = `${chainBody}${JSON.stringify(link)}\n`;
      }
      await writeDriveFile(
        drive,
        docFolderId,
        'history.chain',
        Buffer.from(nextChain, 'utf8'),
        'application/json'
      );

      safeLogger.info('[pen/apply-inbound] section_promote ok', {
        pn: hashIdentifier(pnIdentifier),
        doc: hashIdentifier(String(docId)),
        section: String(sectionSlug).slice(0, 32)
      });

      return res.json({ ok: true });
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
        const resolved = await resolveOwnerDriveToken(req, userPnIdentifier, { account, accountId });
        driveToken = resolved.token;
        accountId = resolved.accountId ?? accountId;
      } catch (e) {
        if (respondDriveTokenError(res, e)) return;
        throw e;
      }
      const accessToken = String(driveToken.access_token || '').trim();
      if (!accessToken) {
        return res.status(409).json({ error: 'cloud_token_required' });
      }
      const meta = await deps.getMetadataFolder(driveToken, userPnIdentifier, accountId);
      if (!meta?.pnFolderId) {
        return res.status(404).json({ error: 'pn_folder_not_found' });
      }
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: 'v3', auth });
      const penRootId = await ensureDriveFolder(drive, 'par-noir-pen', meta.pnFolderId);
      const qDoc = `name='${docId.replace(/'/g, "\\'")}' and '${penRootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const docList = await drive.files.list({ q: qDoc, fields: 'files(id)', pageSize: 1 });
      const docFolderId = docList.data.files?.[0]?.id as string | undefined;
      if (!docFolderId) {
        return res.status(404).json({ error: 'doc_not_found' });
      }
      const { text: manifestText } = await readDriveText(drive, docFolderId, 'doc.json');
      if (!manifestText) {
        return res.status(404).json({ error: 'manifest_not_found' });
      }
      const manifest = JSON.parse(manifestText);
      const { text: chainText } = await readDriveText(drive, docFolderId, 'history.chain');
      let chain = null;
      try {
        chain = chainText ? JSON.parse(chainText) : null;
      } catch {
        chain = { docId, genesis: manifest.genesisProof, links: [] };
      }
      const currentId = await ensureDriveFolder(drive, 'current', docFolderId);
      const curFiles = await drive.files.list({
        q: `'${currentId}' in parents and trashed=false`,
        fields: 'files(id,name)',
        pageSize: 100
      });
      // Opaque .pen bodies — client decrypts with docKey (or legacy JSON parse).
      const currentSections: Array<{ slug: string; ciphertext: string }> = [];
      for (const f of curFiles.data.files || []) {
        if (!f.id || !f.name?.endsWith('.pen')) continue;
        const got = await drive.files.get(
          { fileId: f.id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        const raw = Buffer.from(got.data as ArrayBuffer).toString('utf8');
        const slug = String(f.name).replace(/\.pen$/i, '');
        currentSections.push({ slug, ciphertext: raw });
      }
      const draftsId = await ensureDriveFolder(drive, 'drafts', docFolderId);
      const draftFolders = await listChildFolders(drive, draftsId);
      const drafts: unknown[] = [];
      for (const df of draftFolders) {
        const { text: dtext } = await readDriveText(drive, df.id, 'draft.json');
        if (!dtext) continue;
        try {
          const draft = JSON.parse(dtext);
          const secFiles = await drive.files.list({
            q: `'${df.id}' in parents and trashed=false`,
            fields: 'files(id,name)',
            pageSize: 50
          });
          const sections: Array<{ slug: string; ciphertext: string }> = [];
          for (const sf of secFiles.data.files || []) {
            if (!sf.id || !sf.name?.endsWith('.pen')) continue;
            const got = await drive.files.get(
              { fileId: sf.id, alt: 'media' },
              { responseType: 'arraybuffer' }
            );
            const raw = Buffer.from(got.data as ArrayBuffer).toString('utf8');
            const slug = String(sf.name).replace(/\.pen$/i, '');
            sections.push({ slug, ciphertext: raw });
          }
          drafts.push({ draft, sections });
        } catch {
          /* skip */
        }
      }
      return res.json({ manifest, chain, currentSections, drafts });
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
        const resolved = await resolveOwnerDriveToken(req, userPnIdentifier, { account, accountId });
        driveToken = resolved.token;
        accountId = resolved.accountId ?? accountId;
      } catch (e) {
        if (respondDriveTokenError(res, e)) return;
        throw e;
      }
      const accessToken = String(driveToken.access_token || '').trim();
      if (!accessToken) {
        return res.status(409).json({ error: 'cloud_token_required' });
      }
      const meta = await deps.getMetadataFolder(driveToken, userPnIdentifier, accountId);
      if (!meta?.pnFolderId) {
        return res.json({ docs: [] });
      }
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: 'v3', auth });
      const penRootId = await ensureDriveFolder(drive, 'par-noir-pen', meta.pnFolderId);
      const { text } = await readDriveText(drive, penRootId, 'library.index.json');
      let docs: unknown[] = [];
      try {
        docs = text ? JSON.parse(text) : [];
        if (!Array.isArray(docs)) docs = [];
      } catch {
        docs = [];
      }
      return res.json({ docs });
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
