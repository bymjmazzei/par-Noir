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

/** Top-level blocks of a layer-0 story assigned to one paper frame. */
export interface PenStoryRange {
  /** Inclusive index into the story doc's top-level blocks. */
  startBlock: number;
  /** Exclusive index. */
  endBlock: number;
}

export interface PenSectionContent {
  slug: string;
  /** TipTap JSON document — sole rich-text SoT for flow / primary text. */
  doc: PenTipTapNode;
  /**
   * Layer-0 story shared by paper frames. The story doc lives on the first
   * frame. Later frames keep layers and an empty doc.
   */
  storyId?: string;
  /** Blocks of the story doc this frame shows. Absent until the editor measures. */
  storyRange?: PenStoryRange;
  /** Optional page layers (text boxes, images) for editable page preview. */
  layers?: PenPageLayer[];
  /**
   * Layer rect unit. `px` = content-box CSS pixels (canonical).
   * Missing + legacy %-looking rects are migrated once on load.
   */
  layerGeom?: 'px';
  /**
   * Section playhead length in seconds.
   * Omit to derive it from the longest video, the last key, or 5s.
   */
  timelineDurationSec?: number;
}

export type PenPageLayerKind = 'text' | 'image' | 'video' | 'group' | 'embed' | 'interactive' | 'guide';

/**
 * Preset button trigger. The backend runs the named write.
 * Pass/fail is poll.vote plus `correct` on the option, not its own trigger.
 */
export type PenInteractiveBehavior =
  | 'poll.vote'
  | 'cta.open'
  | 'widget.submit'
  | 'widget.toggle'
  | 'widget.stamp'
  | 'widget.rank'
  | 'widget.allocate'
  | 'widget.reveal';

/** Optional role of a layer the user placed. It does not wrap the group. */
export type PenWidgetElement = 'svg' | 'text' | 'button' | 'time' | 'html' | 'input';

export type PenStrokeStyle = 'solid' | 'dashed' | 'dotted';
export type PenStrokeAlign = 'inside' | 'outside' | 'center';

export type PenTransitionPreset = 'cut' | 'crossfade' | 'slide' | 'push' | 'dip' | 'zoom' | 'unfold';

/** One blend where this clip meets the previous clip on its track. */
export interface PenClipTransition {
  preset: PenTransitionPreset;
  durationSec: number;
}

