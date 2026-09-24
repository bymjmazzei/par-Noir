/** Shared Pen doc create (New… sheet) — cloud bootstrap + offline buffer. */

import {
  emptySection,
  defaultPagePresentation,
  defaultEditorPagePresentation,
  emptyPollTable,
  getClass,
  hashSectionContent,
  notaryHashForGenesis,
  attachNotary,
  requireTemplate,
  rewriteSeedTablePlaceholders,
  sectionNeedsSeedTable,
  signGenesis,
  hashPnIdentifier,
  ensureOwnerAssignment,
  normalizeLicensingRoot,
  tableSectionFromPayload,
  type PenDocManifest,
  type PenDraftManifest,
  type PenHistoryChain,
  type PenSectionContent,
  type PenTemplate
} from '@par-noir/pen-protocol';
import { generateGroupId } from '@par-noir/dm-crypto';
import type { PenSession } from './penSession';
import { saveLocalDoc, type LocalDocBundle } from './penLocalStore';
import { requestNotaryStamp } from './penApi';
import { resolveSigningKeys } from './penKeys';
import { scheduleDocCloudBootstrap } from './penSyncFlush';
import { mintDocKey } from './penDocCrypto';

function randomDocId(): string {
  return `pen_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function randomDraftId(): string {
  return `draft_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

async function persistBundle(input: {
  session: PenSession;
  template: PenTemplate;
  docId: string;
  sections: PenSectionContent[];
  title?: string;
}): Promise<LocalDocBundle> {
  const draftId = randomDraftId();
  const now = new Date().toISOString();
  const sections = input.sections.map((s) => ({ ...s }));
  const commitment = hashSectionContent(
    new TextEncoder().encode(JSON.stringify(sections))
  );
  const keys = resolveSigningKeys(input.session);
  const ownerPnHash = hashPnIdentifier(input.session.pnIdentifier);

  let genesis = signGenesis({
    docId: input.docId,
    templateId: input.template.id,
    authorPn: input.session.pnIdentifier,
    clientCreatedAt: now,
    contentCommitment: commitment,
    secretKey: keys.secretKey,
    publicKey: keys.publicKey
  });

  try {
    const notary = await requestNotaryStamp(
      input.session.accessToken,
      notaryHashForGenesis(genesis)
    );
    attachNotary(genesis, notary);
  } catch {
    /* optional */
  }

  const groupId = generateGroupId();
  mintDocKey(input.docId);
  sessionStorage.setItem(`pen_group_id:${input.docId}`, groupId);

  const draft: PenDraftManifest = {
    draftId,
    docId: input.docId,
    authorPnHash: ownerPnHash,
    createdAt: now,
    updatedAt: now,
    status: 'unfinished',
    toc: input.template.sections.map((s) => s.slug)
  };

  const social = getClass(input.template.classId)?.parentId === 'social';
  const pageLayout =
    input.template.seedPageLayout || (social ? 'flow' : 'letter');
  const pagePresentation =
    input.template.seedPagePresentation ||
    (social ? defaultPagePresentation() : defaultEditorPagePresentation());

  const manifest: PenDocManifest = {
    docId: input.docId,
    title: input.title || `Untitled ${input.template.title}`,
    docType: input.template.docType,
    classId: input.template.classId,
    templateId: input.template.id,
    templateVersion: input.template.version,
    groupId,
    toc: input.template.sections.map((s) => s.slug),
    createdAt: now,
    updatedAt: now,
    genesisProof: genesis,
    pageLayout,
    pagePresentation,
    galleryAspect: input.template.seedGalleryAspect,
    pageSwipeAxis:
      input.template.seedPageSwipeAxis ||
      (input.template.publishContentClass === 'collection' ? 'x' : undefined),
    ownerPnHash,
    roles: ensureOwnerAssignment([], ownerPnHash),
    lifecycle: 'draft',
    activeDraftId: draftId,
    licensing: normalizeLicensingRoot(input.template.licensing, ownerPnHash)
  };

  const chain: PenHistoryChain = { docId: input.docId, genesis, links: [] };
  const bundle = { manifest, sections, chain };
  saveLocalDoc(input.session.pnIdentifier, bundle);
  sessionStorage.setItem(`pen_active_draft:${input.docId}`, draftId);
  sessionStorage.setItem(
    `pen_draft_meta:${input.docId}:${draftId}`,
    JSON.stringify(draft)
  );

  scheduleDocCloudBootstrap({
    session: input.session,
    bundle,
    draft
  });

  return bundle;
}

/** Mint a kit cloud table primitive (hidden from New…). */
export async function createTablePrimitiveDoc(input: {
  session: PenSession;
  title?: string;
}): Promise<LocalDocBundle> {
  const template = requireTemplate('table.basic.v1');
  const docId = randomDocId();
  const sections =
    template.seedSections?.length
      ? template.seedSections.map((s) => ({ ...s }))
      : [tableSectionFromPayload('grid', emptyPollTable())];
  return persistBundle({
    session: input.session,
    template,
    docId,
    sections,
    title: input.title || 'Untitled Table'
  });
}

export async function createDocFromTemplate(input: {
  session: PenSession;
  templateId: string;
  templates?: PenTemplate[];
}): Promise<LocalDocBundle> {
  const template =
    input.templates?.find((t) => t.id === input.templateId) ||
    requireTemplate(input.templateId);

  const docId = randomDocId();
  let sections = (template.seedSections?.length
    ? template.seedSections
    : template.sections.map((s) => emptySection(s.slug))
  ).map((s) => ({ ...s }));

  if (sectionNeedsSeedTable(sections)) {
    const table = await createTablePrimitiveDoc({
      session: input.session,
      title: `Table for ${template.title}`
    });
    sections = rewriteSeedTablePlaceholders(sections, table.manifest.docId);
  }

  return persistBundle({
    session: input.session,
    template,
    docId,
    sections
  });
}
