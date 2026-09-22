import type { PenDocType } from './templates.js';

export interface PenFlowBlock {
  id: string;
  type: 'paragraph' | 'heading' | 'image' | 'quote' | 'list' | 'attachment';
  text?: string;
  level?: number;
  /** Attachment / image ref (opaque id or URL placeholder) */
  ref?: string;
  mimeType?: string;
  children?: PenFlowBlock[];
}

export interface PenSectionContent {
  slug: string;
  blocks: PenFlowBlock[];
}

export interface PenDocManifest {
  docId: string;
  title: string;
  docType: PenDocType;
  /** Form class id (e.g. social.note). */
  classId: string;
  templateId: string;
  templateVersion: string;
  groupId?: string;
  /** Ordered section slugs */
  toc: string[];
  createdAt: string;
  updatedAt: string;
  genesisProof?: PenGenesisProof;
}

export interface PenNotaryToken {
  hash: string;
  notaryTime: string;
  notarySig: string;
}

export interface PenGenesisProof {
  docId: string;
  templateId: string;
  authorPnHash: string;
  clientCreatedAt: string;
  contentCommitment: string;
  signature: string;
  publicKey: string;
  notary?: PenNotaryToken;
}

export interface PenPromoteLink {
  sectionSlug: string;
  pastName: string;
  contentHash: string;
  prevHeadHash: string;
  authorPnHash: string;
  clientPromotedAt: string;
  signature: string;
  publicKey: string;
  notary?: PenNotaryToken;
}

export interface PenHistoryChain {
  docId: string;
  genesis: PenGenesisProof;
  links: PenPromoteLink[];
}

/** Outbox payload for pen.section_promote */
export interface PenSectionPromotePayload {
  docId: string;
  groupId: string;
  sectionSlug: string;
  pastName: string;
  /** Relative path under par-noir-pen for new current file */
  currentRelPath: string;
  pastRelPath: string;
  /** Base64 ciphertext of new section body (or plaintext JSON in early v1 tests) */
  sectionCiphertextB64: string;
  contentHash: string;
  link: PenPromoteLink;
  /** Optional updated toc */
  toc?: string[];
}
