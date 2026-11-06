import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, Globe, Lock, X } from 'lucide-react';
import type { OwnerFileRow } from '../model';
import { NOT_AN_ENCRYPTED_PACKAGE, openPreviewSource, previewRenderKind } from '../open';
import { resolvePreviewSource } from '../preview';
import type { OwnerFilesTransport } from '../transport';
import { useOpenedSource } from './useOpenedSource';

export interface OwnerFileViewerProps {
  transport: OwnerFilesTransport;
  row: OwnerFileRow;
  onClose: () => void;
  /** Download the decrypted file (apps own save-as / native share). */
  onDownload?: (row: OwnerFileRow, blob?: Blob) => void;
  /** Extra header actions (share, edit, delete). */
  actions?: React.ReactNode;
}

function TextPreview({ blob }: { blob: Blob }) {
  const [text, setText] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    void blob.text().then((t) => {
      if (!cancelled) setText(t.length > 200_000 ? `${t.slice(0, 200_000)}\n…` : t);
    });
    return () => {
      cancelled = true;
    };
  }, [blob]);
  return (
    <pre className="w-full max-h-[75vh] overflow-auto whitespace-pre-wrap text-sm text-neutral-200 bg-neutral-900 rounded-lg p-4">
      {text}
    </pre>
  );
}

export function OwnerFileViewer({ transport, row, onClose, onDownload, actions }: OwnerFileViewerProps) {
  const source = resolvePreviewSource(row);
  const { opened, loading, error } = useOpenedSource(
    source.type === 'unavailable' ? null : `${row.key}|preview`,
    () => openPreviewSource(transport, source)
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const kind = opened ? previewRenderKind(opened.mimeType) : null;
  const canOpenInPen = Boolean(row.penDocId && transport.openInPen);

  let body: React.ReactNode;
  if (source.type === 'unavailable') {
    body = <p className="text-neutral-400 text-sm text-center px-6">{source.reason}</p>;
  } else if (loading) {
    body = <div className="h-10 w-10 rounded-full border-2 border-neutral-600 border-t-blue-400 animate-spin" />;
  } else if (error || !opened) {
    body = (
      <p className="text-neutral-400 text-sm text-center px-6">
        {error === NOT_AN_ENCRYPTED_PACKAGE
          ? 'This file could not be decrypted on this device.'
          : 'Preview failed to load.'}
      </p>
    );
  } else if (kind === 'image') {
    body = <img src={opened.url} alt={row.displayName} className="max-w-full max-h-[75vh] object-contain rounded" />;
  } else if (kind === 'video') {
    body = <video src={opened.url} controls autoPlay playsInline className="max-w-full max-h-[75vh] rounded" />;
  } else if (kind === 'audio') {
    body = <audio src={opened.url} controls autoPlay className="w-full max-w-lg" />;
  } else if (kind === 'pdf') {
    body = (
      <object data={opened.url} type="application/pdf" className="w-full h-[75vh] rounded bg-white">
        <p className="text-neutral-400 text-sm p-6">PDF preview is not supported here. Use Download.</p>
      </object>
    );
  } else if (kind === 'text' && opened.blob) {
    body = <TextPreview blob={opened.blob} />;
  } else {
    body = <p className="text-neutral-400 text-sm text-center px-6">No inline preview for this file type.</p>;
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/85 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={row.displayName}
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-800 bg-neutral-950/80"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0">
          {row.visibility === 'public' ? (
            <Globe className="h-4 w-4 text-green-400 flex-shrink-0" aria-label="Public" />
          ) : (
            <Lock className="h-4 w-4 text-blue-400 flex-shrink-0" aria-label="Private" />
          )}
          <span className="text-white text-sm font-medium truncate">{row.displayName}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canOpenInPen && (
            <button
              type="button"
              onClick={() => transport.openInPen!(row.penDocId!)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500"
            >
              <ExternalLink className="h-4 w-4" />
              Open in Pen
            </button>
          )}
          {onDownload && source.type === 'stored' && (
            <button
              type="button"
              onClick={() => onDownload(row, opened?.blob)}
              className="p-2 rounded text-neutral-300 hover:text-white hover:bg-neutral-800"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded text-neutral-300 hover:text-white hover:bg-neutral-800"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto" onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  );
}
