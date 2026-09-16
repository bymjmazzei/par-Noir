/**
 * Owner companion Drive mirror for engagement.
 * Under device cloud custody, public engagement SoT is the server aggregator DB
 * (`delivery: public`) — do not soft-write companion Sheets without owner AT.
 */

import { CompanionMetadataService } from './companionMetadataService';
import type {
  CommentRecord,
  LikeRecord,
  SaveRecord,
  ShareRecord,
  ViewRecord
} from './companionMetadataSheets';
import { isDeviceCloudCustodyEnabled } from './socialMailboxService';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

export type CompanionEngagementKind = 'like' | 'unlike' | 'comment' | 'share' | 'save' | 'unsave' | 'view';

/**
 * Mirror engagement to owner companion Sheets only when an owner AT is supplied.
 * Under custody with no AT: no-op (public metrics already on server).
 */
export async function appendOwnerCompanionEngagement(
  fileId: string,
  ownerPn: string,
  kind: CompanionEngagementKind,
  payload: LikeRecord | CommentRecord | ShareRecord | SaveRecord | ViewRecord | { pnIdentifier: string },
  opts?: { accessToken?: string }
): Promise<void> {
  const accessToken = String(opts?.accessToken || '').trim();
  if (isDeviceCloudCustodyEnabled() && !accessToken) {
    // Public SoT = aggregator DB. Do not soft-null Drive writes.
    return;
  }
  if (!accessToken) {
    throw Object.assign(new Error('Google Drive access token required'), {
      code: 'CLOUD_TOKEN_REQUIRED',
    });
  }

  const ownerPnIdentifier = normalizePn(ownerPn);

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
}

/** @deprecated Use appendOwnerCompanionEngagement(fileId, ownerPn, kind, payload) */
export type CompanionAppendFn = (...args: unknown[]) => Promise<void>;
