/** Local index of Pen docs (manifest cache). Cloud replica is SoT after promote. */

import {
  normalizeSections,
  type PenDocManifest,
  type PenHistoryChain,
  type PenSectionContent
} from '@par-noir/pen-protocol';

const prefix = (pn: string) => `pen_docs_v1:${pn}`;

export interface LocalDocSummary {
  docId: string;
  title: string;
  templateId: string;
  /** Form class id when known (for home category grouping). */
  classId?: string;
  updatedAt: string;
}

export interface LocalDocBundle {
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  chain: PenHistoryChain;
}

export function listLocalDocs(pn: string): LocalDocSummary[] {
  try {
    const raw = localStorage.getItem(`${prefix(pn)}:index`);
    return raw ? (JSON.parse(raw) as LocalDocSummary[]) : [];
  } catch {
    return [];
  }
}

function saveIndex(pn: string, docs: LocalDocSummary[]) {
  localStorage.setItem(`${prefix(pn)}:index`, JSON.stringify(docs));
}

export function loadLocalDoc(pn: string, docId: string): LocalDocBundle | null {
  try {
    const raw = localStorage.getItem(`${prefix(pn)}:doc:${docId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDocBundle;
    return {
      ...parsed,
      sections: normalizeSections(parsed.sections || [])
    };
  } catch {
    return null;
  }
}

export function saveLocalDoc(pn: string, bundle: LocalDocBundle): void {
  const normalized: LocalDocBundle = {
    ...bundle,
    sections: normalizeSections(bundle.sections)
  };
  localStorage.setItem(
    `${prefix(pn)}:doc:${normalized.manifest.docId}`,
    JSON.stringify(normalized)
  );
  const idx = listLocalDocs(pn).filter((d) => d.docId !== normalized.manifest.docId);
  idx.unshift({
    docId: normalized.manifest.docId,
    title: normalized.manifest.title,
    templateId: normalized.manifest.templateId,
    classId: normalized.manifest.classId,
    updatedAt: normalized.manifest.updatedAt
  });
  saveIndex(pn, idx);
}
