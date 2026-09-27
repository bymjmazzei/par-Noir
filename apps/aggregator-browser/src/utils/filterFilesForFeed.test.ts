/** Rows with feedIds stay on those rails. Rows without feedIds stay on every public rail. */
import { describe, expect, it } from 'vitest';
import type { IndexedFile } from '../types/aggregator';
import { filterFilesForFeed } from './filterFilesForFeed';

function file(id: string, feedIds?: string[], fileType = 'note'): IndexedFile {
  return {
    metadata: {
      fileId: id,
      backend: 'google_drive',
      backendFileId: id,
      fileType,
      isPublic: true,
      ...(feedIds ? { feedIds } : {})
    }
  } as IndexedFile;
}

const userState = {
  isUnlocked: true,
  pnIdentifier: 'pn-owner',
  preferences: {}
};

function notes(files: IndexedFile[]) {
  return filterFilesForFeed({
    mediaFiles: [],
    notesFiles: files,
    collectionsFiles: [],
    feedId: 'notes',
    userState,
    connectionsList: [],
    feeds: []
  }).map((f) => f.metadata.fileId);
}

describe('filterFilesForFeed feedIds', () => {
  it('keeps legacy rows with no feedIds on the notes rail', () => {
    expect(notes([file('legacy'), file('scoped', ['public'])])).toEqual(['legacy']);
  });

  it('shows a scoped row only on the rail listed in feedIds', () => {
    const row = file('only-notes', ['notes']);
    expect(notes([row])).toEqual(['only-notes']);
    const onPublic = filterFilesForFeed({
      mediaFiles: [],
      notesFiles: [row],
      collectionsFiles: [],
      feedId: 'public',
      userState,
      connectionsList: [],
      feeds: []
    });
    expect(onPublic).toEqual([]);
  });
});
