/**
 * Resolve penlocal:/penmedia: src to a playable blob or pass-through URL.
 */

import { useEffect, useState } from 'react';
import { ensurePenMediaUrl, isPenMediaSrcRef } from '@par-noir/pen-media';
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
        const url = await ensurePenMediaUrl({
          src,
          docId: opts?.docId,
          pnIdentifier: opts?.session?.pnIdentifier
        });
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
