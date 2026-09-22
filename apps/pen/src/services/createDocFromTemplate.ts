/** Shared Pen doc create (New… sheet) — cloud bootstrap + offline buffer. */

import {
  emptySection,
  defaultPagePresentation,
  hashSectionContent,
  notaryHashForGenesis,
  attachNotary,
  requireTemplate,
  signGenesis,
  hashPnIdentifier,
  ensureOwnerAssignment,
  type PenDocManifest,
  type PenDraftManifest,
  type PenHistoryChain,
  type PenTemplate
} from '@par-noir/pen-protocol';
import { generateGroupId, generateChatKey } from '@par-noir/dm-crypto';
import type { PenSession } from './penSession';
import { saveLocalDoc, type LocalDocBundle } from './penLocalStore';
import { requestNotaryStamp } from './penApi';
import { resolveSigningKeys } from './penKeys';
import { bootstrapDocCloud } from './penCloudStore';
import { enqueueSyncJob } from './penSyncQueue';

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
  const sections = template.sections.map((s) => emptySection(s.slug));
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
  sessionStorage.setItem(`pen_doc_key:${docId}`, generateChatKey());
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
    pageLayout: 'flow',
    pagePresentation: defaultPagePresentation(),
    ownerPnHash,
    roles: ensureOwnerAssignment([], ownerPnHash),
    lifecycle: 'draft',
    activeDraftId: draftId
  };

  const chain: PenHistoryChain = { docId, genesis, links: [] };
  const bundle = { manifest, sections, chain };
  saveLocalDoc(input.session.pnIdentifier, bundle);
  sessionStorage.setItem(`pen_active_draft:${docId}`, draftId);
  sessionStorage.setItem(`pen_draft_meta:${docId}:${draftId}`, JSON.stringify(draft));

  try {
    await bootstrapDocCloud({
      userPnIdentifier: input.session.pnIdentifier,
      bundle,
      draft
    });
  } catch (e) {
    enqueueSyncJob(input.session.pnIdentifier, {
      kind: 'bootstrap',
      docId,
      payload: { bundle, draft }
    });
    if (e instanceof Error && e.message === 'cloud_token_required') {
      // Offline / no custody — buffer only; user can keep editing
      return bundle;
    }
    // Other errors: still return local buffer, queued for flush
  }

  return bundle;
}