/** Layer on a section page — rects are CSS px in the Body content box. */
export interface PenPageLayer {
  id: string;
  kind: PenPageLayerKind;
  /** Guide layers are editor lines. They are not drawn in a published page. */
  guideAxis?: 'vertical' | 'horizontal';
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  /** Frame rotation on the page, degrees. Unlike mediaRotate, the frame turns. */
  rotate?: number;
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
  /**
   * Smaller file the editor decodes. The original stays on videoSrc / backgroundVideo.
   * Until the proxy exists, the editor plays the original.
   */
  editProxySrc?: string;
  /**
   * embed layers — frame hosting a cloud primitive / Pen doc by ref.
   * Live by-ref in editor; publish may snapshot display (tallies live later).
   */
  refDocId?: string;
  refSectionSlug?: string;
  /** interactive sticker layers */
  behavior?: PenInteractiveBehavior;
  /** Bound cloud primitive / table doc id. */
  bindDocId?: string;
  /** Optional row id within a table primitive (e.g. poll option). */
  bindRowId?: string;
  /** Button / sticker label. */
  label?: string;
  /** Vote option marked correct. Pass/fail is vote plus this flag. */
  correct?: boolean;
  /** Open trigger destination. */
  openUrl?: string;
  /** Submit trigger destination: an email address or a pn. */
  submitTo?: string;
  /** Layer id shown by a Reveal button. */
  revealLayerId?: string;
  /** Fixed amount shared by Allocate buttons in the group. Default 100. */
  allocateTotal?: number;
  /** Corner radius in CSS px. A button drag from the top-left sets this. */
  cornerRadius?: number;
  /** Label color. Fill stays backgroundColor. */
  textColor?: string;
  /** Widget template this group was copied from (e.g. widget.v1). */
  widgetTemplateId?: string;
  /** Role of a placed layer. SVG is one layer, not the box around the group. */
  widgetElement?: PenWidgetElement;
  /** SVG markup for an SVG layer. */
  svgSrc?: string;
  /** HTML snippet source. Rendered in a sandboxed frame. */
  htmlSource?: string;
  /** Time element expiry. */
  closesAt?: string | null;
  /** Clock, countdown, or an empty time face. */
  timeFace?: 'clock' | 'countdown' | 'blank';
  /** Clock face, stored as a time string such as 14:30. */
  clockTime?: string;
  /** Last tally written onto the widget group after a vote. */
  widgetCounts?: { total: number; byOption: Record<string, number> };
  /** Owner spreadsheet for this poll group. Not copied onto a reusable template. */
  spreadsheetId?: string;
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
  /** Mask size. Default 100. */
  mediaMaskSize?: number;
  /** Split seam angle in degrees. */
  mediaMaskAngle?: number;
  /** Split seam softness, 0–100. */
  mediaMaskFeather?: number;
  /** Word used by the text mask. */
  mediaMaskText?: string;
  /** Picture scale inside the frame. 100 is the frame. */
  mediaScale?: number;
  /** Picture offset inside the frame, percent. */
  mediaX?: number;
  mediaY?: number;
  /** Picture rotation in degrees. The frame uses `rotate` instead. */
  mediaRotate?: number;
  /** Flip the picture horizontally. */
  mediaMirror?: boolean;
  /** Playback speed. 1 is normal. Not a keyframe. */
  playbackRate?: number;
  /** Clip soundtrack level 0–100. The master stays muted until this is set. */
  mediaGain?: number;
  /** When false, the clip soundtrack is audible. Omit to keep the master muted. */
  mediaMuted?: boolean;
  /** Play the reversed proxy instead of the forward edit proxy. */
  mediaReversed?: boolean;
  /** Short-clip reverse file. Absent when the clip is longer than the reverse cap. */
  reverseProxySrc?: string;
  /** Raster brush overlay (data URL) composited above the media. */
  paintOverlaySrc?: string;
  /**
   * Extra audio lanes on this media layer. Own files publish beside the post.
   * A licensed lane references a public audio doc and is not re-uploaded.
   */
  audioTracks?: PenAudioTrack[];
  /**
   * Where this layer sits on the section clock. The file is not rewritten.
   * Seconds. Omit inSec to start at 0; omit outSec to run to the timeline end.
   */
  inSec?: number;
  outSec?: number;
  /** File time that plays when the clock reaches inSec. Omit to start at the head of the file. */
  sourceInSec?: number;
  /** Length of the video file. The clip uses this instead of the section clock. */
  sourceDurationSec?: number;
  /** Pieces on this track after a cut. Absent means one piece from inSec to outSec. */
  clips?: PenTimelineClip[];
  /** Layers that share this id sit on one timeline row and play in order. */
  timelineTrackId?: string;
  /** Blend into this clip from the previous one on the same track. Not a keyframe. */
  transitionIn?: PenClipTransition;
  /** Widget intro length. Child key times are local to this clock. */
  durationSec?: number;
  /** Sparse keyframes. Absent means the layer stays at its rest pose. */
  motion?: PenLayerMotion;
}

export type PenKeyframeEase =
  | 'hold'
  | 'linear'
  | 'easeIn'
  | 'quadIn'
  | 'cubicIn'
  | 'easeOut'
  | 'quadOut'
  | 'cubicOut'
  | 'easeInOut';

/** One sample. Only the fields set on a key are animated. */
export interface PenLayerKeyframe {
  t: number;
  ease?: PenKeyframeEase;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Frame rotation on the page, degrees. */
  rotate?: number;
  opacity?: number;
  blur?: number;
  mediaScale?: number;
  mediaX?: number;
  mediaY?: number;
  mediaRotate?: number;
  mediaMaskSize?: number;
  mediaFilter?: PenMediaFilter;
  mediaCrop?: PenMediaCrop;
}

export type PenMotionPreset = 'in' | 'out' | 'both' | 'rise' | 'pop';

export type PenAnimationStyle =
  | 'fade'
  | 'rise'
  | 'drop'
  | 'slideLeft'
  | 'slideRight'
  | 'zoom'
  | 'pop'
  | 'unfold';

export type PenAnimationSlot = 'in' | 'out' | 'both';

/** Styles on the intro, the outro, or a combo that owns both. */
export interface PenLayerAnimation {
  in?: PenAnimationStyle;
  out?: PenAnimationStyle;
  both?: PenAnimationStyle;
  /** Seconds for In, for Out, and for each half of Both. Absent is the 0.4s default. */
  durationSec?: number;
}

export interface PenLayerMotion {
  keys: PenLayerKeyframe[];
  /** Repeat the intro while the page is open. Absent plays once and holds the end pose. */
  loop?: boolean;
  /**
   * Sampled at playback. Not drawn as timeline keys.
   * A string is an older fade, rise, or pop choice.
   */
  animation?: PenMotionPreset | PenLayerAnimation;
}

