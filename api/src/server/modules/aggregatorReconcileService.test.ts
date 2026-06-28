/**
 * @jest-environment node
 */
import {
  loadAuthorizedPublicFileIds,
  reconcilePublicAggregator,
} from './aggregatorReconcileService';
import { AggregatorMetadataServiceDB } from './aggregatorMetadataServiceDB';
import { getOwnerStorageContext } from './storage/ownerStorageContext';
import { IndexStorageService } from './storage/indexStorageService';
import { storageCredentialsService } from './storageCredentialsService';

jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: {
    getInstance: jest.fn(),
  },
}));

jest.mock('./storage/ownerStorageContext', () => ({
  getOwnerStorageContext: jest.fn(),
}));

jest.mock('./storage/indexStorageService', () => ({
  IndexStorageService: {
    getContentClassPublicIndex: jest.fn(),
    getPublicFileIndex: jest.fn(),
  },
}));

jest.mock('./storageCredentialsService', () => ({
  storageCredentialsService: {
    getCredentials: jest.fn(),
  },
}));
jest.mock('../utils/cache', () => ({
  invalidateIndexCache: jest.fn().mockResolvedValue(undefined),
}));

const mockMetadataService = AggregatorMetadataServiceDB.getInstance as jest.MockedFunction<
  typeof AggregatorMetadataServiceDB.getInstance
>;
const mockGetOwnerStorageContext = getOwnerStorageContext as jest.MockedFunction<
  typeof getOwnerStorageContext
>;
const mockGetCredentials = storageCredentialsService.getCredentials as jest.MockedFunction<
  typeof storageCredentialsService.getCredentials
>;

function serviceMock(overrides: Partial<AggregatorMetadataServiceDB> = {}) {
  const base = {
    listPnIdentifiersWithPublicFiles: jest.fn().mockResolvedValue(['pn-abc']),
    listPublicFileIdsForUser: jest.fn().mockResolvedValue(['A', 'B', 'C']),
    listPublicFileSubmissionsForUser: jest.fn().mockResolvedValue([
      { fileId: 'A', submittedAt: new Date('2020-01-01T00:00:00Z') },
      { fileId: 'B', submittedAt: new Date('2020-01-01T00:00:00Z') },
      { fileId: 'C', submittedAt: new Date('2020-01-01T00:00:00Z') },
    ]),
    removeAllMetadataForUser: jest.fn().mockResolvedValue(3),
    removeMetadata: jest.fn().mockResolvedValue(true),
  };
  const instance = { ...base, ...overrides };
  mockMetadataService.mockReturnValue(instance as unknown as AggregatorMetadataServiceDB);
  return instance;
}

