/** One tracking spreadsheet per widget group that records presses, plus the doc's Taps sheet. */

import {
  groupNeedsTrackingSheet,
  isSheetTrigger,
  patchLayerStyle,
  sectionsHaveTapButtons,
  TAP_WIDGET_GROUP,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { createPollSheet } from './pollCloud';
import type { LocalDocBundle } from './penLocalStore';
import type { PenSession } from './penSession';

export type MintTrackingSheet = (input: {
  session: PenSession;
  docId: string;
  groupId: string;
  section: PenSectionContent;
  title?: string;
}) => Promise<string>;

export async function ensureBundleTrackingSheets(input: {
  session: PenSession;
  bundle: LocalDocBundle;
  mintSheet?: MintTrackingSheet;
  /** Publish only: give a post with open, go-to-page, or calendar buttons a Taps sheet. */
  taps?: boolean;
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
      const inherited = (group?.spreadsheetId || '').trim();
      if (inherited) {
        if (groupId && group?.spreadsheetId !== inherited) {
          section = patchLayerStyle(section, groupId, { spreadsheetId: inherited });
        } else if (!groupId) {
          section = stampTrackingSheet(section, inherited);
        }
        continue;
      }
      const effectiveGroupId = groupId || groups[0]?.id || manifest.docId;
      const spreadsheetId = await mint({
        session: input.session,
        docId: manifest.docId,
        groupId: effectiveGroupId,
        section
      });
      section = patchLayerStyle(section, effectiveGroupId, { spreadsheetId });
    }
    sections[i] = section;
  }

  if (input.taps && sectionsHaveTapButtons(sections) && !manifest.tapSpreadsheetId?.trim()) {
    const shared = sections
      .flatMap((section) => section.layers || [])
      .map((layer) => (layer.spreadsheetId || '').trim())
      .find(Boolean);
    const tapSpreadsheetId =
      shared ||
      (await mint({
        session: input.session,
        docId: manifest.docId,
        groupId: TAP_WIDGET_GROUP,
        section: sections[0]!,
        title: `Taps ${manifest.docId.slice(0, 8)}`
      }));
    manifest = { ...manifest, tapSpreadsheetId };
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
