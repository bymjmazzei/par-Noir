/**
 * @jest-environment node
 *
 * Falsification: layout "current" must fail when migration ids are missing.
 */
import {
  CURRENT_CLOUD_LAYOUT_VERSION,
  MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1,
  getLayoutStatus,
  isCloudLayoutCurrent,
  stampCloudLayoutCurrent,
} from './cloudLayoutMigrations';
import { PN_DRIVE_SHEET_KEYS, REQUIRED_PN_DRIVE_SHEET_KEYS } from '../pnDriveIndex';

function completePnDriveIndex() {
  const sheetIds: Record<string, string> = {};
  for (const key of REQUIRED_PN_DRIVE_SHEET_KEYS) {
    sheetIds[key] = `sheet-${key}`;
  }
  sheetIds[PN_DRIVE_SHEET_KEYS.OWNED_ASSETS] = 'sheet-owned-assets';
  return {
    schemaVersion: 1 as const,
    pnFolderId: 'pn-folder',
    metadataFolderId: 'meta-folder',
    integratorsRootId: 'int-root',
    messagesFolderId: 'msg-folder',
    inboxSheetId: 'inbox-sheet',
    sheetIds,
    conversationSheets: {},
  };
}

describe('cloudLayoutMigrations status', () => {
  it('fails isCloudLayoutCurrent when complete index has no applied migrations', () => {
    const credentials = { pnDriveIndex: completePnDriveIndex() };
    expect(isCloudLayoutCurrent(credentials)).toBe(false);
    const status = getLayoutStatus(credentials);
    expect(status.complete).toBe(false);
    expect(status.required).toBe(CURRENT_CLOUD_LAYOUT_VERSION);
    expect(status.pending.map((p) => p.id)).toContain(MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1);
  });

  it('is current after stampCloudLayoutCurrent', () => {
    const credentials: Record<string, unknown> = { pnDriveIndex: completePnDriveIndex() };
    stampCloudLayoutCurrent(credentials);
    expect(isCloudLayoutCurrent(credentials)).toBe(true);
    const status = getLayoutStatus(credentials);
    expect(status.complete).toBe(true);
    expect(status.pending).toEqual([]);
    expect(status.appliedMigrations).toContain(MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1);
    expect(status.current).toBe(CURRENT_CLOUD_LAYOUT_VERSION);
  });

  it('treats null credentials as behind', () => {
    expect(isCloudLayoutCurrent(null)).toBe(false);
    expect(getLayoutStatus(undefined).complete).toBe(false);
  });
});
