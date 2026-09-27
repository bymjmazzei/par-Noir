/**
 * Using a public widget clones its layers into the user's template directory
 * and opens that copy. The author's spreadsheet is not copied.
 */

import {
  stripPollSpreadsheetFromSection,
  templateRootPath,
  type PenSectionContent,
  type PenTemplate
} from '@par-noir/pen-protocol';
import { createDocFromTemplate } from './createDocFromTemplate';
import { starTemplateToCloud } from './penCloudTemplates';
import type { LocalDocBundle } from './penLocalStore';
import type { PenSession } from './penSession';
import { ensureBundleTrackingSheets, type MintTrackingSheet } from './widgetTracking';

export async function clonePublishedWidget(input: {
  session: PenSession;
  fileId: string;
  title: string;
  sections: PenSectionContent[];
  mintSheet?: MintTrackingSheet;
}): Promise<{ bundle: LocalDocBundle; cloudPath: string; personalId: string }> {
  const sections = input.sections.map(stripPollSpreadsheetFromSection);
  const templateId = `pubwidget_${input.fileId}`;
  const template: PenTemplate = {
    id: templateId,
    classId: 'widgets.widget',
    docType: 'widget',
    version: '1',
    title: input.title,
    description: 'Public template',
    sections: sections.map((section) => ({
      slug: section.slug,
      title: section.slug,
      required: true
    })),
    seedSections: sections,
    agentStarter: ''
  };
  const created = await createDocFromTemplate({
    session: input.session,
    templateId,
    templates: [template],
    title: input.title
  });
  const bundle = await ensureBundleTrackingSheets({
    session: input.session,
    bundle: created,
    mintSheet: input.mintSheet
  });
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
