import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDriveChildState,
  createDriveChildSpreadsheet,
  ensureDriveChildFolder,
  ensureDriveChildSpreadsheet,
  findDriveChild,
  upsertDriveChildFile,
} from './driveChild.js';
import { createFakeDrive } from './driveFake.testkit.js';

describe('driveChild', () => {
  beforeEach(() => {
    clearDriveChildState();
  });

  it('concurrent ensures for one folder create it once', async () => {
    const drive = createFakeDrive();
    const ids = await Promise.all(
      Array.from({ length: 5 }, () => ensureDriveChildFolder('tok', 'pn', 'drafts', drive.fetchImpl))
    );
    expect(new Set(ids).size).toBe(1);
    expect(drive.children('pn', 'drafts')).toHaveLength(1);
  });

  it('refuses a folder with no parent and never calls Drive', async () => {
    const drive = createFakeDrive();
    await expect(ensureDriveChildFolder('tok', '', 'par-noir-pen', drive.fetchImpl)).rejects.toThrow(
      /drive_parent_required/
    );
    await expect(ensureDriveChildFolder('tok', null, 'feeds', drive.fetchImpl)).rejects.toThrow(
      /drive_parent_required/
    );
    expect(drive.calls).toHaveLength(0);
  });

  it('creates a spreadsheet inside its parent without a move', async () => {
    const drive = createFakeDrive();
    const id = await ensureDriveChildSpreadsheet(
      'tok',
      'messages',
      {
        driveFileName: 'dm-conn_x',
        sheets: [{ title: 'Messages' }, { title: 'Meta' }],
        headers: [{ range: 'Messages!A1:B1', values: [['a', 'b']] }],
      },
      drive.fetchImpl
    );
    expect(drive.files.get(id)?.parents).toEqual(['messages']);
    expect(drive.calls.some((c) => c.method === 'PATCH' && c.url.includes('addParents'))).toBe(false);
    expect(drive.calls.some((c) => c.url.endsWith('/v4/spreadsheets'))).toBe(false);
    expect(drive.calls.some((c) => c.url.includes(':batchUpdate'))).toBe(true);
  });

  it('concurrent ensures for one spreadsheet create it once', async () => {
    const drive = createFakeDrive();
    const spec = { driveFileName: 'dm-conn_y', sheets: [{ title: 'Messages' }], headers: [] };
    const ids = await Promise.all(
      Array.from({ length: 4 }, () => ensureDriveChildSpreadsheet('tok', 'messages', spec, drive.fetchImpl))
    );
    expect(new Set(ids).size).toBe(1);
    expect(drive.children('messages', 'dm-conn_y')).toHaveLength(1);
  });

  it('refuses a widget spreadsheet with no parent', async () => {
    const drive = createFakeDrive();
    await expect(
      createDriveChildSpreadsheet(
        'tok',
        undefined,
        { driveFileName: 'Poll pen_1', sheets: [], headers: [] },
        drive.fetchImpl
      )
    ).rejects.toThrow(/drive_parent_required/);
    expect(drive.calls).toHaveLength(0);
  });

  it('resolves leftover duplicates to the oldest copy', async () => {
    const drive = createFakeDrive();
    const oldest = drive.addFolder('drafts', 'doc');
    drive.addFolder('drafts', 'doc');
    expect(await findDriveChild('tok', 'doc', 'drafts', { fetchImpl: drive.fetchImpl })).toBe(oldest.id);
    expect(await ensureDriveChildFolder('tok', 'doc', 'drafts', drive.fetchImpl)).toBe(oldest.id);
    expect(drive.children('doc', 'drafts')).toHaveLength(2);
  });

  it('concurrent file upserts create one file and keep the last write', async () => {
    const drive = createFakeDrive();
    await Promise.all(
      ['1', '2', '3'].map((v) => upsertDriveChildFile('tok', 'doc', 'doc.json', `{"v":${v}}`, undefined, drive.fetchImpl))
    );
    const docs = drive.children('doc', 'doc.json');
    expect(docs).toHaveLength(1);
    expect(docs[0]!.content).toBe('{"v":3}');
  });
});