describe('aggregatorReconcileService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('purges user when storage credentials are missing', async () => {
    const svc = serviceMock();
    mockGetCredentials.mockResolvedValue(null);

    const result = await reconcilePublicAggregator();

    expect(svc.removeAllMetadataForUser).toHaveBeenCalledWith('pn-abc');
    expect(result.usersPurged).toBe(1);
    expect(result.filesRemoved).toBe(3);
    expect(mockGetOwnerStorageContext).not.toHaveBeenCalled();
  });

  it('purges user when pn folder / metadata context is missing', async () => {
    const svc = serviceMock();
    mockGetCredentials.mockResolvedValue({ identityId: 'pn-abc', credentials: {} } as never);
    mockGetOwnerStorageContext.mockResolvedValue(null);

    const result = await reconcilePublicAggregator();

    expect(svc.removeAllMetadataForUser).toHaveBeenCalledWith('pn-abc');
    expect(result.usersPurged).toBe(1);
  });

  it('removes DB fileIds not listed in public index', async () => {
    const svc = serviceMock();
    mockGetCredentials.mockResolvedValue({ identityId: 'pn-abc', credentials: {} } as never);
    mockGetOwnerStorageContext.mockResolvedValue({
      kind: 'portable',
      pnIdentifier: 'pn-abc',
    });

    jest.spyOn(IndexStorageService, 'getContentClassPublicIndex').mockResolvedValue({
      identifier: 'pn-abc',
      files: [
        { fileId: 'A', visibility: 'public', uploadedAt: '' },
        { fileId: 'B', visibility: 'public', uploadedAt: '' },
      ],
      updatedAt: new Date().toISOString(),
    });

    const result = await reconcilePublicAggregator();

    expect(svc.removeMetadata).toHaveBeenCalledWith('C');
    expect(svc.removeMetadata).toHaveBeenCalledTimes(1);
    expect(result.filesRemoved).toBe(1);
    expect(result.usersPurged).toBe(0);
  });

  it('purges user when public index is empty', async () => {
    const svc = serviceMock();
    mockGetCredentials.mockResolvedValue({ identityId: 'pn-abc', credentials: {} } as never);
    mockGetOwnerStorageContext.mockResolvedValue({
      kind: 'google_drive',
      pnIdentifier: 'pn-abc',
      token: { access_token: 't' },
      metadataFolderId: 'meta',
    });

    jest.spyOn(IndexStorageService, 'getContentClassPublicIndex').mockResolvedValue({
      identifier: 'pn-abc',
      files: [],
      updatedAt: new Date().toISOString(),
    });
    jest.spyOn(IndexStorageService, 'getPublicFileIndex').mockResolvedValue({
      identifier: 'pn-abc',
      files: [],
      updatedAt: new Date().toISOString(),
    });

    const result = await reconcilePublicAggregator();

    expect(svc.removeAllMetadataForUser).toHaveBeenCalledWith('pn-abc');
    expect(result.usersPurged).toBe(1);
  });

  it('skips user on Drive auth errors without purging', async () => {
    const svc = serviceMock();
    mockGetCredentials.mockResolvedValue({ identityId: 'pn-abc', credentials: {} } as never);
    mockGetOwnerStorageContext.mockRejectedValue(
      new Error('Google Drive authentication failed: 401')
    );

    const result = await reconcilePublicAggregator();

    expect(svc.removeAllMetadataForUser).not.toHaveBeenCalled();
    expect(svc.removeMetadata).not.toHaveBeenCalled();
    expect(result.usersSkipped).toBe(1);
  });

  it('does not remove recent Postgres entries missing from public index (grace period)', async () => {
    const svc = serviceMock({
      listPublicFileSubmissionsForUser: jest.fn().mockResolvedValue([
        { fileId: 'A', submittedAt: new Date('2020-01-01T00:00:00Z') },
        { fileId: 'B', submittedAt: new Date('2020-01-01T00:00:00Z') },
        { fileId: 'C', submittedAt: new Date() },
      ]),
    });
    mockGetCredentials.mockResolvedValue({ identityId: 'pn-abc', credentials: {} } as never);
    mockGetOwnerStorageContext.mockResolvedValue({
      kind: 'portable',
      pnIdentifier: 'pn-abc',
    });

    jest.spyOn(IndexStorageService, 'getContentClassPublicIndex').mockResolvedValue({
      identifier: 'pn-abc',
      files: [
        { fileId: 'A', visibility: 'public', uploadedAt: '' },
        { fileId: 'B', visibility: 'public', uploadedAt: '' },
      ],
      updatedAt: new Date().toISOString(),
    });

    const result = await reconcilePublicAggregator();

    expect(svc.removeMetadata).not.toHaveBeenCalled();
    expect(result.filesRemoved).toBe(0);
  });

  it('skips full purge when public index empty but Postgres has recent publishes', async () => {
    const svc = serviceMock({
      listPublicFileSubmissionsForUser: jest.fn().mockResolvedValue([
        { fileId: 'new1', submittedAt: new Date() },
      ]),
    });
    mockGetCredentials.mockResolvedValue({ identityId: 'pn-abc', credentials: {} } as never);
    mockGetOwnerStorageContext.mockResolvedValue({
      kind: 'google_drive',
      pnIdentifier: 'pn-abc',
      token: { access_token: 't' },
      metadataFolderId: 'meta',
    });

    jest.spyOn(IndexStorageService, 'getContentClassPublicIndex').mockResolvedValue({
      identifier: 'pn-abc',
      files: [],
      updatedAt: new Date().toISOString(),
    });
    jest.spyOn(IndexStorageService, 'getPublicFileIndex').mockResolvedValue({
      identifier: 'pn-abc',
      files: [],
      updatedAt: new Date().toISOString(),
    });

    const result = await reconcilePublicAggregator();

    expect(svc.removeAllMetadataForUser).not.toHaveBeenCalled();
    expect(result.usersPurged).toBe(0);
  });
});

describe('loadAuthorizedPublicFileIds', () => {
  it('collects public fileIds from content-class indexes', async () => {
    jest.spyOn(IndexStorageService, 'getContentClassPublicIndex').mockResolvedValue({
      identifier: 'pn-abc',
      files: [
        { fileId: 'x1', visibility: 'public', uploadedAt: '' },
        { fileId: 'x2', visibility: 'private', uploadedAt: '' },
      ],
      updatedAt: new Date().toISOString(),
    });

    const ids = await loadAuthorizedPublicFileIds('pn-abc', {
      kind: 'portable',
      pnIdentifier: 'pn-abc',
    });

    expect(ids.has('x1')).toBe(true);
    expect(ids.has('x2')).toBe(false);
  });
});
