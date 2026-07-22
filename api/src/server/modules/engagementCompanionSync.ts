/**
 * Best-effort mirror of engagement events to the content owner's companion metadata.
 * Works for Google Sheets and portable JSON social cloud.
 */

import { CompanionMetadataService } from './companionMetadataService';
import type {
  CommentRecord,
  LikeRecord,
  SaveRecord,
  ShareRecord,
  ViewRecord
} from './companionMetadataSheets';
import { hasOwnerStorage } from './storage/ownerStorageContext';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

export type CompanionEngagementKind = 'like' | 'unlike' | 'comment' | 'share' | 'save' | 'unsave' | 'view';

export async function appendOwnerCompanionEngagement(
  fileId: string,
  ownerPn: string,
  kind: CompanionEngagementKind,
  payload: LikeRecord | CommentRecord | ShareRecord | SaveRecord | ViewRecord | { pnIdentifier: string }
): Promise<void> {
  const ownerPnIdentifier = normalizePn(ownerPn);

  try {
    if (!(await hasOwnerStorage(ownerPnIdentifier))) {
      console.warn(
        `[CompanionEngagement] No storage credentials for owner fileId=${fileId}`
      );
      return;
    }

    switch (kind) {
      case 'like':
        await CompanionMetadataService.appendLike(
          ownerPnIdentifier,
          fileId,
          payload as LikeRecord
        );
        break;
      case 'unlike':
        await CompanionMetadataService.removeLike(
          ownerPnIdentifier,
          fileId,
          (payload as { pnIdentifier: string }).pnIdentifier
        );
        break;
      case 'comment':
        await CompanionMetadataService.appendComment(
          ownerPnIdentifier,
          fileId,
          payload as CommentRecord
        );
        break;
      case 'share':
        await CompanionMetadataService.appendShare(
          ownerPnIdentifier,
          fileId,
          payload as ShareRecord
        );
        break;
      case 'save':
        await CompanionMetadataService.appendSave(
          ownerPnIdentifier,
          fileId,
          payload as SaveRecord
        );
        break;
      case 'unsave':
        await CompanionMetadataService.removeSave(
          ownerPnIdentifier,
          fileId,
          (payload as { pnIdentifier: string }).pnIdentifier
        );
        break;
      case 'view':
        await CompanionMetadataService.appendView(
          ownerPnIdentifier,
          fileId,
          payload as ViewRecord
        );
        break;
      default:
        break;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[CompanionEngagement] Failed to update companion metadata fileId=${fileId}:`,
      message
    );
  }
}

/** @deprecated Use appendOwnerCompanionEngagement(fileId, ownerPn, kind, payload) */
export type CompanionAppendFn = (
  ...args: unknown[]
) => Promise<void>;
