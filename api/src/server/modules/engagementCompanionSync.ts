/**
 * Best-effort mirror of engagement events to the content owner's companion metadata.
 * Under device cloud custody the server holds no owner AT — companion Drive writes
 * soft-no-op here (owner device must apply via mailbox/apply-inbound if product needs them).
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
import { isDeviceCloudCustodyEnabled } from './socialMailboxService';
import { hashIdentifier, safeLogger } from '../../utils/logger';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

export type CompanionEngagementKind = 'like' | 'unlike' | 'comment' | 'share' | 'save' | 'unsave' | 'view';

export async function appendOwnerCompanionEngagement(
  fileId: string,
  ownerPn: string,
  kind: CompanionEngagementKind,
  payload: LikeRecord | CommentRecord | ShareRecord | SaveRecord | ViewRecord | { pnIdentifier: string },
  opts?: { accessToken?: string }
): Promise<void> {
  const ownerPnIdentifier = normalizePn(ownerPn);

  if (isDeviceCloudCustodyEnabled() && !String(opts?.accessToken || '').trim()) {
    // No silent getOwnerStorageContext write — that soft-nulls and hides the gap.
    safeLogger.warn('[CompanionEngagement] Skipped owner companion write under custody (no owner AT)', {
      reason: 'cloud_token_required',
      kind,
      fileIdHash: hashIdentifier(fileId),
      ownerPnHash: hashIdentifier(ownerPnIdentifier),
    });
    return;
  }

  try {
    if (!(await hasOwnerStorage(ownerPnIdentifier))) {
      safeLogger.warn('[CompanionEngagement] No storage credentials for owner', {
        fileIdHash: hashIdentifier(fileId),
        ownerPnHash: hashIdentifier(ownerPnIdentifier),
      });
      return;
    }

    const accessToken = String(opts?.accessToken || '').trim() || undefined;

    switch (kind) {
      case 'like':
        await CompanionMetadataService.appendLike(
          ownerPnIdentifier,
          fileId,
          payload as LikeRecord,
          accessToken
        );
        break;
      case 'unlike':
        await CompanionMetadataService.removeLike(
          ownerPnIdentifier,
          fileId,
          (payload as { pnIdentifier: string }).pnIdentifier,
          accessToken
        );
        break;
      case 'comment':
        await CompanionMetadataService.appendComment(
          ownerPnIdentifier,
          fileId,
          payload as CommentRecord,
          accessToken
        );
        break;
      case 'share':
        await CompanionMetadataService.appendShare(
          ownerPnIdentifier,
          fileId,
          payload as ShareRecord,
          accessToken
        );
        break;
      case 'save':
        await CompanionMetadataService.appendSave(
          ownerPnIdentifier,
          fileId,
          payload as SaveRecord,
          accessToken
        );
        break;
      case 'unsave':
        await CompanionMetadataService.removeSave(
          ownerPnIdentifier,
          fileId,
          (payload as { pnIdentifier: string }).pnIdentifier,
          accessToken
        );
        break;
      case 'view':
        await CompanionMetadataService.appendView(
          ownerPnIdentifier,
          fileId,
          payload as ViewRecord,
          accessToken
        );
        break;
      default:
        break;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    safeLogger.warn('[CompanionEngagement] Failed to update companion metadata', {
      fileIdHash: hashIdentifier(fileId),
      message,
    });
  }
}

/** @deprecated Use appendOwnerCompanionEngagement(fileId, ownerPn, kind, payload) */
export type CompanionAppendFn = (
  ...args: unknown[]
) => Promise<void>;
