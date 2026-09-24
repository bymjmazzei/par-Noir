import type { PenDocType } from './templates.js';
import type { PenRoleAssignment } from './roles.js';
import type { PenLicensingRoot } from './licensing.js';

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
  /**
   * Layer rect unit. `px` = content-box CSS pixels (canonical).
   * Missing + legacy %-looking rects are migrated once on load.
   */
  layerGeom?: 'px';
}

export type PenPageLayerKind = 'text' | 'image' | 'video' | 'group';

export type PenStrokeStyle = 'solid' | 'dashed' | 'dotted';
export type PenStrokeAlign = 'inside' | 'outside' | 'center';

/** Layer on a section page — rects are CSS px in the Body content box. */
export interface PenPageLayer {
  id: string;
  kind: PenPageLayerKind;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  /** Optional display name; UI defaults to "Layer N" / "Group N" when unset. */
  name?: string;
  /** When set, this layer lives inside a group folder. */
  parentGroupId?: string | null;
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
  /** CSS gradient string (e.g. linear-gradient(...)). */
  backgroundGradient?: string;
  /** Legacy single-string shadow; prefer shadow* fields. */
  textShadow?: string;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  blur?: number;
  /** Stroke */
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: PenStrokeStyle;
  strokeAlign?: PenStrokeAlign;
  /** 0–100; default 100. */
  opacity?: number;
  /** CSS mix-blend-mode. */
  mixBlendMode?: string;
  /** Blend strength 0–100 (applied with mixBlendMode). */
  blendAmount?: number;
  /** When false, omitted from preview/compile; still listed in Layers. Default true. */
  visible?: boolean;
  /** When true, cannot move/resize on the page surface. */
  positionLocked?: boolean;
  /**
   * When set, object participates in Body flow wrap (float left or right).
   * Side follows horizontal position; off keeps an absolute overlay.
   */
  bodyWrap?: 'left' | 'right';
  /** CSS color grade for image/video layers (percent / degrees). */
  mediaFilter?: PenMediaFilter;
  /** Normalized crop of the source (0–1). */
  mediaCrop?: PenMediaCrop;
  /** Clip mask for image/video layers. */
  mediaMask?: PenMediaMask;
  /** Raster brush overlay (data URL) composited above the media. */
  paintOverlaySrc?: string;
}

/** Image/video color grade — maps to CSS filter. Defaults: 100/100/100/0. */
export interface PenMediaFilter {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hueRotate?: number;
}

/** Crop rectangle as fractions of the source media (0–1). */
export interface PenMediaCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PenMediaMask = 'none' | 'circle' | 'rounded';

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
  backgroundGradient?: string;
  backgroundVideo?: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  padding: number;
}

export type PenPageLayout = 'flow' | 'letter' | 'a4';

export type PenDocLifecycle = 'draft' | 'published';

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
  /**
   * Flow workspace width in CSS px. `null` = open (fill available panel).
   * Omit or null for an unconstrained Flow surface; set a number to lock width.
   */
  flowWorkspaceWidthPx?: number | null;
  /**
   * Flow workspace min height in CSS px. `null`/omit = grow with content
   * (and fill the panel when width is also open).
   */
  flowWorkspaceHeightPx?: number | null;
  /** Default Note card chrome when compiling to browse. */
  pagePresentation?: PenPagePresentation;
  /** Aggregator fileId after Connect to feed — engagement comments key. */
  publishedFileId?: string;
  /**
   * Composed gallery thumb after Commit — `penmedia:{fileId}` (or transient `penlocal:`).
   * Not an aggregator CDN URL; collaborators hydrate via Drive → IndexedDB.
   */
  galleryPreviewRef?: string;
  /** Whether galleryPreviewRef is a still or composed video. */
  galleryPreviewKind?: 'image' | 'video';
  /** JPEG poster when galleryPreviewKind is video. */
  galleryPreviewPosterRef?: string;
  /** Head hash / commit id the gallery preview was built from. */
  galleryPreviewCommitHash?: string;
  /** When true, overlay objects snap to page center/middle while dragging. */
  snapToPageGuides?: boolean;
  /** Owner pn hash — unrevokable. */
  ownerPnHash?: string;
  /** Access control list (includes owner). */
  roles?: PenRoleAssignment[];
  /** Whether current/ has been published at least once. */
  lifecycle?: PenDocLifecycle;
  /** Optional My Library notebook id (Pen UI view metadata). */
  folderId?: string | null;
  /** Active working draft id under drafts/. */
  activeDraftId?: string;
  /** Parent template when remixing / using a personal or public template. */
  basedOnTemplateId?: string;
  /** Parent public IndexedFile when remixing from a feed template. */
  basedOnFileId?: string;
  /** Work license + open creator contracts (normalized on create/load). */
  licensing?: PenLicensingRoot;
  /**
   * Custom fonts actively used in this doc.
   * Bytes live under par-noir-pen/{docId}/fonts/{fontId}.penfont (docKey envelopes).
   */
  usedCustomFonts?: Array<{ fontId: string; family: string }>;
}

/** Draft under drafts/{draftId}/ — unfinished suggestion until submitted. */
export type PenDraftStatus = 'unfinished' | 'submitted' | 'accepted' | 'rejected';

export interface PenDraftManifest {
  draftId: string;
  docId: string;
  authorPnHash: string;
  createdAt: string;
  updatedAt: string;
  status: PenDraftStatus;
  /** Ordered section slugs in this draft */
  toc: string[];
  summary?: string;
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

/** Outbox payload for pen.section_promote (legacy accept path) */
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

/** Upsert a working draft under drafts/{draftId}/ */
export interface PenDraftUpsertPayload {
  docId: string;
  groupId?: string;
  draft: PenDraftManifest;
  /** Map of sectionSlug → base64 body */
  sectionCiphertextsB64: Record<string, string>;
}

/** Publish: move current → past/{versionId}, write new current from accepted content */
export interface PenPublishPayload {
  docId: string;
  groupId?: string;
  versionId: string;
  /** Map of sectionSlug → base64 body for new current */
  sectionCiphertextsB64: Record<string, string>;
  toc: string[];
  link?: PenPromoteLink;
  contentHash?: string;
  /** Optional draft that was accepted into this publish */
  sourceDraftId?: string;
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

/**
 * Outbox payload for pen.font_upsert.
 * Cipher bytes are already docKey envelopes — never plain TTF/OTF on the wire or Drive.
 */
export interface PenFontUpsertPayload {
  docId: string;
  groupId?: string;
  fontId: string;
  family: string;
  /** Base64 of opaque .penfont envelope (AES-GCM under docKey). */
  fontCiphertextB64: string;
}
