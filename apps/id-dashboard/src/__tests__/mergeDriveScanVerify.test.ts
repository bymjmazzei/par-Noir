/**
 * @jest-environment jsdom
 */
import { mergeDriveScanWithIndex } from '../components/storage/hooks/loadFiles/mergeDriveScanWithIndex';

describe('mergeDriveScanWithIndex verifyWithDrive', () => {
  const makeParams = (overrides: Record<string, unknown> = {}) => {
    const listFiles = jest.fn().mockResolvedValue([
      { id: 'g1', name: 'doc.encrypted', mimeType: 'application/octet-stream', size: 5 },
      { id: 'drive-1', name: 'extra.encrypted', mimeType: 'application/octet-stream', size: 10 },
    ]);
    return {
      backendId: 'google_drive::acct',
      backend: { listFiles } as any,
      currentPnIdentifier: 'pn-abc',
      ownerIndex: {
        files: [
          {
            fileId: 'f1',
            googleDriveFileId: 'g1',
            fileName: 'doc.encrypted',
            originalName: 'doc.pdf',
            visibility: 'private',
            uploadedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      ownerIndexFromApi: true,
      verifyWithDrive: false,
      aggregatedMetadataMap: new Map(),
      filesNeedingMetadata: [] as any[],
      retryBackends: new Set<string>(),
      rateLimitedBackendsRef: { current: new Set<string>() },
      ownerIndexRetryCountsRef: { current: new Map() },
      shareTokenCache: { current: new Map() },
      makeShareTokenCacheKey: (b: string, f: string) => `${b}:${f}`,
      listFiles,
      ...overrides,
    };
  };

  it('index-only path does not call listFiles', async () => {
    const params = makeParams({ verifyWithDrive: false });
    const result = await mergeDriveScanWithIndex(params as any);
    expect(params.listFiles).not.toHaveBeenCalled();
    expect(result.filesForBackend).toHaveLength(1);
    expect(result.filesForBackend[0].backendFileId).toBe('g1');
  });

  it('verify path calls listFiles and merges unindexed Drive files', async () => {
    const params = makeParams({ verifyWithDrive: true });
    const result = await mergeDriveScanWithIndex(params as any);
    expect(params.listFiles).toHaveBeenCalledTimes(1);
    expect(result.filesForBackend.some((f: any) => f.backendFileId === 'drive-1')).toBe(true);
    expect(result.filesForBackend.some((f: any) => f.backendFileId === 'g1')).toBe(true);
  });
});
