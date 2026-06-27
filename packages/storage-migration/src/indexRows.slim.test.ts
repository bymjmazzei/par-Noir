import { describe, expect, it } from 'vitest';
import {
  SHEETS_INDEX_CELL_SAFE_CHARS,
  serializeSlimIndexEntryJson,
  slimIndexEntry,
} from './indexRows.js';

describe('slimIndexEntry', () => {
  it('strips thought body and schema.org bloat from a realistic public thought row', () => {
    const longThought = 'x'.repeat(12000);
    const fatEntry = {
      fileId: 'thought-file-1',
      googleDriveFileId: 'drive-abc',
      visibility: 'public',
      uploadedAt: '2026-06-26T12:00:00.000Z',
      fileName: 'thought.encrypted',
      mimeType: 'application/octet-stream',
      size: 4096,
      owner: { did: 'did:key:owner', identifier: 'pn-owner' },
      tags: ['thought'],
      description: 'A public thought',
      thought: longThought,
      textPost: longThought,
      publicToken: 'pt-' + 'y'.repeat(8000),
      '@context': ['https://schema.org/', 'https://parnoir.com/ns/v1#'],
      '@type': 'CreativeWork',
      '@id': 'https://parnoir.com/resource/thought-file-1',
      creator: { '@id': 'did:key:owner', identifier: { value: 'pn-owner' } },
      engagement: {
        views: 1,
        likes: 0,
        comments: 0,
        shares: 0,
        lastUpdated: '2026-06-26T12:00:00.000Z',
        engagementHistory: [{ type: 'view', at: '2026-06-26T12:00:00.000Z' }],
      },
      collection: { collectionFileIds: ['child-1', 'child-2'] },
    };

    const slim = slimIndexEntry(fatEntry, { indexKind: 'public', warnOnOversize: false });
    expect(slim.thought).toBeUndefined();
    expect(slim.textPost).toBeUndefined();
    expect(slim['@context']).toBeUndefined();
    expect(slim.collection).toBeUndefined();
    expect((slim as { collectionFileIds?: string[] }).collectionFileIds).toEqual([
      'child-1',
      'child-2',
    ]);
    expect((slim.engagement as { engagementHistory?: unknown }).engagementHistory).toBeUndefined();

    const json = serializeSlimIndexEntryJson(fatEntry, { indexKind: 'public' });
    expect(json.length).toBeLessThan(50000);
    expect(json.length).toBeLessThan(SHEETS_INDEX_CELL_SAFE_CHARS);
  });
});
