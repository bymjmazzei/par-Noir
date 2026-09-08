/**
 * Cloud SoT gates: OAuth-less envelope probe + purge cascade.
 */

const removeMetadata = jest.fn();
const removeOwner = jest.fn();
const removePublic = jest.fn();
const fetchPublicBytes = jest.fn();

jest.mock('../aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: {
    getInstance: () => ({ removeMetadata: (...a: unknown[]) => removeMetadata(...a) }),
  },
}));

jest.mock('./fileIndexHelpers', () => ({
  removeFromOwnerIndex: (...a: unknown[]) => removeOwner(...a),
  removeFromPublicIndex: (...a: unknown[]) => removePublic(...a),
}));

jest.mock('../publicBlobAccess', () => {
  class PublicBlobAccessError extends Error {
    constructor(
      message: string,
      public code: string,
      public httpStatus: number
    ) {
      super(message);
      this.name = 'PublicBlobAccessError';
    }
  }
  return {
    PublicBlobAccessError,
    fetchPublicBytes: (...a: unknown[]) => fetchPublicBytes(...a),
  };
});

import {
  getPublicContentRef,
  hasPublicContentRefShape,
  probePublicEnvelope,
  purgePublicCacheForFileIds,
} from './publicCloudSot';
import { reconcilePublicCacheRows } from './reconcilePublicCacheToCloud';
import { PublicBlobAccessError } from '../publicBlobAccess';

describe('publicCloudSot foundation', () => {
  beforeEach(() => {
    removeMetadata.mockReset().mockResolvedValue(true);
    removeOwner.mockReset().mockResolvedValue(undefined);
    removePublic.mockReset().mockResolvedValue(undefined);
    fetchPublicBytes.mockReset();
  });

  it('hasPublicContentRefShape requires backend+objectId+publicUrl', () => {
    expect(hasPublicContentRefShape({ isPublic: true })).toBe(false);
    expect(
      hasPublicContentRefShape({
        publicContentRef: {
          backend: 'google_drive',
          objectId: 'obj1',
          publicUrl: 'https://drive.google.com/uc?export=download&id=obj1&confirm=t',
        },
      })
    ).toBe(true);
    expect(getPublicContentRef({ publicContentRef: { backend: 'x' } })).toBeNull();
  });

  it('probePublicEnvelope maps NOT_FOUND to missing without owner token', async () => {
    fetchPublicBytes.mockRejectedValue(
      new PublicBlobAccessError('gone', 'NOT_FOUND', 404)
    );
    const status = await probePublicEnvelope({
      backend: 'google_drive',
      objectId: 'obj',
      publicUrl: 'https://drive.google.com/uc?export=download&id=obj&confirm=t',
    });
    expect(status).toBe('missing');
    expect(fetchPublicBytes).toHaveBeenCalled();
  });

  it('purgePublicCacheForFileIds always hits Postgres; Sheets only with token', async () => {
    await purgePublicCacheForFileIds({ fileIds: ['f1'] });
    expect(removeMetadata).toHaveBeenCalledWith('f1');
    expect(removeOwner).not.toHaveBeenCalled();

    await purgePublicCacheForFileIds({
      fileIds: ['f2'],
      pnIdentifier: 'pn-x',
      token: { access_token: 'tok' },
      metadataFolderId: 'meta',
    });
    expect(removeOwner).toHaveBeenCalled();
    expect(removePublic).toHaveBeenCalled();
  });

  it('reconcile purges on missing ref and on envelope NOT_FOUND; ignores backendFileId', async () => {
    const probe = jest
      .fn()
      .mockResolvedValueOnce('missing')
      .mockResolvedValueOnce('ok');

    const result = await reconcilePublicCacheRows(
      [
        { fileId: 'no-ref', pnIdentifier: 'pn-a' },
        {
          fileId: 'dead-env',
          pnIdentifier: 'pn-a',
          publicContentRef: {
            backend: 'google_drive',
            objectId: 'gone',
            publicUrl: 'https://drive.google.com/uc?export=download&id=gone&confirm=t',
          },
        },
        {
          fileId: 'alive',
          publicContentRef: {
            backend: 'google_drive',
            objectId: 'live',
            publicUrl: 'https://drive.google.com/uc?export=download&id=live&confirm=t',
          },
        },
      ],
      { probe }
    );

    expect(result.checked).toBe(3);
    expect(result.removed).toBe(2);
    expect(result.removedFileIds).toEqual(['no-ref', 'dead-env']);
    expect(removeMetadata).toHaveBeenCalledWith('no-ref');
    expect(removeMetadata).toHaveBeenCalledWith('dead-env');
    expect(removeMetadata).not.toHaveBeenCalledWith('alive');
  });

  it('reconcile does not purge on probe error (soft failure)', async () => {
    const result = await reconcilePublicCacheRows(
      [
        {
          fileId: 'soft',
          publicContentRef: {
            backend: 'google_drive',
            objectId: 'x',
            publicUrl: 'https://drive.google.com/uc?export=download&id=x&confirm=t',
          },
        },
      ],
      { probe: async () => 'error' }
    );
    expect(result.removed).toBe(0);
    expect(result.errors).toBe(1);
    expect(removeMetadata).not.toHaveBeenCalled();
  });
});
