/** First-party rails: PUBLIC is union of class-tagged posts; empty feedIds = all rails. */
import { describe, expect, it } from 'vitest';
import type { IndexedFile } from '../types/aggregator';
import { filterFilesForFeed } from './filterFilesForFeed';

function file(
  id: string,
  feedIds?: string[],
  fileType = 'note',
  extra: Record<string, unknown> = {}
): IndexedFile {
  return {
    metadata: {
      fileId: id,
      backend: 'google_drive',
      backendFileId: id,
      fileType,
      isPublic: true,
      ...(feedIds ? { feedIds } : {}),
      ...extra
    }
  } as IndexedFile;
}

const userState = {
  isUnlocked: true,
  pnIdentifier: 'pn-owner',
  preferences: {}
};

function filterRail(
  feedId: string,
  mediaFiles: IndexedFile[] = [],
  notesFiles: IndexedFile[] = [],
  collectionsFiles: IndexedFile[] = []
) {
  return filterFilesForFeed({
    mediaFiles,
    notesFiles,
    collectionsFiles,
    feedId,
    userState,
    connectionsList: [],
    feeds: []
  }).map((f) => f.metadata.fileId);
}

describe('filterFilesForFeed feedIds', () => {
  it('keeps legacy rows with no feedIds on the notes rail', () => {
    expect(filterRail('notes', [], [file('legacy'), file('scoped', ['public'])])).toEqual([
      'legacy',
      'scoped'
    ]);
  });

  it('class-tagged row appears on PUBLIC and its class rail', () => {
    const row = file('only-notes', ['notes']);
    expect(filterRail('notes', [], [row])).toEqual(['only-notes']);
    expect(filterRail('public', [], [row])).toEqual(['only-notes']);
    expect(filterRail('media', [], [row])).toEqual([]);
  });

  it('collections-tagged row appears on PUBLIC and collections', () => {
    const row = file('coll', ['collections'], 'collection');
    expect(filterRail('public', [], [], [row])).toEqual(['coll']);
    expect(filterRail('collections', [], [], [row])).toEqual(['coll']);
    expect(filterRail('notes', [], [], [row])).toEqual([]);
  });

  it('community-only row stays off PUBLIC', () => {
    const row = file('comm', ['community-x']);
    expect(filterRail('public', [], [row])).toEqual([]);
  });

  it('excludes collection parts from first-party rails', () => {
    const part = file('part', ['collection-part'], 'video', { isPartOfCollection: true });
    expect(filterRail('public', [part], [], [])).toEqual([]);
    expect(filterRail('media', [part], [], [])).toEqual([]);
  });
});
