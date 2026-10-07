/**
 * Using a public widget clones its layers into the user's template directory
 * and opens that copy. The author's spreadsheet is not copied.
 */

import {
  licensingForTemplateReuse,
  stripPollSpreadsheetFromSection,
  templateRootPath,
  type PenLicensingRoot,
  type PenSectionContent,
  type PenTemplate
} from '@par-noir/pen-protocol';
import { createDocFromTemplate } from './createDocFromTemplate';
import { starTemplateToCloud } from './penCloudTemplates';
import { saveLocalDoc, type LocalDocBundle } from './penLocalStore';
import type { PenSession } from './penSession';
import { ensureBundleTrackingSheets, type MintTrackingSheet } from './widgetTracking';

function docTypeForClass(classId: string): string {
  if (classId === 'widgets.sticker') return 'sticker';
  if (classId === 'widgets.animation') return 'animation';
  if (classId === 'widgets.transition') return 'transition';
  if (classId === 'widgets.text_preset') return 'text_preset';
  if (classId === 'widgets.widget') return 'widget';
  return classId.split('.').pop() || 'note';
}

export async function clonePublishedWidget(input: {
  session: PenSession;
  fileId: string;
  title: string;
  sections: PenSectionContent[];
  mintSheet?: MintTrackingSheet;
  classId?: string;
  licensing?: PenLicensingRoot;
  basedOnTemplateId?: string;
}): Promise<{ bundle: LocalDocBundle; cloudPath: string; personalId: string }> {
  const sections = input.sections.map(stripPollSpreadsheetFromSection);
  const classId = input.classId || 'widgets.widget';
  const templateId = input.basedOnTemplateId || `pubwidget_${input.fileId}`;
  const licensing = licensingForTemplateReuse(classId, input.licensing);
  const template: PenTemplate = {
    id: templateId,
    classId,
    docType: docTypeForClass(classId),
    version: '1',
    title: input.title,
    description: 'Public template',
    sections: sections.map((section) => ({
      slug: section.slug,
      title: section.slug,
      required: true
    })),
    seedSections: sections,
    licensing,
    agentStarter: ''
  };
  const created = await createDocFromTemplate({
    session: input.session,
    templateId,
    templates: [template],
    title: input.title,
    basedOnTemplateId: templateId,
    basedOnFileId: input.fileId
  });
  const tracked = await ensureBundleTrackingSheets({
    session: input.session,
    bundle: created,
    mintSheet: input.mintSheet
  });
  const bundle: LocalDocBundle = {
    ...tracked,
    manifest: {
      ...tracked.manifest,
      classId,
      docType: docTypeForClass(classId),
      basedOnTemplateId: templateId,
      basedOnFileId: input.fileId,
      licensing
    }
  };
  saveLocalDoc(input.session.pnIdentifier, bundle);
  const personal = await starTemplateToCloud(input.session, bundle, {
    title: input.title,
    basedOnFileId: input.fileId
  });
  return {
    bundle,
    cloudPath: templateRootPath(personal.id),
    personalId: personal.id
  };
}
