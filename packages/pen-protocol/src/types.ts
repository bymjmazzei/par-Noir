import type { PenDocType } from './templates.js';

/** TipTap / ProseMirror JSON node (section SoT). */
export interface PenTipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PenTipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PenTipTapNode[];
  marks?: PenTipTapMark[];
  text?: string;
}

/**
 * Legacy block shape — only for one-shot migrate on load.
 * Do not write new sections in this form.
 */
export interface PenFlowBlock {
  id: string;
  type: 'paragraph' | 'heading' | 'image' | 'quote' | 'list' | 'attachment';
  text?: string;
  level?: number;
  ref?: string;
  mimeType?: string;
  children?: PenFlowBlock[];
}

export interface PenSectionContent {
  slug: string;
  /** TipTap JSON document — sole rich-text SoT for flow / primary text. */
  doc: PenTipTapNode;
  /** Optional page layers (text boxes, images) for editable page preview. */
  layers?: PenPageLayer[];
}

export type PenPageLayerKind = 'text' | 'image' | 'video';

/** Layer on a section page — rects are % of page (0–100). */
export interface PenPageLayer {
  id: string;
  kind: PenPageLayerKind;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  /** text layers */
  textDoc?: PenTipTapNode;
  /** image layers */
  imageSrc?: string;
  /** video layers */
  videoSrc?: string;
  /** Fill / effects (text boxes and media frames). */
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  textShadow?: string;
  blur?: number;
}

/** Page chrome for Note compile / Pen Mini / PNG (mirrors browse TextPostStyle). */
export interface PenPagePresentation {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  textStyle?: 'plain' | 'bold' | 'italic' | 'strikethrough';
  dropShadowColor: string;
  dropShadowBlur: number;
  dropShadowOffsetX: number;
  dropShadowOffsetY: number;
  backgroundColor: string;
  backgroundImage?: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  padding: number;
}

export type PenPageLayout = 'flow' | 'letter' | 'a4';

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
  /** Editor / preview pagination mode. */
  pageLayout?: PenPageLayout;
  /** Default Note card chrome when compiling to browse. */
  pagePresentation?: PenPagePresentation;
  /** Aggregator fileId after publish — engagement comments key. */
  publishedFileId?: string;
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

/** In-doc review comment (Pen collab bus — not public engagement). */
export interface PenDocComment {
  id: string;
  docId: string;
  sectionSlug: string;
  /** TipTap node id when available */
  nodeId?: string;
  from?: number;
  to?: number;
  authorPnHash: string;
  body: string;
  createdAt: string;
  resolved?: boolean;
}

/** Outbox payload for pen.comment */
export interface PenCommentPayload {
  docId: string;
  groupId: string;
  comment: PenDocComment;
}

/** Proposed section replacement (track changes). */
export interface PenSuggestion {
  id: string;
  docId: string;
  sectionSlug: string;
  authorPnHash: string;
  createdAt: string;
  /** Full proposed TipTap doc for the section */
  proposedDoc: PenTipTapNode;
  /** Optional human summary */
  summary?: string;
  status: 'pending' | 'accepted' | 'rejected';
}

/** Outbox payload for pen.suggestion */
export interface PenSuggestionPayload {
  docId: string;
  groupId: string;
  suggestion: PenSuggestion;
  /** When accepting: include promote paths filled by client */
  acceptPromote?: PenSectionPromotePayload;
}
