/** Shared Pen doc create (New… sheet) — cloud bootstrap + offline buffer. */

import {
  emptySection,
  defaultPagePresentation,
  defaultEditorPagePresentation,
  getClass,
  hashSectionContent,
  notaryHashForGenesis,
  attachNotary,
  requireTemplate,
  signGenesis,
  hashPnIdentifier,
  ensureOwnerAssignment,
  normalizeLicensingRoot,
  defaultLicensingRoot,
  type PenDocManifest,
  type PenDraftManifest,
  type PenHistoryChain,
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

export async function createDocFromTemplate(input: {
  session: PenSession;
  templateId: string;
  templates?: PenTemplate[];
}): Promise<LocalDocBundle> {
  const template =
    input.templates?.find((t) => t.id === input.templateId) ||
    requireTemplate(input.templateId);

  const docId = randomDocId();
  const draftId = randomDraftId();
  const now = new Date().toISOString();
  const sections = (template.seedSections?.length
    ? template.seedSections
    : template.sections.map((s) => emptySection(s.slug))
  ).map((s) => ({ ...s }));
  const commitment = hashSectionContent(
    new TextEncoder().encode(JSON.stringify(sections))
  );
  const keys = resolveSigningKeys(input.session);
  const ownerPnHash = hashPnIdentifier(input.session.pnIdentifier);

  let genesis = signGenesis({
    docId,
    templateId: template.id,
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
  mintDocKey(docId);
  sessionStorage.setItem(`pen_group_id:${docId}`, groupId);

  const draft: PenDraftManifest = {
    draftId,
    docId,
    authorPnHash: ownerPnHash,
    createdAt: now,
    updatedAt: now,
    status: 'unfinished',
    toc: template.sections.map((s) => s.slug)
  };

  const manifest: PenDocManifest = {
    docId,
    title: `Untitled ${template.title}`,
    docType: template.docType,
    classId: template.classId,
    templateId: template.id,
    templateVersion: template.version,
    groupId,
    toc: template.sections.map((s) => s.slug),
    createdAt: now,
    updatedAt: now,
    genesisProof: genesis,
    pageLayout: getClass(template.classId)?.parentId === 'social' ? 'flow' : 'letter',
    pagePresentation:
      getClass(template.classId)?.parentId === 'social'
        ? defaultPagePresentation()
        : defaultEditorPagePresentation(),
    ownerPnHash,
    roles: ensureOwnerAssignment([], ownerPnHash),
    lifecycle: 'draft',
    activeDraftId: draftId,
    licensing: normalizeLicensingRoot(template.licensing, ownerPnHash)
  };

  const chain: PenHistoryChain = { docId, genesis, links: [] };
  const bundle = { manifest, sections, chain };
  saveLocalDoc(input.session.pnIdentifier, bundle);
  sessionStorage.setItem(`pen_active_draft:${docId}`, draftId);
  sessionStorage.setItem(`pen_draft_meta:${docId}:${draftId}`, JSON.stringify(draft));

  scheduleDocCloudBootstrap({
    session: input.session,
    bundle,
    draft
  });

  return bundle;
}
