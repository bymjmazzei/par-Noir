/**
 * Browse — pN templates feed page (public social templates only).
 */
import { useMemo } from 'react';
import type { IndexedFile } from '../types/aggregator';
import { FeedTileSurface, type FeedTileViewModel } from '@par-noir/feed-tile';
import { onlyPenTemplates } from '../utils/penTemplateFeed';
import { publicMediaUrl } from '../services/feedPreviewPlayback';

function fileToTileModel(file: IndexedFile, posterUrl?: string): FeedTileViewModel {
  const title = file.metadata.title || file.metadata.name || 'Template';
  return {
    title,
    caption: file.metadata.description || title,
    fileId: file.metadata.fileId,
    posterUrl,
    contentClass: String(file.metadata.contentClass || 'note'),
    pages: [
      {
        title,
        mediaSrc: posterUrl,
        backgroundColor: '#000000',
        textColor: '#FFFFFF'
      }
    ]
  };
}

export function PenTemplatesFeedPage({
  files,
  onOpenFile
}: {
  files: IndexedFile[];
  onOpenFile?: (file: IndexedFile) => void;
}) {
  const templates = useMemo(() => onlyPenTemplates(files), [files]);

  if (templates.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-neutral-950 px-6 text-center text-neutral-400">
        <p className="text-sm font-semibold text-white">Pen templates</p>
        <p className="mt-2 max-w-sm text-xs">
          Public social templates shared to the Pen templates aggregator appear here. User feeds
          never include templates.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-neutral-950">
      <div className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950 px-4 py-3">
        <h1 className="text-sm font-bold uppercase tracking-wider text-neutral-400">
          Pen templates
        </h1>
      </div>
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
        {templates.map((file) => {
          const poster = publicMediaUrl(file.metadata.fileId, 'poster') || undefined;
          const model = fileToTileModel(file, poster);
          return (
            <button
              key={file.metadata.fileId}
              type="button"
              className="w-full text-left"
              onClick={() => onOpenFile?.(file)}
            >
              <FeedTileSurface model={model} mode="preview" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
