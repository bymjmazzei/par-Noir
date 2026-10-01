/**
 * Non-social docs stay off the feed index.
 * A preview grant is a viewer key share. The path is only a locator.
 */

import { getClass } from '@par-noir/pen-protocol';

export function socialFeedPublishAllowed(classId: string | null | undefined): boolean {
  if (!classId) return false;
  return getClass(classId)?.parentId === 'social';
}

export function previewPath(docId: string): string {
  return `/d/${docId}/preview`;
}

/** The sealed invite a collaborator sends so one pN can open the preview. */
export function buildPreviewGrant(docId: string, peerPnIdentifier: string) {
  return {
    docId,
    peerPnIdentifier: peerPnIdentifier.trim(),
    role: 'viewer' as const,
    path: previewPath(docId)
  };
}
