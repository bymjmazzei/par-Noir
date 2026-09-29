import { getSessionDriveIndex } from './sessionMemory.js';
import type { DeviceDriveLayout } from './deviceDriveLayout.js';

export function layoutSheetId(identityId: string, jobType: string): string | null {
  const index = getSessionDriveIndex(identityId);
  if (!index) return null;
  return sheetIdForJob(index, jobType);
}

export function sheetIdForJob(index: DeviceDriveLayout, jobType: string): string | null {
  if (jobType === 'message_append' || jobType === 'group_message_append') {
    return index.inboxSheetId || null;
  }
  if (jobType.startsWith('connection') || jobType.startsWith('follower')) {
    return index.sheetIds.connections || null;
  }
  if (jobType.startsWith('group')) return index.sheetIds.groups || null;
  if (jobType.startsWith('pen')) return index.sheetIds['owner-file-index'] || null;
  if (jobType.includes('notification')) return index.sheetIds.notifications || null;
  if (jobType.includes('engagement') || jobType === 'like') return index.sheetIds.engagement || null;
  return index.sheetIds.activity_ledger || null;
}
