/**
 * Pen first-party routes: notary (hash-only) + apply-inbound for section promotes.
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

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

function getNotarySecret(): Buffer {
  const raw =
    process.env.PEN_NOTARY_HMAC_SECRET ||
    process.env.PN_OAUTH_JWT_SECRET ||
    '';
  if (!raw || raw.length < 16) {
    // Dev fallback — production must set PEN_NOTARY_HMAC_SECRET
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
  /**
   * POST /api/pen/notary/timestamp
   * Body: { hash: string } — never plaintext. First-party only.
   */
  app.post('/api/pen/notary/timestamp', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      // Hash-only notary — no Drive I/O; first-party Bearer is enough.

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
   * Materialize pen.section_promote | pen.comment | pen.suggestion into caller's Drive.
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

      if (
        !userPnIdentifier ||
        !docId ||
        !['pen.section_promote', 'pen.comment', 'pen.suggestion'].includes(jobType)
      ) {
        return res.status(400).json({
          error:
            'userPnIdentifier, docId, and jobType=pen.section_promote|pen.comment|pen.suggestion required'
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
      const docFolderId = await ensureDriveFolder(drive, String(docId), penRootId);

      if (jobType === 'pen.comment') {
        const comment = req.body?.comment;
        if (!comment?.id || !comment?.body || !comment?.sectionSlug) {
          return res.status(400).json({ error: 'comment_required' });
        }
        const commentsName = 'comments.jsonl';
        const cq = `name='${commentsName}' and '${docFolderId}' in parents and trashed=false`;
        const cl = await drive.files.list({ q: cq, fields: 'files(id)', pageSize: 1 });
        let body = '';
        const existingId = cl.data.files?.[0]?.id as string | undefined;
        if (existingId) {
          const got = await drive.files.get(
            { fileId: existingId, alt: 'media' },
            { responseType: 'arraybuffer' }
          );
          body = Buffer.from(got.data as ArrayBuffer).toString('utf8');
        }
        body += `${JSON.stringify(comment)}\n`;
        await writeDriveFile(
          drive,
          docFolderId,
          commentsName,
          Buffer.from(body, 'utf8'),
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
        const sugFolderId = await ensureDriveFolder(drive, 'suggestions', docFolderId);
        const fileName = `${String(suggestion.id).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 128)}.json`;
        await writeDriveFile(
          drive,
          sugFolderId,
          fileName,
          Buffer.from(JSON.stringify(suggestion), 'utf8'),
          'application/json'
        );

        // Optional accept: also apply section promote if payload present
        const acceptPromote = req.body?.acceptPromote;
        if (acceptPromote?.sectionCiphertextB64 && acceptPromote?.link?.signature) {
          req.body = {
            ...req.body,
            jobType: 'pen.section_promote',
            sectionSlug: acceptPromote.sectionSlug || suggestion.sectionSlug,
            pastName: acceptPromote.pastName,
            sectionCiphertextB64: acceptPromote.sectionCiphertextB64,
            currentRelPath: acceptPromote.currentRelPath,
            pastRelPath: acceptPromote.pastRelPath,
            link: acceptPromote.link,
            contentHash: acceptPromote.contentHash
          };
          // fall through by recursive-style: handle promote below by jumping
        } else {
          safeLogger.info('[pen/apply-inbound] suggestion ok', {
            pn: hashIdentifier(pnIdentifier),
            doc: hashIdentifier(docId)
          });
          return res.json({ ok: true });
        }
      }

      // pen.section_promote (also reached after suggestion accept)
      const sectionSlug = String(req.body?.sectionSlug || '').trim();
      const pastName = req.body?.pastName;
      const sectionCiphertextB64 = req.body?.sectionCiphertextB64;
      const currentRelPath = req.body?.currentRelPath;
      const pastRelPath = req.body?.pastRelPath;
      const link = req.body?.link;

      if (!sectionSlug) {
        return res.status(400).json({ error: 'sectionSlug required' });
      }
      if (!link?.signature || !link?.contentHash) {
        return res.status(400).json({ error: 'promote_link_required' });
      }

      const sectionsId = await ensureDriveFolder(drive, 'sections', docFolderId);
      const sectionFolderId = await ensureDriveFolder(drive, String(sectionSlug), sectionsId);
      const pastFolderId = await ensureDriveFolder(drive, 'past', sectionFolderId);

      if (pastName) {
        const currentName = `${sectionSlug}.pen`;
        const q = `name='${currentName.replace(/'/g, "\\'")}' and '${sectionFolderId}' in parents and trashed=false`;
        const cur = await drive.files.list({ q, fields: 'files(id,name)', pageSize: 1 });
        const curId = cur.data.files?.[0]?.id;
        if (curId) {
          await drive.files.update({
            fileId: curId,
            addParents: pastFolderId,
            removeParents: sectionFolderId,
            requestBody: { name: String(pastName) },
            fields: 'id'
          });
        }
      }

      const cipherBuf = Buffer.from(String(sectionCiphertextB64 || ''), 'base64');
      if (!cipherBuf.length) {
        return res.status(400).json({ error: 'section_ciphertext_required' });
      }
      await writeDriveFile(drive, sectionFolderId, `${sectionSlug}.pen`, cipherBuf);

      const chainName = 'history.chain';
      const chainQ = `name='${chainName}' and '${docFolderId}' in parents and trashed=false`;
      const chainList = await drive.files.list({ q: chainQ, fields: 'files(id)', pageSize: 1 });
      let chainBody = '';
      const chainId = chainList.data.files?.[0]?.id as string | undefined;
      if (chainId) {
        const got = await drive.files.get(
          { fileId: chainId, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        chainBody = Buffer.from(got.data as ArrayBuffer).toString('utf8');
      }
      chainBody += `${JSON.stringify(link)}\n`;
      await writeDriveFile(drive, docFolderId, chainName, Buffer.from(chainBody, 'utf8'), 'application/json');

      safeLogger.info('[pen/apply-inbound] ok', {
        pn: hashIdentifier(pnIdentifier),
        doc: hashIdentifier(String(docId)),
        section: String(sectionSlug).slice(0, 32),
        currentRelPath: currentRelPath ? String(currentRelPath).slice(0, 80) : undefined,
        pastRelPath: pastRelPath ? String(pastRelPath).slice(0, 80) : undefined
      });

      return res.json({ ok: true });
    } catch (e) {
      safeLogger.warn('[pen/apply-inbound] failed', {
        err: e instanceof Error ? e.message : 'unknown'
      });
      return res.status(500).json({ error: safeClientErrorMessage(e, isProduction) });
    }
  });

  /** List starter templates (first-party). */
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
