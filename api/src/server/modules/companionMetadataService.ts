/**
 * Provider-agnostic companion metadata facade.
 * Portable social cloud → JSON blobs; Google → Sheets.
 * Google writes require accessToken (fail closed). Probes without AT return false/null.
 */

import {
  CompanionMetadataSheets,
  type CompanionMetadata,
  type CommentRecord,
  type LikeRecord,
  type SaveRecord,
  type ShareRecord,
  type ViewRecord
} from './companionMetadataSheets';
import { getOwnerStorageContext } from './storage/ownerStorageContext';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import * as portable from './storage/companionMetadataPortableService';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

function requireCtx(
  ctx: Awaited<ReturnType<typeof getOwnerStorageContext>>,
  accessToken?: string
): NonNullable<Awaited<ReturnType<typeof getOwnerStorageContext>>> {
  if (!ctx) {
    throw Object.assign(
      new Error(accessToken ? 'Storage not connected' : 'Google Drive access token required'),
      { code: accessToken ? 'STORAGE_NOT_CONNECTED' : 'CLOUD_TOKEN_REQUIRED' }
    );
  }
  return ctx;
}

export class CompanionMetadataService {
  static async create(
    ownerPn: string,
    fileId: string,
    metadata: CompanionMetadata,
    accessToken?: string
  ): Promise<string> {
    const ctx = requireCtx(
      await getOwnerStorageContext(normalizePn(ownerPn), { accessToken }),
      accessToken
    );
    if (ctx.kind === 'portable') {
      return portable.createCompanionPortable(ctx.pnIdentifier, fileId, metadata, ctx.accountId);
    }
    return CompanionMetadataSheets.createSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      fileId,
      metadata,
      ctx.pnIdentifier,
      ctx.accountId
    );
  }

  /** Probe: portable without AT; Google requires AT (else false). */
  static async exists(ownerPn: string, fileId: string, accessToken?: string): Promise<boolean> {
    const pn = normalizePn(ownerPn);
    if (await isPortableStorageProvider(pn)) {
      return portable.existsCompanionPortable(pn, fileId, undefined);
    }
    if (!String(accessToken || '').trim()) return false;
    const ctx = await getOwnerStorageContext(pn, { accessToken });
    if (!ctx || ctx.kind !== 'google_drive') return false;
    const id = await CompanionMetadataSheets.findSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      fileId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    return id != null;
  }

  /** Probe: portable without AT; Google requires AT (else null). */
  static async read(
    ownerPn: string,
    fileId: string,
    accessToken?: string
  ): Promise<CompanionMetadata | null> {
    const pn = normalizePn(ownerPn);
    if (await isPortableStorageProvider(pn)) {
      return portable.readCompanionPortable(pn, fileId, undefined);
    }
    if (!String(accessToken || '').trim()) return null;
    const ctx = await getOwnerStorageContext(pn, { accessToken });
    if (!ctx || ctx.kind !== 'google_drive') return null;
    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      fileId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    if (!spreadsheetId) return null;
    return CompanionMetadataSheets.readMetadata(
      ctx.token,
      spreadsheetId,
      ctx.pnIdentifier,
      ctx.accountId
    );
  }

  static async update(
    ownerPn: string,
    fileId: string,
    patch: Partial<CompanionMetadata>,
    accessToken?: string
  ): Promise<void> {
    const ctx = requireCtx(
      await getOwnerStorageContext(normalizePn(ownerPn), { accessToken }),
      accessToken
    );
    if (ctx.kind === 'portable') {
      await portable.updateCompanionPortable(ctx.pnIdentifier, fileId, patch, ctx.accountId);
      return;
    }
    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      fileId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    if (!spreadsheetId) throw new Error(`Companion metadata not found for ${fileId}`);
    await CompanionMetadataSheets.updateMetadata(
      ctx.token,
      spreadsheetId,
      patch,
      ctx.pnIdentifier,
      ctx.accountId
    );
  }

  static async appendLike(ownerPn: string, fileId: string, like: LikeRecord, accessToken?: string): Promise<void> {
    const ctx = requireCtx(
      await getOwnerStorageContext(normalizePn(ownerPn), { accessToken }),
      accessToken
    );
    if (ctx.kind === 'portable') {
      await portable.appendLikePortable(ctx.pnIdentifier, fileId, like, ctx.accountId);
      return;
    }
    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      fileId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    if (!spreadsheetId) return;
    await CompanionMetadataSheets.appendLike(
      ctx.token,
      spreadsheetId,
      like,
      ctx.pnIdentifier,
      ctx.accountId
    );
  }

  static async removeLike(ownerPn: string, fileId: string, pnIdentifier: string, accessToken?: string): Promise<void> {
    const ctx = requireCtx(
      await getOwnerStorageContext(normalizePn(ownerPn), { accessToken }),
      accessToken
    );
    if (ctx.kind === 'portable') {
      await portable.removeLikePortable(ctx.pnIdentifier, fileId, pnIdentifier, ctx.accountId);
      return;
    }
    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      fileId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    if (!spreadsheetId) return;
    await CompanionMetadataSheets.removeLike(
      ctx.token,
      spreadsheetId,
      fileId,
      pnIdentifier,
      ctx.pnIdentifier,
      ctx.accountId
    );
  }

  static async appendComment(
    ownerPn: string,
    fileId: string,
    comment: CommentRecord,
    accessToken?: string
  ): Promise<void> {
    const ctx = requireCtx(
      await getOwnerStorageContext(normalizePn(ownerPn), { accessToken }),
      accessToken
    );
    if (ctx.kind === 'portable') {
      await portable.appendCommentPortable(ctx.pnIdentifier, fileId, comment, ctx.accountId);
      return;
    }
    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      fileId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    if (!spreadsheetId) return;
    await CompanionMetadataSheets.appendComment(
      ctx.token,
      spreadsheetId,
      comment,
      ctx.pnIdentifier,
      ctx.accountId
    );
  }

  static async appendShare(ownerPn: string, fileId: string, share: ShareRecord, accessToken?: string): Promise<void> {
    const ctx = requireCtx(
      await getOwnerStorageContext(normalizePn(ownerPn), { accessToken }),
      accessToken
    );
    if (ctx.kind === 'portable') {
      await portable.appendSharePortable(ctx.pnIdentifier, fileId, share, ctx.accountId);
      return;
    }
    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      fileId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    if (!spreadsheetId) return;
    await CompanionMetadataSheets.appendShare(
      ctx.token,
      spreadsheetId,
      share,
      ctx.pnIdentifier,
      ctx.accountId
    );
  }

  static async appendSave(ownerPn: string, fileId: string, save: SaveRecord, accessToken?: string): Promise<void> {
    const ctx = requireCtx(
      await getOwnerStorageContext(normalizePn(ownerPn), { accessToken }),
      accessToken
    );
    if (ctx.kind === 'portable') {
      await portable.appendSavePortable(ctx.pnIdentifier, fileId, save, ctx.accountId);
      return;
    }
    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      fileId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    if (!spreadsheetId) return;
    await CompanionMetadataSheets.appendSave(
      ctx.token,
      spreadsheetId,
      save,
      ctx.pnIdentifier,
      ctx.accountId
    );
  }

  static async removeSave(ownerPn: string, fileId: string, pnIdentifier: string, accessToken?: string): Promise<void> {
    const ctx = requireCtx(
      await getOwnerStorageContext(normalizePn(ownerPn), { accessToken }),
      accessToken
    );
    if (ctx.kind === 'portable') {
      await portable.removeSavePortable(ctx.pnIdentifier, fileId, pnIdentifier, ctx.accountId);
      return;
    }
    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      fileId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    if (!spreadsheetId) return;
    await CompanionMetadataSheets.removeSave(
      ctx.token,
      spreadsheetId,
      fileId,
      pnIdentifier,
      ctx.pnIdentifier,
      ctx.accountId
    );
  }

  static async appendView(ownerPn: string, fileId: string, view: ViewRecord, accessToken?: string): Promise<void> {
    const ctx = requireCtx(
      await getOwnerStorageContext(normalizePn(ownerPn), { accessToken }),
      accessToken
    );
    if (ctx.kind === 'portable') {
      await portable.appendViewPortable(ctx.pnIdentifier, fileId, view, ctx.accountId);
      return;
    }
    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      fileId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    if (!spreadsheetId) return;
    await CompanionMetadataSheets.appendView(
      ctx.token,
      spreadsheetId,
      view,
      ctx.pnIdentifier,
      ctx.accountId
    );
  }
}
