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
  hasCachedDriveLayout,
  mergeCachedFolderIds,
  readCachedFolderIds
} from '../modules/pnDriveLayout';

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

describe('pnDriveLayout cache', () => {
  it('readCachedFolderIds parses known keys', () => {
    const parsed = readCachedFolderIds({
      cachedFolderIds: {
        pnFolderId: 'pn-root',
        metadataFolderId: 'meta',
        integratorsRootId: 'int-root',
        messagesFolderId: 'msg',
        inboxSheetId: 'inbox',
        junk: 123
      }
    });
    expect(parsed).toEqual({
      pnFolderId: 'pn-root',
      metadataFolderId: 'meta',
      integratorsRootId: 'int-root',
      messagesFolderId: 'msg',
      inboxSheetId: 'inbox'
    });
  });

  it('readCachedFolderIds returns empty object when missing', () => {
    expect(readCachedFolderIds({})).toEqual({});
    expect(readCachedFolderIds({ cachedFolderIds: null })).toEqual({});
  });

  it('hasCachedDriveLayout requires core folder ids', () => {
    expect(hasCachedDriveLayout({})).toBe(false);
    expect(
      hasCachedDriveLayout({
        pnFolderId: 'a',
        metadataFolderId: 'b',
        integratorsRootId: 'c'
      })
    ).toBe(true);
  });

  it('mergeCachedFolderIds overlays patches', () => {
    expect(
      mergeCachedFolderIds({ pnFolderId: 'old' }, { integratorsRootId: 'new' })
    ).toEqual({
      pnFolderId: 'old',
      integratorsRootId: 'new'
    });
  });
});
