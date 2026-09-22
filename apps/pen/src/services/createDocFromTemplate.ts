/** Shared Pen doc create (New… sheet). */

import {
  emptySection,
  defaultPagePresentation,
  hashSectionContent,
  notaryHashForGenesis,
  attachNotary,
  requireTemplate,
  signGenesis,
  type PenDocManifest,
  type PenHistoryChain,
  type PenTemplate
} from '@par-noir/pen-protocol';
import { generateGroupId, generateChatKey } from '@par-noir/dm-crypto';
import type { PenSession } from '../App';
import { saveLocalDoc, type LocalDocBundle } from './penLocalStore';
import { requestNotaryStamp } from './penApi';
import { resolveSigningKeys } from './penKeys';

function randomDocId(): string {
  return `pen_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
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
  const now = new Date().toISOString();
  const sections = template.sections.map((s) => emptySection(s.slug));
  const commitment = hashSectionContent(
    new TextEncoder().encode(JSON.stringify(sections))
  );
  const keys = resolveSigningKeys(input.session);

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
    pagePresentation: defaultPagePresentation()
  };

  const chain: PenHistoryChain = { docId, genesis, links: [] };
  const bundle = { manifest, sections, chain };
  saveLocalDoc(input.session.pnIdentifier, bundle);
  return bundle;
}
