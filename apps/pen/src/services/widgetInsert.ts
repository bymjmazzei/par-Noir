/** Copy a widget's layers into the current section, minting a private table when the seed needs one. */

import {
  copyWidgetLayersIntoSection,
  rewriteSeedTablePlaceholders,
  sectionNeedsSeedTable,
  type PenPageLayer,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { createTablePrimitiveDoc } from './createDocFromTemplate';
import type { PenSession } from './penSession';

export async function insertWidgetCopy(input: {
  session: PenSession;
  host: PenSectionContent;
  layers: PenPageLayer[];
  name: string;
}): Promise<{ section: PenSectionContent; groupId: string }> {
  const copied = copyWidgetLayersIntoSection(input.host, input.layers, input.name);
  if (!sectionNeedsSeedTable([copied.section])) return copied;
  const table = await createTablePrimitiveDoc({
    session: input.session,
    title: `${input.name || 'Widget'} table`
  });
  const [section] = rewriteSeedTablePlaceholders([copied.section], table.manifest.docId);
  if (!section) return copied;
  return { section, groupId: copied.groupId };
}
