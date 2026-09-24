/** Blank Pen doc create — form (or custom) without a starter template body. */

import {
  emptySection,
  defaultPagePresentation,
  defaultEditorPagePresentation,
  getClass,
  blankTemplateForClass,
  hashSectionContent,
  notaryHashForGenesis,
  attachNotary,
  signGenesis,
  hashPnIdentifier,
  ensureOwnerAssignment,
  defaultLicensingRoot,
  type PenDocManifest,
  type PenDraftManifest,
  type PenHistoryChain,
  type PenPageLayout
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

export type BlankDocChoice =
  | { kind: 'form'; classId: string }
  | { kind: 'custom' };

function resolveBlankShape(choice: BlankDocChoice): {
  classId: string;
  docType: string;
  templateId: string;
  title: string;
  toc: string[];
  pageLayout: PenPageLayout;
} {
  if (choice.kind === 'custom') {
    return {
      classId: 'custom.doc',
      docType: 'custom',
      templateId: 'blank.custom',
      title: 'Untitled',
      toc: ['body'],
      pageLayout: 'flow'
    };
  }
  const form = getClass(choice.classId);
  if (!form?.parentId) {
    throw new Error('Pick a form (not a category)');
  }
  const blank = blankTemplateForClass(form.id);
  const leaf = form.id.includes('.') ? form.id.slice(form.id.lastIndexOf('.') + 1) : form.id;
  return {
    classId: form.id,
    docType: leaf,
    templateId: blank?.id || `blank.${form.id}`,
    title: `Untitled ${form.title}`,
    toc: blank?.seedSections?.map((s) => s.slug) || ['body'],
    pageLayout: form.parentId === 'social' ? 'flow' : 'letter'
  };
}

export async function createBlankDoc(input: {
  session: PenSession;
  choice: BlankDocChoice;
  pageLayout?: PenPageLayout;
}): Promise<LocalDocBundle> {
  const shape = resolveBlankShape(input.choice);
  const pageLayout = input.pageLayout || shape.pageLayout;
  const docId = randomDocId();
  const draftId = randomDraftId();
  const now = new Date().toISOString();
  const sections = shape.toc.map((slug) => emptySection(slug));
  const commitment = hashSectionContent(
    new TextEncoder().encode(JSON.stringify(sections))
  );
  const keys = resolveSigningKeys(input.session);
  const ownerPnHash = hashPnIdentifier(input.session.pnIdentifier);

  let genesis = signGenesis({
    docId,
    templateId: shape.templateId,
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
    toc: shape.toc
  };

  const manifest: PenDocManifest = {
    docId,
    title: shape.title,
    docType: shape.docType,
    classId: shape.classId,
    templateId: shape.templateId,
    templateVersion: '1',
    groupId,
    toc: shape.toc,
    createdAt: now,
    updatedAt: now,
    genesisProof: genesis,
    pageLayout,
    pagePresentation:
      getClass(shape.classId)?.parentId === 'social'
        ? defaultPagePresentation()
        : defaultEditorPagePresentation(),
    ownerPnHash,
    roles: ensureOwnerAssignment([], ownerPnHash),
    lifecycle: 'draft',
    activeDraftId: draftId,
    licensing: defaultLicensingRoot(ownerPnHash, {
      membership: false,
      musicAsset: shape.classId === 'library.music'
    })
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
