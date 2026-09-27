/** Copy a widget's layers into the current section. A poll mints its own spreadsheet. */

import {
  copyWidgetLayersIntoSection,
  groupNeedsTrackingSheet,
  patchLayerStyle,
  rewriteSeedTablePlaceholders,
  sectionNeedsSeedTable,
  structureFromLayers,
  type PenPageLayer,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { createTablePrimitiveDoc } from './createDocFromTemplate';
import { createPollSheet } from './pollCloud';
import type { PenSession } from './penSession';

export async function insertWidgetCopy(input: {
  session: PenSession;
  docId: string;
  host: PenSectionContent;
  layers: PenPageLayer[];
  name: string;
  templateId?: string;
}): Promise<{ section: PenSectionContent; groupId: string }> {
  const copied = copyWidgetLayersIntoSection(
    input.host,
    input.layers,
    input.name,
    input.templateId
  );
  if (groupNeedsTrackingSheet(copied.section, copied.groupId)) {
    const structure = structureFromLayers(copied.section, copied.groupId);
    const spreadsheetId = await createPollSheet({
      session: input.session,
      docId: input.docId,
      groupId: copied.groupId,
      structure
    });
    const section = patchLayerStyle(copied.section, copied.groupId, { spreadsheetId });
    return { section, groupId: copied.groupId };
  }
  if (!sectionNeedsSeedTable([copied.section])) return copied;
  const table = await createTablePrimitiveDoc({
    session: input.session,
    title: `${input.name || 'Widget'} table`
  });
  const [section] = rewriteSeedTablePlaceholders([copied.section], table.manifest.docId);
  if (!section) return copied;
  return { section, groupId: copied.groupId };
}
