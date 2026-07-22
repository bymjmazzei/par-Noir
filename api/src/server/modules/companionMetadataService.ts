/**
 * Provider-agnostic companion metadata facade.
 * Portable social cloud → JSON blobs; Google → Sheets.
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
import * as portable from './storage/companionMetadataPortableService';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

export class CompanionMetadataService {
  static async create(
    ownerPn: string,
    fileId: string,
    metadata: CompanionMetadata
  ): Promise<string> {
    const ctx = await getOwnerStorageContext(normalizePn(ownerPn));
    if (!ctx) throw new Error('Storage not connected');
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

  static async exists(ownerPn: string, fileId: string): Promise<boolean> {
    const ctx = await getOwnerStorageContext(normalizePn(ownerPn));
    if (!ctx) return false;
    if (ctx.kind === 'portable') {
      return portable.existsCompanionPortable(ctx.pnIdentifier, fileId, ctx.accountId);
    }
    const id = await CompanionMetadataSheets.findSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      fileId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    return id != null;
  }

  static async read(ownerPn: string, fileId: string): Promise<CompanionMetadata | null> {
    const ctx = await getOwnerStorageContext(normalizePn(ownerPn));
    if (!ctx) return null;
    if (ctx.kind === 'portable') {
      return portable.readCompanionPortable(ctx.pnIdentifier, fileId, ctx.accountId);
    }
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
    patch: Partial<CompanionMetadata>
  ): Promise<void> {
    const ctx = await getOwnerStorageContext(normalizePn(ownerPn));
    if (!ctx) throw new Error('Storage not connected');
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

  static async appendLike(ownerPn: string, fileId: string, like: LikeRecord): Promise<void> {
    const ctx = await getOwnerStorageContext(normalizePn(ownerPn));
    if (!ctx) return;
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

  static async removeLike(ownerPn: string, fileId: string, pnIdentifier: string): Promise<void> {
    const ctx = await getOwnerStorageContext(normalizePn(ownerPn));
    if (!ctx) return;
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
    comment: CommentRecord
  ): Promise<void> {
    const ctx = await getOwnerStorageContext(normalizePn(ownerPn));
    if (!ctx) return;
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

  static async appendShare(ownerPn: string, fileId: string, share: ShareRecord): Promise<void> {
    const ctx = await getOwnerStorageContext(normalizePn(ownerPn));
    if (!ctx) return;
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

  static async appendSave(ownerPn: string, fileId: string, save: SaveRecord): Promise<void> {
    const ctx = await getOwnerStorageContext(normalizePn(ownerPn));
    if (!ctx) return;
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

  static async removeSave(ownerPn: string, fileId: string, pnIdentifier: string): Promise<void> {
    const ctx = await getOwnerStorageContext(normalizePn(ownerPn));
    if (!ctx) return;
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

  static async appendView(ownerPn: string, fileId: string, view: ViewRecord): Promise<void> {
    const ctx = await getOwnerStorageContext(normalizePn(ownerPn));
    if (!ctx) return;
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
