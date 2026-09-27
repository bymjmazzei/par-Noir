/** One tracking spreadsheet per widget group that records presses. */

import {
  groupNeedsTrackingSheet,
  isSheetTrigger,
  patchLayerStyle,
  structureFromLayers,
  type PenSectionContent,
  type PollStructure
} from '@par-noir/pen-protocol';
import { createPollSheet } from './pollCloud';
import type { LocalDocBundle } from './penLocalStore';
import type { PenSession } from './penSession';

export type MintTrackingSheet = (input: {
  session: PenSession;
  docId: string;
  groupId: string;
  structure: PollStructure;
}) => Promise<string>;

export async function ensureBundleTrackingSheets(input: {
  session: PenSession;
  bundle: LocalDocBundle;
  mintSheet?: MintTrackingSheet;
}): Promise<LocalDocBundle> {
  const mint = input.mintSheet || createPollSheet;
  let manifest = input.bundle.manifest;
  const sections: PenSectionContent[] = input.bundle.sections.map((section) => ({
    ...section,
    layers: section.layers?.map((layer) => ({ ...layer }))
  }));

  for (let i = 0; i < sections.length; i += 1) {
    let section = sections[i]!;
    const groups = (section.layers || []).filter(
      (layer) => layer.kind === 'group' && groupNeedsTrackingSheet(section, layer.id)
    );
    const targets: Array<string | null> = groups.length
      ? groups.map((group) => group.id)
      : groupNeedsTrackingSheet(section, null)
        ? [null]
        : [];
    for (const groupId of targets) {
      const group = groupId
        ? (section.layers || []).find((layer) => layer.id === groupId)
        : undefined;
      const inherited = (
        group?.spreadsheetId ||
        (!groupId ? manifest.pollSpreadsheetId : '') ||
        (groups.length === 1 ? manifest.pollSpreadsheetId : '') ||
        ''
      ).trim();
      if (inherited) {
        if (groupId && group?.spreadsheetId !== inherited) {
          section = patchLayerStyle(section, groupId, { spreadsheetId: inherited });
        } else if (!groupId) {
          section = stampTrackingSheet(section, inherited);
        }
        continue;
      }
      const spreadsheetId = await mint({
        session: input.session,
        docId: manifest.docId,
        groupId: groupId || manifest.docId,
        structure: structureFromLayers(section, groupId)
      });
      if (groupId) {
        section = patchLayerStyle(section, groupId, { spreadsheetId });
      } else {
        manifest = { ...manifest, pollSpreadsheetId: spreadsheetId };
        section = stampTrackingSheet(section, spreadsheetId);
      }
    }
    sections[i] = section;
  }

  return { ...input.bundle, manifest, sections };
}

function stampTrackingSheet(section: PenSectionContent, spreadsheetId: string): PenSectionContent {
  return {
    ...section,
    layers: (section.layers || []).map((layer) => {
      if (layer.spreadsheetId) return layer;
      if (layer.behavior === 'poll.vote' || isSheetTrigger(layer.behavior)) {
        return { ...layer, spreadsheetId };
      }
      return layer;
    })
  };
}
