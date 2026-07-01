jest.mock('../modules/storageCredentialsService', () => ({
  storageCredentialsService: {
    getCredentials: jest.fn(),
    upsertCredentials: jest.fn(),
  },
}));

import {
  integratorFolderName,
  integratorPathLabel,
  isFirstPartyClient,
  normalizePnIdentifier,
  pnFolderDisplayName,
  scopesIncludeCloudApp
} from '../modules/integratorStoragePaths';
import { IntegratorStorageError } from '../modules/integratorFolderService';
import {
  isPnDriveIndexComplete,
  PN_DRIVE_SHEET_KEYS,
  readPnDriveIndex,
  type PnDriveIndex,
} from '../modules/pnDriveIndex';

function minimalTestIndex(overrides: Partial<PnDriveIndex> = {}): PnDriveIndex {
  const sheetIds = Object.fromEntries(
    Object.values(PN_DRIVE_SHEET_KEYS).map((k) => [k, `sheet-${k}`])
  );
  return {
    schemaVersion: 1,
    pnFolderId: 'pn-root',
    metadataFolderId: 'meta',
    integratorsRootId: 'int-root',
    messagesFolderId: 'msg-folder',
    inboxSheetId: 'inbox',
    sheetIds,
    conversationSheets: {},
    ...overrides,
  };
}

describe('integratorStoragePaths', () => {
  it('normalizes pn identifier', () => {
    expect(normalizePnIdentifier('abc')).toBe('pn-abc');
    expect(normalizePnIdentifier('pn-abc')).toBe('pn-abc');
  });

  it('builds pn folder display name', () => {
    expect(pnFolderDisplayName('pn-deadbeef')).toBe('par Noir - pn-deadbeef');
  });

  it('sanitizes integrator folder names', () => {
    expect(integratorFolderName('my-app_v2')).toBe('my-app_v2');
    expect(integratorFolderName('bad/client')).toBe('bad_client');
  });

  it('rejects empty client id', () => {
    expect(() => integratorFolderName('')).toThrow();
  });

  it('builds integrator path label', () => {
    expect(integratorPathLabel('my-app')).toBe('integrators/my-app');
  });

  it('detects cloud:app scope', () => {
    expect(scopesIncludeCloudApp(['openid', 'cloud:app'])).toBe(true);
    expect(scopesIncludeCloudApp(['openid'])).toBe(false);
  });

  it('classifies first-party clients', () => {
    expect(isFirstPartyClient('browser-app')).toBe(true);
    expect(isFirstPartyClient('prism-app')).toBe(true);
    expect(isFirstPartyClient('developer-portal')).toBe(true);
    expect(isFirstPartyClient('my-startup-app')).toBe(false);
  });
});

describe('IntegratorStorageError', () => {
  it('carries error code', () => {
    const e = new IntegratorStorageError('nope', 'FORBIDDEN_PARENT');
    expect(e.code).toBe('FORBIDDEN_PARENT');
  });
});

describe('pnDriveIndex', () => {
  it('readPnDriveIndex parses complete index', () => {
    const index = minimalTestIndex();
    const parsed = readPnDriveIndex({ pnDriveIndex: index });
    expect(parsed?.metadataFolderId).toBe('meta');
    expect(isPnDriveIndexComplete(parsed)).toBe(true);
  });

  it('readPnDriveIndex returns null when core folders missing', () => {
    expect(readPnDriveIndex({ pnDriveIndex: { sheetIds: {} } })).toBeNull();
  });

  it('isPnDriveIndexComplete requires all sheet keys', () => {
    const incomplete = minimalTestIndex();
    delete incomplete.sheetIds[PN_DRIVE_SHEET_KEYS.CONNECTIONS];
    expect(isPnDriveIndexComplete(incomplete)).toBe(false);
  });
});
