/**
 * In-flight media work by kind, so a long-task report can say what was running.
 */

const counts = new Map<string, number>();

export async function trackActivity<T>(kind: string, work: () => Promise<T>): Promise<T> {
  counts.set(kind, (counts.get(kind) ?? 0) + 1);
  try {
    return await work();
  } finally {
    const left = (counts.get(kind) ?? 1) - 1;
    if (left > 0) counts.set(kind, left);
    else counts.delete(kind);
  }
}

/** Kinds with work in flight right now, e.g. `{ upload: 1, 'idb-write': 1 }`. */
export function penMediaActivity(): Record<string, number> {
  return Object.fromEntries(counts);
}
