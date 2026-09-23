/**
 * Pen Mini Note authenticity — signed genesis for browse-authored Notes.
 * Does not bootstrap a full Pen cloud replica; attaches headProof to feed Note metadata.
 */

import {
  hashSectionContent,
  requireTemplate,
  signGenesis,
  verifyGenesis,
  type PenGenesisProof,
  type PenSectionContent,
} from '@par-noir/pen-protocol';
import { resolveBrowseSigningKeys } from './dmIdentitySession';

export function mintPenDocId(): string {
  return `pen_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/** TipTap body section used by Pen Mini compile + genesis commitment. */
export function buildMiniBodySections(bodyText: string): PenSectionContent[] {
  return [
    {
      slug: 'body',
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: bodyText ? [{ type: 'text', text: bodyText }] : [],
          },
        ],
      },
    },
  ];
}

export type PenMiniGenesisResult = {
  docId: string;
  genesis: PenGenesisProof;
  headProof: PenGenesisProof;
  templateId: string;
  penClassId: string;
  penIrRef: { objectId: string };
};

/**
 * Sign a one-shot Note genesis with durable browse ML-DSA keys.
 * No ephemeral fallback — resolveBrowseSigningKeys throws if unlock lacked DSA.
 */
export function signPenMiniNoteGenesis(input: {
  authorPn: string;
  templateId: string;
  sections: PenSectionContent[];
}): PenMiniGenesisResult {
  if (!input.authorPn) {
    throw new Error('author_pn_required');
  }
  const templateId = input.templateId.includes('.') ? input.templateId : 'note.basic.v1';
  const template = requireTemplate(templateId);
  const keys = resolveBrowseSigningKeys();
  const docId = mintPenDocId();
  const clientCreatedAt = new Date().toISOString();
  const contentCommitment = hashSectionContent(
    new TextEncoder().encode(JSON.stringify(input.sections))
  );
  const genesis = signGenesis({
    docId,
    templateId: template.id,
    authorPn: input.authorPn,
    clientCreatedAt,
    contentCommitment,
    secretKey: keys.secretKey,
    publicKey: keys.publicKey,
  });
  return {
    docId,
    genesis,
    headProof: genesis,
    templateId: template.id,
    penClassId: template.classId,
    penIrRef: { objectId: docId },
  };
}

export function verifyPenMiniGenesis(proof: PenGenesisProof): boolean {
  return verifyGenesis(proof);
}
