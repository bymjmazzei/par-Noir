/**
 * @jest-environment node
 *
 * Storage-provider migration copies the legacy recovery roster only — never share material.
 */
const sheetsValues = {
  get: jest.fn(),
  batchClear: jest.fn(async () => ({})),
  update: jest.fn(async () => ({})),
};

jest.mock('googleapis', () => ({
  google: { sheets: () => ({ spreadsheets: { values: sheetsValues } }) },
}));
jest.mock('../googleOAuth2Helper', () => ({ GoogleOAuth2Helper: { createClient: () => ({}) } }));
jest.mock('./storageProviderUtils', () => ({ isPortableStorageProvider: jest.fn(async () => false) }));
const portableTableScan = jest.fn();
const portableTableReplaceAll = jest.fn(async () => undefined);
jest.mock('./portableTableService', () => ({
  portableTableScan: (...args: unknown[]) => portableTableScan(...args),
  portableTableReplaceAll: (...args: unknown[]) => portableTableReplaceAll(...args),
}));

import { RecoverySheetsService } from '../recoverySheetsService';
import { migrateRecoveryGoogleToPortable, migrateRecoveryPortableToGoogle } from './migrationTransformers';
import { RECOVERY_CUSTODIANS_SCHEMA, RECOVERY_PENDING_SCHEMA, RECOVERY_REQUESTS_SCHEMA } from './tableSchemas';

const ctx = { token: {} as never, metadataFolderId: 'meta', accountId: 'acct' } as never;
const CREDENTIAL = 'c'.repeat(40);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(RecoverySheetsService, 'getOrCreateSpreadsheet').mockResolvedValue('sheet-1');
});

describe('recovery storage migration', () => {
  it('google → portable writes the roster without encryptedShare and empties pending/requests', async () => {
    sheetsValues.get.mockResolvedValue({
      data: {
        values: [['cust_1', 'Alice', 'person', 'SEALED_SHARE', '2', CREDENTIAL, 'accepted', '2026-01-01', 'false']],
      },
    });

    const report = await migrateRecoveryGoogleToPortable('job', ctx, 'pn-owner', 'acct');
    expect(report.totals.failed).toBe(0);

    const calls = portableTableReplaceAll.mock.calls as unknown as Array<[string, { id: string }, Record<string, unknown>[]]>;
    const custodians = calls.find((c) => c[1].id === RECOVERY_CUSTODIANS_SCHEMA.id)?.[2];
    expect(custodians).toHaveLength(1);
    expect(custodians?.[0]).toMatchObject({ custodianId: 'cust_1', shareIndex: 2 });
    expect(custodians?.[0]).not.toHaveProperty('encryptedShare');
    expect(JSON.stringify(custodians)).not.toContain('SEALED_SHARE');
    expect(calls.find((c) => c[1].id === RECOVERY_PENDING_SCHEMA.id)?.[2]).toEqual([]);
    expect(calls.find((c) => c[1].id === RECOVERY_REQUESTS_SCHEMA.id)?.[2]).toEqual([]);
  });

  it('portable → google writes an empty share column and clears share/request tabs', async () => {
    portableTableScan.mockResolvedValue([
      {
        custodianId: 'cust_1',
        name: 'Alice',
        custodianType: 'person',
        encryptedShare: 'SEALED_SHARE',
        shareIndex: '3',
        custodianshipCredential: CREDENTIAL,
        status: 'accepted',
        createdAt: '2026-01-01',
        unrevokable: 'true',
      },
    ]);

    const report = await migrateRecoveryPortableToGoogle('job', ctx, 'pn-owner', 'acct');
    expect(report.totals.failed).toBe(0);

    expect(sheetsValues.batchClear).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: { ranges: expect.arrayContaining(['PendingShares!A2:C', 'RecoveryRequests!A2:H']) },
      })
    );
    const written = (sheetsValues.update.mock.calls[0] as unknown as [{ requestBody: { values: string[][] } }])[0]
      .requestBody.values;
    expect(written[0][0]).toBe('cust_1');
    expect(written[0][3]).toBe('');
    expect(written[0][4]).toBe('3');
    expect(written[0][8]).toBe('true');
    expect(JSON.stringify(written)).not.toContain('SEALED_SHARE');
  });
});
