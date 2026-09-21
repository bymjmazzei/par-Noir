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
import { storageCredentialsService } from './storageCredentialsService';
import { safeClientErrorMessage } from '../utils/safeError';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { google } from 'googleapis';
import { Readable } from 'stream';

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

export function setupPenRoutes(
  app: Application,
  deps: {
    extractAccountId: (account: any) => string | undefined;
    getMetadataFolder: (
      token: string,
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
      return res.status(500).json({ error: safeClientErrorMessage(e) });
    }
  });

  /**
   * POST /api/pen/apply-inbound
   * Materialize pen.section_promote into caller's Drive par-noir-pen/ tree.
   */
  app.post('/api/pen/apply-inbound', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const pnForGate = String(req.body?.userPnIdentifier || '').trim() || undefined;
      if (!(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnForGate))) {
        return;
      }

      const {
        userPnIdentifier,
        jobType,
        docId,
        sectionSlug,
        pastName,
        sectionCiphertextB64,
        currentRelPath,
        pastRelPath,
        link
      } = req.body || {};

      if (!userPnIdentifier || jobType !== 'pen.section_promote' || !docId || !sectionSlug) {
        return res.status(400).json({
          error: 'userPnIdentifier, jobType=pen.section_promote, docId, sectionSlug required'
        });
      }

      // Peers must supply a promote link; reject missing sig shape (full ML-DSA verify is client-side on history.chain)
      if (!link?.signature || !link?.contentHash) {
        return res.status(400).json({ error: 'promote_link_required' });
      }

      const pnIdentifier = String(userPnIdentifier);
      const credentials = await storageCredentialsService.getCredentials(pnIdentifier);
      if (!credentials?.credentials) {
        return res.status(404).json({ error: 'User credentials not found' });
      }
      const accounts =
        credentials.credentials.googleDriveAccounts ||
        (credentials.credentials.googleDrive ? [credentials.credentials.googleDrive] : []);
      const account = accounts.length > 0 ? accounts[0] : null;
      let accountId = account ? deps.extractAccountId(account) : undefined;
      let token: string;
      try {
        const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
        token = resolved.token;
        accountId = resolved.accountId ?? accountId;
      } catch (e) {
        if (respondDriveTokenError(res, e)) return;
        throw e;
      }

      const meta = await deps.getMetadataFolder(token, pnIdentifier, accountId);
      if (!meta?.pnFolderId) {
        return res.status(404).json({ error: 'pn_folder_not_found' });
      }

      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: token });
      const drive = google.drive({ version: 'v3', auth });

      const penRootId = await ensureDriveFolder(drive, 'par-noir-pen', meta.pnFolderId);
      const docFolderId = await ensureDriveFolder(drive, String(docId), penRootId);
      const sectionsId = await ensureDriveFolder(drive, 'sections', docFolderId);
      const sectionFolderId = await ensureDriveFolder(drive, String(sectionSlug), sectionsId);
      const pastFolderId = await ensureDriveFolder(drive, 'past', sectionFolderId);

      // Move/copy prior current into past if pastName provided
      if (pastName) {
        const currentName = `${sectionSlug}.pen`;
        const q = `name='${currentName.replace(/'/g, "\\'")}' and '${sectionFolderId}' in parents and trashed=false`;
        const cur = await drive.files.list({ q, fields: 'files(id,name)', pageSize: 1 });
        const curId = cur.data.files?.[0]?.id;
        if (curId) {
          // Download then write to past with dated name (Drive rename+move)
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

      // Append link to history.chain (JSONL)
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
      return res.status(500).json({ error: safeClientErrorMessage(e) });
    }
  });

  /** List starter templates (first-party + usable by SDK via same path when first-party). */
  app.get('/api/pen/templates', async (req: Request, res: Response) => {
    try {
      // Templates are non-secret; still gate to authenticated first-party for v1 consistency
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const { listStarterTemplates } = await import('@par-noir/pen-protocol');
      return res.json({ templates: listStarterTemplates() });
    } catch (e) {
      return res.status(500).json({ error: safeClientErrorMessage(e) });
    }
  });
}

