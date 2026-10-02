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
    let timer = 0;
    let attempt = 0;
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
    const load = async () => {
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
        if (cancelled) return;
        setResolved(url);
        setLoading(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (!cancelled && message === 'doc_key_required' && attempt < 5) {
          attempt += 1;
          timer = window.setTimeout(() => {
            void load();
          }, 300);
          return;
        }
        if (!cancelled) {
          setResolved(null);
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [src, opts?.docId, opts?.session?.pnIdentifier, opts?.session?.accessToken]);

  return { resolved, loading };
}
