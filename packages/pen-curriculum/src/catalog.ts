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
  historyChainPath
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
      pastDir: pastDirPath(docId)
    },
    rules: [
      'Never invent paths outside par-noir-pen/{docId}/',
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
