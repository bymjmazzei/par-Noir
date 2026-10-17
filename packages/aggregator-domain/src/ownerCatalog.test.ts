import { describe, expect, it } from 'vitest';
import { isAggregatorCollectionPart, ownerCatalogDriveId } from './ownerCatalog';

describe('ownerCatalog', () => {
  it('isAggregatorCollectionPart matches feed filter rules', () => {
    expect(isAggregatorCollectionPart({ isPartOfCollection: true })).toBe(true);
    expect(isAggregatorCollectionPart({ feedIds: ['collection-part'] })).toBe(true);
    expect(isAggregatorCollectionPart({ feedIds: ['public', 'media'] })).toBe(false);
    expect(isAggregatorCollectionPart(null)).toBe(false);
  });

  it('ownerCatalogDriveId prefers publicContentRef.objectId', () => {
    expect(
      ownerCatalogDriveId(
        { publicContentRef: { objectId: 'drive-1' }, fileId: 'index-1' },
        'index-1'
      )
    ).toBe('drive-1');
    expect(ownerCatalogDriveId({ fileId: 'index-1' }, 'index-1')).toBe('index-1');
  });
});
