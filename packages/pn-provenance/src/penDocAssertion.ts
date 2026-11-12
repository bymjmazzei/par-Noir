/**
 * `org.parnoir.pen.doc`: which Pen doc a file came from and the license it was published under.
 * C2PA drops a trailing `.vN` from custom labels, so the label carries no version; `v` does.
 */

import type { PenDocManifest, PenLicenseFamily, PenWorkLicense } from '@par-noir/pen-protocol';

export const PEN_DOC_ASSERTION_LABEL = 'org.parnoir.pen.doc';

export interface PenDocAssertionData {
  v: 1;
  docId: string;
  penIrRef: { objectId: string };
  templateId: string;
  license: { family: PenLicenseFamily; workLicense: PenWorkLicense };
}

export function penDocAssertion(manifest: Pick<PenDocManifest, 'docId' | 'templateId' | 'licensing'>): {
  label: typeof PEN_DOC_ASSERTION_LABEL;
  data: PenDocAssertionData;
} {
  return {
    label: PEN_DOC_ASSERTION_LABEL,
    data: {
      v: 1,
      docId: manifest.docId,
      penIrRef: { objectId: manifest.docId },
      templateId: manifest.templateId,
      license: {
        family: manifest.licensing?.family ?? 'unconditionalFree',
        workLicense: manifest.licensing?.workLicense ?? 'all-rights-reserved',
      },
    },
  };
}

export function parsePenDocAssertion(raw: unknown): PenDocAssertionData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const license = d.license as Record<string, unknown> | undefined;
  if (d.v !== 1 || typeof d.docId !== 'string' || typeof d.templateId !== 'string') return null;
  if (!license || typeof license.family !== 'string' || typeof license.workLicense !== 'string') return null;
  return {
    v: 1,
    docId: d.docId,
    penIrRef: { objectId: d.docId },
    templateId: d.templateId,
    license: { family: license.family as PenLicenseFamily, workLicense: license.workLicense as PenWorkLicense },
  };
}
