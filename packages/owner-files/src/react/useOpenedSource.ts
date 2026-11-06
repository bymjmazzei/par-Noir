import { useEffect, useState } from 'react';
import type { OpenedSource } from '../open';

export interface OpenedSourceState {
  opened: OpenedSource | null;
  loading: boolean;
  error: string | null;
}

/** Runs `load` when `key` changes; revokes object URLs it created on change / unmount. */
export function useOpenedSource(
  key: string | null,
  load: () => Promise<OpenedSource | null>
): OpenedSourceState {
  const [state, setState] = useState<OpenedSourceState>({ opened: null, loading: !!key, error: null });

  useEffect(() => {
    if (!key) {
      setState({ opened: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    let created: OpenedSource | null = null;
    setState({ opened: null, loading: true, error: null });
    load()
      .then((opened) => {
        if (cancelled) {
          if (opened?.revoke) URL.revokeObjectURL(opened.url);
          return;
        }
        created = opened;
        setState({ opened, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ opened: null, loading: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
      if (created?.revoke) URL.revokeObjectURL(created.url);
    };
    // `load` closes over the row; `key` identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