/** One timeline lane. Own bytes (`src`) or a licensed public doc (`licensedDocId`). */
export interface PenAudioTrack {
  id: string;
  src?: string;
  licensedDocId?: string;
  /** Seconds from the start of the shared playhead. */
  offsetSec?: number;
  /** 0–100. Default 100. */
  gain?: number;
  /** Silence this lane without removing it. */
  muted?: boolean;
}

/** Image/video color grade. Tonal channels render in one shader pass. */
export interface PenMediaFilter {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  /** Kept for look presets. The panel uses temp and tint. */
  hueRotate?: number;
  /** -100 cool to 100 warm. */
  temp?: number;
  /** -100 green to 100 magenta. */
  tint?: number;
  /** -100 to 100. */
  exposure?: number;
  highlight?: number;
  shadow?: number;
  whites?: number;
  blacks?: number;
  brilliance?: number;
  sharpen?: number;
  clarity?: number;
  /** Grain overlay strength 0–100. */
  particles?: number;
  fade?: number;
  vignette?: number;
}

/** Crop rectangle as fractions of the source media (0–1). */
export interface PenMediaCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PenMediaMask = 'none' | 'circle' | 'rounded' | 'rect' | 'split' | 'filmstrip' | 'text';

/** One piece of a layer on its track. A cut adds a piece; it does not add a track. */
export interface PenTimelineClip {
  id: string;
  inSec: number;
  outSec: number;
  /** File time that plays when the clock reaches inSec. */
  sourceInSec?: number;
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
  backgroundGradient?: string;
  backgroundVideo?: string;
  /** Editor decode of backgroundVideo. Absent until that proxy exists. */
  editProxySrc?: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  padding: number;
}

export type PenPageLayout = 'flow' | 'letter' | 'a4';

/** Named page size. `custom` keeps typed dimensions even when they match a preset. */
export type PenPageSizeId =
  | 'flow'
  | 'letter'
  | 'legal'
  | 'a4'
  | 'ratio-9-16'
  | 'ratio-1-1'
  | 'ratio-4-5'
  | 'ratio-3-2'
  | 'ratio-4-3'
  | 'custom';

/** How the live preview arranges document pages. */
export type PenPageView = 'vertical' | 'horizontal' | 'screen';

/** Page shape. Independent of how the preview scrolls. */
export type PenPageOrientation = 'portrait' | 'landscape';

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
  /** Which page-size menu row is active. Omitted sizes are inferred from layout and dimensions. */
  pageSize?: PenPageSizeId;
  /** Default Note card chrome when compiling to browse. */
  pagePresentation?: PenPagePresentation;
  /** Gallery / thumb aspect for Social orientations. */
  galleryAspect?: '9/16' | '16/9' | '1/1';
  /**
   * Live preview page arrangement.
   * Vertical stacks pages (letter and A4). Horizontal is separate pages
   * (social and other flow docs). Screen is one continuous strip.
   */
  pageView?: PenPageView;
  /** Portrait or landscape. Omitted values follow the older page view. */
  pageOrientation?: PenPageOrientation;
  /** When true, the preview stays on pageView until the author unlocks it. */
  pageViewLocked?: boolean;
  /**
   * Multipage workspace swipe axis in editor / live preview.
   * `x` = horizontal between pages (collections default);
   * `y` = vertical within a longform unit (chapter).
   */
  pageSwipeAxis?: 'x' | 'y';
  /**
   * Published music/audio asset used as SoT for social.audio (and companion visuals).
   * Remixes reuse this id instead of re-uploading audio bytes.
   */
  audioSotDocId?: string | null;
  /**
   * Knowledge claims + geo/place proofs on this asset (never raw PII / coords).
   * Place is an attestation extension — not a Place template.
   */
  attestations?: import('./knowledge.js').AssetAttestation;
  /** Structured Knowledge body when classId is knowledge.claim. */
  knowledge?: import('./knowledge.js').KnowledgePayload;
  /**
   * Owner spreadsheet for a poll widget doc (sheet 1 votes, sheet 2 structure).
   * Omitted from a reusable template publish so Use mints a new sheet.
   */
  pollSpreadsheetId?: string;
  /** Aggregator fileId after the post is published — engagement comments key. */
  publishedFileId?: string;
  /** Second public row: reusable template, after the post exists. */
  templatePublishedFileId?: string;
  /** Reuse license captured when the template was published. Separate from `licensing`. */
  templateLicensing?: PenLicensingRoot;
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
