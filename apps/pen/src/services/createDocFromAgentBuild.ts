/**
 * Thin adapter: validated PenAgentBuild → existing create/bootstrap spine.
 * No second custody writer — same local buffer + apply-inbound bootstrap as New….
 */

import {
  defaultPagePresentation,
  hashSectionContent,
  notaryHashForGenesis,
  attachNotary,
  signGenesis,
  hashPnIdentifier,
  ensureOwnerAssignment,
  validatePenAgentBuild,
  materializePenAgentBuild,
  defaultLicensingRoot,
  type PenAgentBuild,
  type PenDocManifest,
  type PenDraftManifest,
  type PenHistoryChain
} from '@par-noir/pen-protocol';
import { generateGroupId, generateChatKey } from '@par-noir/dm-crypto';
import type { PenSession } from './penSession';
import { saveLocalDoc, type LocalDocBundle } from './penLocalStore';
import { requestNotaryStamp } from './penApi';
import { resolveSigningKeys } from './penKeys';
import { scheduleDocCloudBootstrap } from './penSyncFlush';

/**
 * Create a Pen doc from an external-agent PenAgentBuild (Cursor/Astra/…).
 * Validates → materializes sections → genesis + local save + cloud bootstrap.
 */
export async function createDocFromAgentBuild(input: {
  session: PenSession;
  build: PenAgentBuild;
}): Promise<LocalDocBundle> {
  const validated = validatePenAgentBuild(input.build);
  if (!validated.ok || !validated.template) {
    const msg = validated.errors.map((e) => e.message).join('; ') || 'invalid_build';
    throw new Error(`pen_agent_build_invalid:${msg}`);
  }

  const materialized = materializePenAgentBuild(input.build);
  const { docId, draftId, sections } = materialized;
  const template = validated.template;
  const now = new Date().toISOString();
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
    title: input.build.title.trim(),
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
    activeDraftId: draftId,
    licensing: defaultLicensingRoot(ownerPnHash)
  };

  const chain: PenHistoryChain = { docId, genesis, links: [] };
  const bundle: LocalDocBundle = { manifest, sections, chain };
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
