jest.mock('../services/ownerApiService', () => ({
  ownerGet: jest.fn(),
}));

import { ownerCatalogToAggregatedFile } from '../services/ownerCatalogService';

describe('ownerCatalogToAggregatedFile', () => {
  it('maps indexed Pen row to AggregatedFile with metadataIndexFileId', () => {
    const agg = ownerCatalogToAggregatedFile(
      {
        fileId: 'index-1',
        metadata: {
          title: 'Post',
          fileType: 'video',
          isPublic: true,
          publicContentRef: { objectId: 'drive-1' },
          penDocId: 'doc-1'
        }
      },
      'google_drive::acct'
    );
    expect(agg.catalogBacked).toBe(true);
    expect(agg.metadataIndexFileId).toBe('index-1');
    expect(agg.backendFileId).toBe('drive-1');
    expect(agg.backend).toBe('google_drive');
    expect(agg.visibility).toBe('public');
  });
});
