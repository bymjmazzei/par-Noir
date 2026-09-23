/**
 * Cloud SoT for starred/created templates under par-noir-pen/templates/.
 * Writes IR snapshot keyed by templateManifestPath; personal Yours + prefs push
 * remain the sync buffer until a dedicated Drive templates apply-inbound lands.
 */

import { templateManifestPath, templateRootPath } from '@par-noir/pen-protocol';
import {
  listPersonalTemplates,
  savePersonalTemplateFromDoc,
  type PersonalTemplate
} from './penPersonalTemplates';
import type { LocalDocBundle } from './penLocalStore';
import type { PenSession } from './penSession';

const irStoreKey = (pn: string, templateId: string) =>
  `pen_cloud_template_ir:${pn}:${templateManifestPath(templateId)}`;

export interface CloudTemplateIrBlob {
  v: 1;
  templateId: string;
  cloudPath: string;
  basedOnFileId?: string;
  basedOnTemplateId?: string;
  manifest: LocalDocBundle['manifest'];
  sections: LocalDocBundle['sections'];
  savedAt: string;
}

function writeIrSnapshot(
  pn: string,
  personalId: string,
  bundle: LocalDocBundle,
  opts?: { basedOnFileId?: string }
): CloudTemplateIrBlob {
  const blob: CloudTemplateIrBlob = {
    v: 1,
    templateId: personalId,
    cloudPath: templateRootPath(personalId),
    basedOnFileId: opts?.basedOnFileId,
    basedOnTemplateId: bundle.manifest.templateId,
    manifest: {
      ...bundle.manifest,
      basedOnTemplateId: bundle.manifest.basedOnTemplateId || bundle.manifest.templateId,
      basedOnFileId: opts?.basedOnFileId || bundle.manifest.basedOnFileId
    },
    sections: bundle.sections.map((s) => ({ ...s })),
    savedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(irStoreKey(pn, personalId), JSON.stringify(blob));
  } catch {
    /* quota — personal Yours still holds seeds */
  }
  return blob;
}

/**
 * Star / save a template into the owner's cloud templates tree.
 * Copies full IR (sections + layer locks/visibility) into Yours + path-keyed IR buffer.
 */
export async function starTemplateToCloud(
  session: PenSession,
  bundle: LocalDocBundle,
  opts?: { title?: string; basedOnFileId?: string }
): Promise<PersonalTemplate> {
  const personal = savePersonalTemplateFromDoc(session.pnIdentifier, bundle, {
    title: opts?.title,
    basedOnTemplateId: bundle.manifest.templateId,
    seedSections: bundle.sections.map((s) => ({ ...s }))
  });
  writeIrSnapshot(session.pnIdentifier, personal.id, bundle, {
    basedOnFileId: opts?.basedOnFileId
  });
  return personal;
}

export function loadCloudTemplateIr(
  pn: string,
  templateId: string
): CloudTemplateIrBlob | null {
  try {
    const raw = localStorage.getItem(irStoreKey(pn, templateId));
    return raw ? (JSON.parse(raw) as CloudTemplateIrBlob) : null;
  } catch {
    return null;
  }
}

export function listStarredTemplatesLocal(pn: string): PersonalTemplate[] {
  return listPersonalTemplates(pn);
}
