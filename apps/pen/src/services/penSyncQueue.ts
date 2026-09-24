/**
 * Offline sync buffer — local edits queue until cloud push succeeds.
 */

const QUEUE_PREFIX = 'pen_sync_queue_v1:';

export type PenSyncJobKind =
  | 'bootstrap'
  | 'draft_upsert'
  | 'publish'
  | 'gallery_preview'
  | 'comment'
  | 'suggestion';

export interface PenSyncJob {
  id: string;
  kind: PenSyncJobKind;
  docId: string;
  createdAt: string;
  payload: Record<string, unknown>;
  attempts: number;
  lastError?: string;
}

function key(pn: string): string {
  return `${QUEUE_PREFIX}${pn}`;
}

export function listSyncJobs(pn: string): PenSyncJob[] {
  try {
    return JSON.parse(localStorage.getItem(key(pn)) || '[]') as PenSyncJob[];
  } catch {
    return [];
  }
}

function saveJobs(pn: string, jobs: PenSyncJob[]): void {
  localStorage.setItem(key(pn), JSON.stringify(jobs));
}

export function enqueueSyncJob(
  pn: string,
  job: Omit<PenSyncJob, 'id' | 'createdAt' | 'attempts'> & { id?: string }
): PenSyncJob {
  const full: PenSyncJob = {
    id: job.id || `sync_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    kind: job.kind,
    docId: job.docId,
    createdAt: new Date().toISOString(),
    payload: job.payload,
    attempts: 0
  };
  const jobs = listSyncJobs(pn).filter((j) => !(j.kind === full.kind && j.docId === full.docId));
  jobs.push(full);
  saveJobs(pn, jobs);
  return full;
}

export function removeSyncJob(pn: string, id: string): void {
  saveJobs(
    pn,
    listSyncJobs(pn).filter((j) => j.id !== id)
  );
}

export function markSyncJobFailed(pn: string, id: string, error: string): void {
  const jobs = listSyncJobs(pn).map((j) =>
    j.id === id ? { ...j, attempts: j.attempts + 1, lastError: error } : j
  );
  saveJobs(pn, jobs);
}

export function pendingSyncCount(pn: string): number {
  return listSyncJobs(pn).length;
}

/** True while local-first create has not finished apply-inbound bootstrap. */
export function isDocBootstrapPending(pn: string, docId: string): boolean {
  return listSyncJobs(pn).some((j) => j.kind === 'bootstrap' && j.docId === docId);
}
