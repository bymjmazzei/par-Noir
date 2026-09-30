import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCloudAccessTokenFromSession = vi.fn((_pn?: string) => 'google-token');
const readSheetValues = vi.fn();
const writeSheetValues = vi.fn();

vi.mock('@par-noir/device-cloud-credentials', () => ({
  getCloudAccessTokenFromSession: (pn: string) => getCloudAccessTokenFromSession(pn),
  readSheetValues: (...args: unknown[]) => readSheetValues(...args),
  writeSheetValues: (...args: unknown[]) => writeSheetValues(...args),
}));

import {
  fetchConversationRowsForMigration,
  postDmMessageRowUpdates,
} from './identityMigrationApiClient';

describe('identity migration message rows', () => {
  beforeEach(() => {
    readSheetValues.mockReset();
    writeSheetValues.mockReset();
    getCloudAccessTokenFromSession.mockReturnValue('google-token');
  });

  it('reads conversation rows from the device sheet', async () => {
    readSheetValues.mockResolvedValue([['pn-them', 'cipher', '1', 'msg-1']]);
    const result = await fetchConversationRowsForMigration(
      'api-token',
      'mig-1',
      'pn-them',
      'pn-self',
      'sheet-thread'
    );
    expect(readSheetValues).toHaveBeenCalledWith('google-token', 'sheet-thread', 'Messages!A2:J');
    expect(result.rows).toEqual([
      { rowIndex: 2, fromPnIdentifier: 'pn-them', encryptedContent: 'cipher' },
    ]);
  });

  it('writes updated ciphertext to the device sheet', async () => {
    writeSheetValues.mockResolvedValue(undefined);
    await postDmMessageRowUpdates('api-token', 'mig-1', 'pn-self', {
      connectionId: 'conn-1',
      spreadsheetId: 'sheet-thread',
      rowUpdates: [{ rowIndex: 2, encryptedContent: 'next-cipher' }],
    });
    expect(writeSheetValues).toHaveBeenCalledWith(
      'google-token',
      'sheet-thread',
      'Messages!B2',
      [['next-cipher']]
    );
  });
});
