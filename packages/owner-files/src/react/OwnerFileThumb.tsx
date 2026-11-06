import React from 'react';
import { File, FileText, Film, Image as ImageIcon, Layers, Music, PenLine, StickyNote } from 'lucide-react';
import type { OwnerFileRow } from '../model';
import { openThumbSource } from '../open';
import { iconForRow, resolveThumbSource, type OwnerFileIcon } from '../thumb';
import type { OwnerFilesTransport } from '../transport';
import { useOpenedSource } from './useOpenedSource';

const ICONS: Record<OwnerFileIcon, React.ComponentType<{ className?: string }>> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  pdf: FileText,
  note: StickyNote,
  collection: Layers,
  pen: PenLine,
  file: File
};

export function OwnerFileIconTile({ icon, compact }: { icon: OwnerFileIcon; compact?: boolean }) {
  const Icon = ICONS[icon];
  return (
    <div className="w-full h-full flex items-center justify-center bg-neutral-800/70">
      <Icon className={`${compact ? 'h-5 w-5' : 'h-8 w-8'} text-blue-400`} />
    </div>
  );
}

export interface OwnerFileThumbProps {
  transport: OwnerFilesTransport;
  row: OwnerFileRow;
  compact?: boolean;
}

export function OwnerFileThumb({ transport, row, compact }: OwnerFileThumbProps) {
  const source = resolveThumbSource(row);
  const sourceKey =
    source.type === 'icon'
      ? null
      : `${row.key}|${source.type}|${'driveFileId' in source ? source.driveFileId : ''}|${
          'metadataIndexFileId' in source ? source.metadataIndexFileId : ''
        }`;
  const { opened, loading } = useOpenedSource(sourceKey, () => openThumbSource(transport, source));

  if (source.type === 'icon') return <OwnerFileIconTile icon={source.icon} compact={compact} />;
  if (opened) {
    if (opened.mimeType.startsWith('video/')) {
      return <video src={opened.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />;
    }
    return <img src={opened.url} alt={row.displayName} className="w-full h-full object-cover" loading="lazy" />;
  }
  if (loading) return <div className="w-full h-full animate-pulse bg-neutral-800/70" />;
  return <OwnerFileIconTile icon={iconForRow(row)} compact={compact} />;
}
