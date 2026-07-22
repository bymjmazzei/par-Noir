/**
 * Inline E2E messaging media attachment (decrypt + display).
 */

import React, { useEffect, useState } from 'react';
import { Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react';
import {
  fetchAndDecryptAttachment,
  type MessagingThreadContext
} from '../services/messagingMediaService';

interface MessageMediaAttachmentProps {
  mediaFileId: string;
  mediaBackend?: string;
  threadContext: MessagingThreadContext;
  accountId?: string;
  mimeTypeHint?: string;
}

export function MessageMediaAttachment({
  mediaFileId,
  mediaBackend,
  threadContext,
  accountId,
  mimeTypeHint
}: MessageMediaAttachmentProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('application/octet-stream');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { blob, mimeType: mt } = await fetchAndDecryptAttachment(
          mediaFileId,
          threadContext,
          accountId,
          mimeTypeHint,
          mediaBackend
        );
        if (cancelled) {
          return;
        }
        const url = URL.createObjectURL(blob);
        revoked = url;
        setObjectUrl(url);
        setMimeType(mt || blob.type || 'application/octet-stream');
      } catch {
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (revoked) {
        URL.revokeObjectURL(revoked);
      }
    };
  }, [mediaFileId, mediaBackend, threadContext, accountId, mimeTypeHint]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-neutral-400 text-xs py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading attachment…
      </div>
    );
  }

  if (error || !objectUrl) {
    return (
      <div className="flex items-center gap-2 text-neutral-400 text-xs py-1">
        <AlertCircle className="h-3 w-3" />
        Couldn&apos;t load attachment
      </div>
    );
  }

  if (mimeType.startsWith('image/')) {
    return (
      <a href={objectUrl} target="_blank" rel="noopener noreferrer" className="block mt-1 max-w-xs">
        <img
          src={objectUrl}
          alt="Attachment"
          className="rounded-lg max-h-48 w-auto border border-neutral-600"
        />
      </a>
    );
  }

  if (mimeType.startsWith('video/')) {
    return (
      <video
        src={objectUrl}
        controls
        className="mt-1 rounded-lg max-h-48 max-w-full border border-neutral-600"
      />
    );
  }

  if (mimeType.startsWith('audio/')) {
    return <audio src={objectUrl} controls className="mt-1 w-full max-w-xs" />;
  }

  return (
    <a
      href={objectUrl}
      download={`attachment-${mediaFileId}`}
      className="inline-flex items-center gap-1 text-blue-300 text-xs mt-1 hover:underline"
    >
      <ImageIcon className="h-3 w-3" />
      Download attachment
    </a>
  );
}
