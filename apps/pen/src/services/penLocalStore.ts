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
  /** Optional My Library folder. */
  folderId?: string | null;
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

import {
  sanitizeBundleMedia,
  stripInlineMediaFromBundle,
  throwIfQuota
} from './penLocalStoreSanitize';

function writeLocalDoc(pn: string, bundle: LocalDocBundle): void {
  const normalized: LocalDocBundle = {
    ...bundle,
    sections: normalizeSections(bundle.sections)
  };
  // Fail closed: never persist inline data:/blob: into localStorage.
  const safe = stripInlineMediaFromBundle(normalized);
  try {
    localStorage.setItem(
      `${prefix(pn)}:doc:${safe.manifest.docId}`,
      JSON.stringify(safe)
    );
  } catch (e) {
    throwIfQuota(e);
  }
  const existing = listLocalDocs(pn).find((d) => d.docId === safe.manifest.docId);
  const idx = listLocalDocs(pn).filter((d) => d.docId !== safe.manifest.docId);
  idx.unshift({
    docId: safe.manifest.docId,
    title: safe.manifest.title,
    templateId: safe.manifest.templateId,
    classId: safe.manifest.classId,
    updatedAt: safe.manifest.updatedAt,
    folderId: existing?.folderId ?? null
  });
  try {
    saveIndex(pn, idx);
  } catch (e) {
    throwIfQuota(e);
  }
  try {
    window.dispatchEvent(
      new CustomEvent('pen-doc-updated', {
        detail: { pn, docId: safe.manifest.docId }
      })
    );
  } catch {
    /* non-browser */
  }
}

/**
 * Sync save — strips inline media. Prefer {@link saveLocalDocAsync} so data: migrates to IDB.
 */
export function saveLocalDoc(pn: string, bundle: LocalDocBundle): void {
  writeLocalDoc(pn, bundle);
}

/** Migrate data:/blob: → penlocal: then write. Returns the sanitized bundle. */
export async function saveLocalDocAsync(
  pn: string,
  bundle: LocalDocBundle
): Promise<LocalDocBundle> {
  const sanitized = await sanitizeBundleMedia(bundle);
  writeLocalDoc(pn, sanitized);
  return sanitized;
}

export { PenLocalStoreQuotaError } from './penLocalStoreSanitize';

export function deleteLocalDoc(pn: string, docId: string): void {
  localStorage.removeItem(`${prefix(pn)}:doc:${docId}`);
  saveIndex(
    pn,
    listLocalDocs(pn).filter((d) => d.docId !== docId)
  );
  try {
    window.dispatchEvent(
      new CustomEvent('pen-doc-updated', {
        detail: { pn, docId, deleted: true }
      })
    );
  } catch {
    /* non-browser */
  }
}

export function deleteLocalDocs(pn: string, docIds: string[]): void {
  const remove = new Set(docIds);
  for (const id of remove) {
    localStorage.removeItem(`${prefix(pn)}:doc:${id}`);
  }
  saveIndex(
    pn,
    listLocalDocs(pn).filter((d) => !remove.has(d.docId))
  );
  try {
    for (const id of remove) {
      window.dispatchEvent(
        new CustomEvent('pen-doc-updated', {
          detail: { pn, docId: id, deleted: true }
        })
      );
    }
  } catch {
    /* non-browser */
  }
}

/** Wipe offline buffer for this identity (cloud is SoT). */
export function clearLocalDocsForPn(pn: string): void {
  const docs = listLocalDocs(pn);
  for (const d of docs) {
    localStorage.removeItem(`${prefix(pn)}:doc:${d.docId}`);
  }
  localStorage.removeItem(`${prefix(pn)}:index`);
}

export function renameLocalDoc(pn: string, docId: string, title: string): void {
  const nextTitle = title.trim() || 'Untitled';
  const bundle = loadLocalDoc(pn, docId);
  if (bundle) {
    saveLocalDoc(pn, {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        title: nextTitle,
        updatedAt: new Date().toISOString()
      }
    });
  }
  const idx = listLocalDocs(pn).map((d) =>
    d.docId === docId ? { ...d, title: nextTitle, updatedAt: new Date().toISOString() } : d
  );
  saveIndex(pn, idx);
}

export function moveLocalDocToFolder(
  pn: string,
  docId: string,
  folderId: string | null
): void {
  const idx = listLocalDocs(pn).map((d) =>
    d.docId === docId ? { ...d, folderId } : d
  );
  saveIndex(pn, idx);
  try {
    window.dispatchEvent(
      new CustomEvent('pen-doc-updated', {
        detail: { pn, docId, folderId }
      })
    );
  } catch {
    /* non-browser */
  }
}

export const PEN_DOC_UPDATED_EVENT = 'pen-doc-updated';
