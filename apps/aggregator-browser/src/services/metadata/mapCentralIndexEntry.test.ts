import { describe, expect, it } from 'vitest';
import { mapCentralIndexEntryToIndexedFile } from './mapCentralIndexEntry';

describe('mapCentralIndexEntryToIndexedFile', () => {
  it('preserves thought/textPost on thumb_thought rows', () => {
    const mapped = mapCentralIndexEntryToIndexedFile({
      fileId: '1YK6',
      pnIdentifier: 'pn-abc',
      metadata: {
        name: 'thumb_thought-1786289955537.png',
        fileType: 'note-thumbnail',
        contentClass: 'note',
        thought: { content: 'test', style: {} },
        textPost: { content: 'test', style: {} },
        publicToken: '{"shareKey":"x"}',
      },
    });

    expect(mapped.metadata.thought?.content).toBe('test');
    expect(mapped.metadata.textPost?.content).toBe('test');
    expect(mapped.metadata.fileId).toBe('1YK6');
    expect(mapped.publicToken).toBeTruthy();
  });
});
