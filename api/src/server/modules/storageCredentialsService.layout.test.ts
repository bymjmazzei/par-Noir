import { storageCredentialsService } from './storageCredentialsService';
import { CURRENT_CLOUD_LAYOUT_VERSION, allMigrationIds } from './storage/cloudLayoutMigrations';

describe('upsertLayoutOnly', () => {
  afterEach(() => jest.restoreAllMocks());

  it('merges the device layout root and stamps the layout current when the device built it', async () => {
    jest.spyOn(storageCredentialsService, 'getCredentials').mockResolvedValue({
      identityId: 'pn-a',
      credentials: { socialCloudProvider: 'dropbox', cachedLayout: { metadataFolderId: 'm' } },
      cid: null,
    } as never);
    const upsert = jest
      .spyOn(storageCredentialsService, 'upsertCredentials')
      .mockImplementation(async (identityId, credentials) => ({ identityId, credentials }) as never);

    await storageCredentialsService.upsertLayoutOnly('pn-a', {
      cachedLayout: { pathPrefix: 'par-noir-pn-a/' },
      layoutCurrent: true,
    });

    const stored = upsert.mock.calls[0]![1] as Record<string, unknown>;
    expect(stored.cachedLayout).toEqual({ metadataFolderId: 'm', pathPrefix: 'par-noir-pn-a/' });
    expect(stored.cloudLayoutVersion).toBe(CURRENT_CLOUD_LAYOUT_VERSION);
    expect(stored.appliedMigrations).toEqual(allMigrationIds());
  });

  it('leaves the layout version alone for a plain layout hint', async () => {
    jest.spyOn(storageCredentialsService, 'getCredentials').mockResolvedValue(null);
    const upsert = jest
      .spyOn(storageCredentialsService, 'upsertCredentials')
      .mockImplementation(async (identityId, credentials) => ({ identityId, credentials }) as never);

    await storageCredentialsService.upsertLayoutOnly('pn-a', { socialCloudProvider: 'aws_s3' });

    const stored = upsert.mock.calls[0]![1] as Record<string, unknown>;
    expect(stored).toEqual({ socialCloudProvider: 'aws_s3' });
  });
});
