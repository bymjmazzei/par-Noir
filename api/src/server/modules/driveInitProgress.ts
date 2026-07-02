/**
 * In-memory Drive init progress for dashboard polling during POST /storage/initialize.
 */

import { normalizePnIdentifier } from './integratorStoragePaths';

export type DriveInitPhase =
  | 'starting'
  | 'folders'
  | 'contentClass'
  | 'messages'
  | 'metadataSheets'
  | 'profile'
  | 'permissions'
  | 'verify'
  | 'persist'
  | 'complete'
  | 'failed';

export interface DriveInitProgress {
  phase: DriveInitPhase;
  stepLabel: string;
  percent: number;
  updatedAt: number;
}

const progressByPn = new Map<string, DriveInitProgress>();

export function setDriveInitProgress(
  pnIdentifier: string,
  phase: DriveInitPhase,
  stepLabel: string,
  percent: number
): void {
  const key = normalizePnIdentifier(pnIdentifier);
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  progressByPn.set(key, {
    phase,
    stepLabel,
    percent: clamped,
    updatedAt: Date.now(),
  });
}

export function getDriveInitProgress(pnIdentifier: string): DriveInitProgress | null {
  return progressByPn.get(normalizePnIdentifier(pnIdentifier)) ?? null;
}

export function clearDriveInitProgress(pnIdentifier: string): void {
  progressByPn.delete(normalizePnIdentifier(pnIdentifier));
}

export function isDriveInitProgressActive(pnIdentifier: string): boolean {
  const p = getDriveInitProgress(pnIdentifier);
  if (!p) return false;
  return p.phase !== 'complete' && p.phase !== 'failed';
}
