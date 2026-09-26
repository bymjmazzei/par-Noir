/** Local kit table primitives — bind targets for embed and action layers. */

import { parseTablePayloadFromTipTap, type PenTablePayload, type PenTableRow } from '@par-noir/pen-protocol';
import { listLocalDocs, loadLocalDoc, type LocalDocSummary } from './penLocalStore';

export function listLocalTableDocs(pn: string): LocalDocSummary[] {
  return listLocalDocs(pn).filter((d) => d.classId === 'primitives.table');
}

export function loadTablePayload(pn: string, docId: string): PenTablePayload | null {
  const doc = loadLocalDoc(pn, docId);
  if (!doc) return null;
  for (const section of doc.sections) {
    const payload = parseTablePayloadFromTipTap(section.doc);
    if (payload) return payload;
  }
  return null;
}

export function tableDocTitle(pn: string, docId: string): string {
  const doc = loadLocalDoc(pn, docId);
  return doc?.manifest.title?.trim() || 'Table';
}

export function tableRowLabel(row: PenTableRow): string {
  const label = row.cells.label;
  if (typeof label === 'string' && label.trim()) return label;
  for (const value of Object.values(row.cells)) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return row.id;
}
