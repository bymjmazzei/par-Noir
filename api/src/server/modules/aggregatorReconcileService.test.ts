import { reconcilePublicAggregator } from './aggregatorReconcileService';
import { AggregatorMetadataServiceDB } from './aggregatorMetadataServiceDB';
import { reconcilePublicCacheToCloud } from './storage/reconcilePublicCacheToCloud';

jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: { getInstance: jest.fn() },
}));
jest.mock('./storage/reconcilePublicCacheToCloud', () => ({
  reconcilePublicCacheToCloud: jest.fn(),
}));
jest.mock('../utils/cache', () => ({ invalidateIndexCache: jest.fn() }));

describe('reconcilePublicAggregator', () => {
  const metadata = {
    purgePublicRowsMissingContentRef: jest.fn(),
    listPnIdentifiersWithPublicFiles: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (AggregatorMetadataServiceDB.getInstance as jest.Mock).mockReturnValue(metadata);
    metadata.listPnIdentifiersWithPublicFiles.mockResolvedValue(['pn-a', 'pn-b']);
  });

  it('purges only from public envelopes and Postgres, never crawling an owner cloud', async () => {
    (reconcilePublicCacheToCloud as jest.Mock).mockResolvedValue({ checked: 3, removed: 1, errors: 0, removedFileIds: ['x'] });
    metadata.purgePublicRowsMissingContentRef.mockResolvedValue(2);

    const result = await reconcilePublicAggregator();

    expect(result).toMatchObject({ envelopeChecked: 3, envelopeRemoved: 1, filesRemoved: 3, usersChecked: 2, usersSkipped: 2, errors: 0 });
  });

  it('counts an envelope probe failure as an error and still purges missing refs', async () => {
    (reconcilePublicCacheToCloud as jest.Mock).mockRejectedValue(new Error('down'));
    metadata.purgePublicRowsMissingContentRef.mockResolvedValue(0);

    const result = await reconcilePublicAggregator();

    expect(result.errors).toBe(1);
    expect(metadata.purgePublicRowsMissingContentRef).toHaveBeenCalled();
  });
});
