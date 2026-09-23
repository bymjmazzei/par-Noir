/**
 * Catalog / schema / path-grammar snapshots derived from @par-noir/pen-protocol.
 * SoT remains the protocol package — curriculum only exports teaching data.
 */

import {
  listStarterTemplates,
  listClasses,
  penAgentBuildJsonSchema,
  PEN_ROOT,
  docManifestPath,
  currentDirPath,
  draftsDirPath,
  pastDirPath,
  historyChainPath,
  fontsRootPath,
  fontsIndexPath,
  docFontsDirPath,
  docFontPath,
  templatesRootPath
} from '@par-noir/pen-protocol';

export const CURRICULUM_PEN_PROTOCOL_VERSION = '0.1.0';

export function buildCatalogSnapshot() {
  const templates = listStarterTemplates().map((t) => ({
    id: t.id,
    classId: t.classId,
    docType: t.docType,
    version: t.version,
    title: t.title,
    description: t.description,
    sections: t.sections,
    publishContentClass: t.publishContentClass,
    agentStarter: t.agentStarter,
    registerColumns: t.registerColumns
  }));
  return {
    penProtocolVersion: CURRICULUM_PEN_PROTOCOL_VERSION,
    exportedAt: 'generated',
    classes: listClasses(),
    templates
  };
}

export function buildPathGrammarSnapshot() {
  const docId = '{docId}';
  const draftId = '{draftId}';
  const fontId = '{fontId}';
  return {
    penProtocolVersion: CURRICULUM_PEN_PROTOCOL_VERSION,
    root: PEN_ROOT,
    examples: {
      docRoot: `${PEN_ROOT}/${docId}`,
      manifest: docManifestPath(docId),
      history: historyChainPath(docId),
      currentDir: currentDirPath(docId),
      draftsDir: draftsDirPath(docId),
      draftDir: `${draftsDirPath(docId)}/${draftId}`,
      pastDir: pastDirPath(docId),
      templatesRoot: templatesRootPath(),
      fontsRoot: fontsRootPath(),
      fontsIndex: fontsIndexPath(),
      docFontsDir: docFontsDirPath(docId),
      docFont: docFontPath(docId, fontId)
    },
    rules: [
      'Owner My Fonts live under par-noir-pen/fonts/ + fonts.index.json (personal library)',
      'Doc-scoped fonts live under par-noir-pen/{docId}/fonts/{fontId}.penfont (docKey envelopes only)',
      'Never write plain TTF/OTF into peer replicas or peer My Fonts from collab fanout',
      'Use materializePenAgentBuild for file layouts',
      'drafts/ for WIP; current/ for published live; past/ for superseded'
    ]
  };
}

export function buildAgentBuildSchemaSnapshot() {
  return {
    ...penAgentBuildJsonSchema(),
    penProtocolVersion: CURRICULUM_PEN_PROTOCOL_VERSION
  };
}
