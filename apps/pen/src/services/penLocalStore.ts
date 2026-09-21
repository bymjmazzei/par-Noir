/** Local index of Pen docs (manifest cache). Cloud replica is SoT after promote. */

import type { PenDocManifest, PenHistoryChain, PenSectionContent } from '@par-noir/pen-protocol';

const prefix = (pn: string) => `pen_docs_v1:${pn}`;

export interface LocalDocSummary {
  docId: string;
  title: string;
  templateId: string;
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
    return raw ? (JSON.parse(raw) as LocalDocBundle) : null;
  } catch {
    return null;
  }
}

export function saveLocalDoc(pn: string, bundle: LocalDocBundle): void {
  localStorage.setItem(`${prefix(pn)}:doc:${bundle.manifest.docId}`, JSON.stringify(bundle));
  const idx = listLocalDocs(pn).filter((d) => d.docId !== bundle.manifest.docId);
  idx.unshift({
    docId: bundle.manifest.docId,
    title: bundle.manifest.title,
    templateId: bundle.manifest.templateId,
    updatedAt: bundle.manifest.updatedAt
  });
  saveIndex(pn, idx);
}
