/**
 * Resolve penlocal:/penmedia:/legacy src to a playable blob or pass-through URL.
 */

import { useEffect, useState } from 'react';
import {
  isPenMediaRef,
  isPenMediaSrcRef,
  parsePenMediaFileId,
  putLocalMediaForDriveFile,
  resolvePenMediaSrc
} from '../services/penLocalMedia';
import { downloadCloudMediaBlob } from '../services/penAttach';
import type { PenSession } from '../services/penSession';

export function useResolvedMediaSrc(
  src: string | null | undefined,
  opts?: {
    docId?: string;
    session?: PenSession | null;
  }
): { resolved: string | null; loading: boolean } {
  const [resolved, setResolved] = useState<string | null>(() => {
    if (!src) return null;
    if (!isPenMediaSrcRef(src)) return src;
    return null;
  });
  const [loading, setLoading] = useState(() => Boolean(src && isPenMediaSrcRef(src)));

  useEffect(() => {
    let cancelled = false;
    if (!src) {
      setResolved(null);
      setLoading(false);
      return;
    }
    if (!isPenMediaSrcRef(src)) {
      setResolved(src);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        let url = await resolvePenMediaSrc(src, opts?.docId);
        if (!url && isPenMediaRef(src) && opts?.docId && opts.session) {
          const fileId = parsePenMediaFileId(src);
          if (fileId) {
            const { blob } = await downloadCloudMediaBlob(
              fileId,
              opts.session.pnIdentifier,
              opts.docId
            );
            const put = await putLocalMediaForDriveFile({
              docId: opts.docId,
              fileId,
              blob
            });
            url = put.blobUrl;
          }
        }
        if (!cancelled) {
          setResolved(url);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setResolved(null);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, opts?.docId, opts?.session?.pnIdentifier]);

  return { resolved, loading };
}
