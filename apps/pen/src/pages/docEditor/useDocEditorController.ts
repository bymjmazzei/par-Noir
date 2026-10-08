import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import {
  defaultEditorPagePresentation,
  defaultLicensingRoot,
  defaultPagePresentation,
  ensureDefaultTextLayer,
  collapseLegacyPrimaryTextLayer,
  defaultLayerName,
  getClass,
  getTemplate,
  getTextLayerDoc,
  hashPnIdentifier,
  hashSectionContent,
  headHashFromChain,
  isPageLayerId,
  layerOpensWidgetEditor,
  mergePagePresentation,
  normalizeSection,
  notaryHashForPromote,
  PAGE_LAYER_ID,
  promoteSectionToPast,
  publishCurrentToPast,
  publishPlaybackSrc,
  setTextLayerDoc,
  signPromoteLink,
  attachNotary,
  adjacentPageSlug,
  appendDocPage,
  appendChapter,
  appendStoryFrame,
  applyStoryRanges,
  assignBlocksToFrames,
  ensureLayer0Stories,
  frameSlugForBlock,
  layer0DocForSection,
  layer0Flows,
  listLayer0Stories,
  paperContentHeightPx,
  rangesForFrameCount,
  removeStoryFrame,
  storyForSlug,
  matchPageSize,
  orientPageSize,
  pageSwipeAxisForView,
  removeDocPage,
  reorderDocPages,
  fittedPreviewPagePx,
  isFlowWorkspaceOpen,
  PREVIEW_PAGE_GUTTER_PX,
  pasteboardExtents,
  pageAllowsPasteboard,
  previewPageUsesGutter,
  resolvePagePaddingPx,
  orientationFromPageSize,
  resolvePageView,
  screenStripWidthPx,
  verifyChain,
  ensureOwnerAssignment,
  collectFontFamiliesFromDoc,
  templateAuthorLabel,
  shouldPublishAsSingleComposedVideo,
  shouldPublishAsMixedPages,
  shouldPublishSocialAsCollection,
  downloadKindForSections,
  partitionSectionsForPublish,
  resolveTimelineDuration,
  sectionHasMotion,
  sectionIsFeedPage,
  isGooglePenFont,
  remapSectionsForAspect,
  normalizeGalleryAspect,
  allocateColumnKeys,
  allocateTotal,
  buildWidgetActionRow,
  cellsForAmounts,
  cellsForInputs,
  cellsForRanks,
  formCollectsToSheet,
  inputColumnKeys,
  isSheetTrigger,
  buildActionStageHtml,
  type PenActionMessage,
  nextAllocatePress,
  nextRankPress,
  rankColumnKeys,
  revealSibling,
  sectionHasVoteButton,
  structureFromLayers,
  submitFields,
  syncPollLayers,
  type PenDocComment,
  type PenPageLayout,
  type PenDocManifest,
  type PenRole,
  type PenSuggestion,
  type PenTipTapNode,
  type PenLicensingRoot,
  type PenPageLayer
} from '@par-noir/pen-protocol';
import type { PenSession } from '../../services/penSession';
import { FormatRibbon, PageCanvas } from '../../components/PageCanvas';
import { EditablePagePreview } from '../../components/EditablePagePreview';
import { ScreenLayerStage } from '../../components/ScreenLayerStage';
import { PageGuides } from '../../components/PageGuides';
import {
  PreviewPageBar,
  PreviewPageStrip,
  PreviewZoomControl,
  previewFitScale,
  engagementGuideOnPage,
  previewStripLayout,
  previewWorkspaceLayout,
  workspaceGuideAlong,
  workspaceGuideFrame,
  workspaceGuideSpan
} from '../../components/PreviewPageBar';
import { clampEditorPanePx } from '../../components/editorSplit';
import { pageFrameStyle } from '../../components/LayerObjectToolbar';
import { SocialFeedPhonePreview } from '../../components/SocialFeedPhonePreview';
import { LayersPopover } from '../../components/LayersPanel';
import { ActionLayerPhoneOverlay } from '../../components/ActionLayerPhoneOverlay';
import { ActionBindStrip } from '../../components/ActionBindStrip';
import { IconLayers } from '../../components/icons/PenIcons';
import { MediaEditorPanel } from '../../components/MediaEditorPanel';
import { SectionTimeline } from '../../components/SectionTimeline';
import { bindTimelineSample, emitTimelineSample } from '../../services/timelineSample';
import { findComposeExportRoot } from '../../services/penGalleryPreview';
import { composePageToVideo } from '../../services/composePageVideoEncode';
import { setPlaybackMode } from '../../services/playbackMode';
import { rasterizeElementToPosterBlob } from '../../services/rasterizePagePoster';
import {
  actionLayerIds,
  downloadBasename,
  hideActionLayers,
  pngBlobsToPdf,
  saveDownload
} from '../../services/penDownload';
import { ensureEditProxy, layerOriginalForProxy } from '../../services/editProxy';
import { WidgetEditorPanel } from '../../components/WidgetEditorPanel';
import { LayerPartsMenu } from '../../components/LayerPartsMenu';
import { PublishMenu } from '../../components/PublishMenu';
import { SaveMenu } from '../../components/SaveMenu';
import { ShareMenu } from '../../components/ShareMenu';
import {
  IconComments,
  IconHistory,
  IconPreview,
  IconRedo,
  IconUndo
} from '../../components/icons/PenIcons';
import { useVerifiedAuthor } from '../../hooks/useVerifiedAuthor';
import { starTemplateToCloud } from '../../services/penCloudTemplates';
import {
  loadLocalDoc,
  saveLocalDoc,
  saveLocalDocAsync
} from '../../services/penLocalStore';
import { PenLocalStoreQuotaError } from '../../services/penLocalStoreSanitize';
import {
  isProjectDoc,
  promoteProjectToFinishedLibraryDoc,
  saveProjectAsLibraryTemplate,
  publishPostToOwnerCloud,
  publishTemplateToOwnerCloud,
  writeComposedVideoPublishHandoff,
  writeMixedPagesPublishHandoff,
  writeTextCollectionHandoff
} from '../../services/penPublish';
import { previewPath, socialFeedPublishAllowed } from '../../services/penPreview';
import { requestNotaryStamp, fetchMonetizationConnectReady } from '../../services/penApi';
import { castPollVote, createPollSheet, putPollStructure } from '../../services/pollCloud';
import { ensureBundleTrackingSheets } from '../../services/widgetTracking';
import { queueWidgetAction } from '../../services/widgetAction';
import { resolveSigningKeys } from '../../services/penKeys';
import {
  actorCan,
  invitePenCollaborator,
  applyPenCommentInbound,
  applyPenSuggestionInbound,
  fetchGroupRoster,
  queuePenComment,
  queuePenSectionPromote,
  queuePenSuggestion,
  promotePenOutboxAndFanout
} from '../../services/penCollab';
import { publishDocCloud, upsertDraftCloud } from '../../services/penCloudStore';
import { enqueueSyncJob } from '../../services/penSyncQueue';
import {
  buildAndStoreGalleryPreview,
  docRequiresGalleryVideoCompose,
  withGalleryPreview
} from '../../services/penGalleryPreview';
import { ownerGet } from '../../services/penOwnerFetch';
import type { Connection } from '@par-noir/social-connections';
import { getPenConnections } from '../../services/penConnections';
import { createPenDocInvite } from '../../services/penDocInvite';
import {
  syncUsedCustomFontsOnManifest,
  ensureDocScopedFonts,
  loadDocScopedFontsForEditor
} from '../../services/penDocFonts';
import { ensureDocScopedMedia } from '../../services/penDocMedia';
import { ensureGoogleFontsLoaded } from '../../services/penGoogleFonts';
import {
  appendLocalComment,
  listLocalComments,
  listLocalSuggestions,
  makeComment,
  makeSuggestion,
  readPublishedFileId,
  upsertLocalSuggestion
} from '../../services/penAnnotations';
import {
  ActivityLedger,
  type DocSnapshot
} from '../../services/penActivityLedger';
import { encryptSectionJson, envelopeToWireB64, mintDocKey } from '../../services/penDocCrypto';
import {
  bodyFromSections,
  openMessagingWithCorrespondence
} from '../../services/penCorrespondenceHandoff';
import { hydrateDocFromCloud } from '../../services/penHydrate';
import { isDocBootstrapPending } from '../../services/penSyncQueue';
import { ensureOwnerDocGroup } from '../../services/penCollab';
import { loadDocKey } from '../../services/penDocCrypto';

import { useNavigate } from 'react-router-dom';
import type { PenSession } from '../../services/penSession';
import { peerRoutes } from './peerRoutes';

export type DocEditorReadyState = {
  phase: 'ready';
  [key: string]: unknown;
};

export type DocEditorControllerState =
  | { phase: 'loading' }
  | { phase: 'notFound' }
  | DocEditorReadyState;

export function useDocEditorController(session: PenSession, docId: string): DocEditorControllerState {
  const navigate = useNavigate();
  const initial = loadLocalDoc(session.pnIdentifier, docId);
  // Bridge browse publish → engagement fileId when available in this origin's storage
  if (initial && !initial.manifest.publishedFileId) {
    const fid = readPublishedFileId(docId);
    if (fid) {
      initial.manifest = { ...initial.manifest, publishedFileId: fid };
      saveLocalDoc(session.pnIdentifier, initial);
    }
  }
  const [bundle, setBundle] = useState(initial);
  // Local buffer present (e.g. just created) → show editor immediately; hydrate in background.
  const [hydrating, setHydrating] = useState(!initial);
  const [activeSlug, setActiveSlug] = useState(initial?.manifest.toc[0] || 'body');
  const [showPreview, setShowPreview] = useState(true);
  const [previewToolbarHost, setPreviewToolbarHost] = useState<HTMLDivElement | null>(null);
  const [previewPaneEl, setPreviewPaneEl] = useState<HTMLDivElement | null>(null);
  const [editorSplitEl, setEditorSplitEl] = useState<HTMLDivElement | null>(null);
  const [editorPanePx, setEditorPanePx] = useState<number | null>(null);
  const [editorSplitWide, setEditorSplitWide] = useState(true);
  const [screenAllPages, setScreenAllPages] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [engagementGuide, setEngagementGuide] = useState(false);
  const [previewScroll, setPreviewScroll] = useState({
    sig: '',
    recenterKey: '',
    scrollLeft: 0,
    scrollTop: 0,
    leadingX: 0,
    leadingY: 0,
    prevLeadingX: 0,
    prevLeadingY: 0,
    recenter: true
  });
  const [previewPaneSize, setPreviewPaneSize] = useState({ width: 0, height: 0 });
  /** Layout size of the page. Pane changes scale this box; they do not resize it. */
  const previewLayoutRef = useRef<{ key: string; width: number; height: number } | null>(null);
  const [galleryComposeCapture, setGalleryComposeCapture] = useState(false);
  const [captureLayers, setCaptureLayers] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [invitePn, setInvitePn] = useState('');
  const [inviteRole, setInviteRole] = useState<PenRole>('collaborator');
  const [shareConnections, setShareConnections] = useState<Connection[]>([]);
  const [shareConnectionsLoading, setShareConnectionsLoading] = useState(false);
  const [selectedConnectionPns, setSelectedConnectionPns] = useState<string[]>([]);
  const [joinLink, setJoinLink] = useState<string | null>(null);
  const [joinLinkLoading, setJoinLinkLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastDraftAt, setLastDraftAt] = useState<string | null>(
    () => initial?.manifest.updatedAt || null
  );
  const [savedTick, setSavedTick] = useState(0);
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const [historyUi, setHistoryUi] = useState({ canUndo: false, canRedo: false });
  const bundleRef = useRef(bundle);
  const dirtyRef = useRef(false);
  const activeSlugRef = useRef(activeSlug);
  const ledgerRef = useRef(new ActivityLedger());
  const applyingHistoryRef = useRef(false);
  const ledgerTimerRef = useRef<number | null>(null);
  bundleRef.current = bundle;
  dirtyRef.current = dirty;
  activeSlugRef.current = activeSlug;
  const [error, setError] = useState<string | null>(null);
  const [votedOptionByGroup, setVotedOptionByGroup] = useState<Record<string, string>>({});
  const [toggledKeys, setToggledKeys] = useState<Set<string>>(() => new Set());
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const inputValuesRef = useRef(inputValues);
  inputValuesRef.current = inputValues;
  const [stampAt, setStampAt] = useState<Record<string, string>>({});
  const [rankByGroup, setRankByGroup] = useState<Record<string, Record<string, number>>>({});
  const [amountByGroup, setAmountByGroup] = useState<Record<string, Record<string, number>>>({});
  const widgetSheetTimer = useRef<number | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(PAGE_LAYER_ID);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineGroupId, setTimelineGroupId] = useState<string | null>(null);
  const [socialLayersOpen, setSocialLayersOpen] = useState(false);
  const [socialSelectedIds, setSocialSelectedIds] = useState<string[]>([PAGE_LAYER_ID]);
  const socialLayersBtnRef = useRef<HTMLButtonElement>(null);
  const [comments, setComments] = useState<PenDocComment[]>(() =>
    listLocalComments(session.pnIdentifier, docId)
  );
  const [suggestions, setSuggestions] = useState<PenSuggestion[]>(() =>
    listLocalSuggestions(session.pnIdentifier, docId)
  );
  const [connectReady, setConnectReady] = useState(false);
  const verifiedAuthor = useVerifiedAuthor(session);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setShareConnectionsLoading(true);
      const rows = await getPenConnections(session.pnIdentifier);
      if (!cancel) setShareConnections(rows);
      if (!cancel) setShareConnectionsLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [session.pnIdentifier]);

  useEffect(() => {
    bindTimelineSample(setPlayheadSec);
    return () => bindTimelineSample(null);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    const apply = () => setEditorSplitWide(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const row = editorSplitEl;
    if (!row) return;
    const apply = () => {
      const width = row.clientWidth;
      if (width <= 0) return;
      setEditorPanePx((prev) => clampEditorPanePx(prev ?? width / 2, width));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(row);
    return () => observer.disconnect();
  }, [editorSplitEl]);

  useEffect(() => {
    if (!previewPaneEl) return;
    const measure = () =>
      setPreviewPaneSize({
        width: previewPaneEl.clientWidth,
        height: previewPaneEl.clientHeight
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(previewPaneEl);
    return () => observer.disconnect();
  }, [previewPaneEl]);

  useEffect(() => {
    const pane = previewPaneEl;
    if (!pane || !previewScroll.sig) return;
    const frame = requestAnimationFrame(() => {
      if (previewScroll.recenter) {
        pane.scrollLeft = previewScroll.scrollLeft;
        pane.scrollTop = previewScroll.scrollTop;
        return;
      }
      pane.scrollLeft += previewScroll.leadingX - previewScroll.prevLeadingX;
      pane.scrollTop += previewScroll.leadingY - previewScroll.prevLeadingY;
    });
    return () => cancelAnimationFrame(frame);
  }, [previewScroll, previewPaneEl]);

  useEffect(() => {
    let cancelled = false;
    void fetchMonetizationConnectReady(session.accessToken, session.pnIdentifier)
      .then((ready) => {
        if (!cancelled) setConnectReady(ready);
      })
      .catch(() => {
        if (!cancelled) setConnectReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.accessToken, session.pnIdentifier]);

  const template = useMemo(
    () => (bundle ? getTemplate(bundle.manifest.templateId) : undefined),
    [bundle]
  );

  const classTrail = useMemo(() => {
    const classId = bundle?.manifest.classId || template?.classId;
    if (!classId) return template?.title || bundle?.manifest.templateId || '';
    const form = getClass(classId);
    const category = form?.parentId ? getClass(form.parentId) : undefined;
    return [category?.title, form?.title, template?.title]
      .filter(Boolean)
      .join(' · ');
  }, [bundle, template]);

  const isSocialDoc = useMemo(() => {
    const classId = bundle?.manifest.classId || template?.classId;
    if (!classId) return false;
    const form = getClass(classId);
    return form?.parentId === 'social';
  }, [bundle, template]);

  const isWidgetDoc = useMemo(() => {
    const classId = bundle?.manifest.classId || template?.classId;
    if (!classId) return false;
    return getClass(classId)?.parentId === 'widgets';
  }, [bundle, template]);

  const isStickerDoc = useMemo(() => {
    return (bundle?.manifest.classId || template?.classId) === 'widgets.sticker';
  }, [bundle, template]);

  const section = useMemo(() => {
    const raw = bundle?.sections.find((s) => s.slug === activeSlug) || bundle?.sections[0];
    if (!raw) return undefined;
    return collapseLegacyPrimaryTextLayer(ensureDefaultTextLayer(normalizeSection(raw)));
  }, [bundle, activeSlug]);

  const widgetEditorLayer = useMemo(() => {
    if (!section || isPageLayerId(activeLayerId)) return null;
    const layer = section.layers?.find((item) => item.id === activeLayerId) || null;
    return layer && layerOpensWidgetEditor(layer) ? layer : null;
  }, [section, activeLayerId]);

  const introPlayKey = useRef<string | null>(null);
  useEffect(() => {
    if (!bundle || !section) return;
    if (!isWidgetDoc && !widgetEditorLayer) return;
    const key = `${bundle.manifest.docId}:${section.slug}:${widgetEditorLayer?.id || 'page'}`;
    if (introPlayKey.current === key) return;
    introPlayKey.current = key;
    setPlayheadSec(0);
    setTimelinePlaying(true);
  }, [bundle, section, isWidgetDoc, widgetEditorLayer]);

  const socialActionLayer = useMemo(() => {
    if (!section || isPageLayerId(activeLayerId) || widgetEditorLayer) return null;
    const layer = section.layers?.find((l) => l.id === activeLayerId);
    if (!layer || (layer.kind !== 'embed' && layer.kind !== 'interactive')) return null;
    return layer;
  }, [section, activeLayerId, widgetEditorLayer]);

  // One-shot: persist collapse of legacy layer_primary seed into local buffer.
  useEffect(() => {
    if (!bundle) return;
    let changed = false;
    const sections = bundle.sections.map((s) => {
      const next = collapseLegacyPrimaryTextLayer(ensureDefaultTextLayer(normalizeSection(s)));
      if ((next.layers?.length ?? 0) !== (s.layers?.length ?? 0)) changed = true;
      return next;
    });
    if (!changed) return;
    const nextBundle = {
      ...bundle,
      sections,
      manifest: { ...bundle.manifest, updatedAt: new Date().toISOString() }
    };
    saveLocalDoc(session.pnIdentifier, nextBundle);
    setBundle(nextBundle);
  }, [docId, session.pnIdentifier]); // eslint-disable-line react-hooks/exhaustive-deps -- once per doc open

  useEffect(() => {
    const current = bundleRef.current;
    if (!current) return;
    const docId = current.manifest.docId;
    type Bundle = NonNullable<typeof bundle>;
    const jobs: Array<{ original: string; apply: (ref: string, b: Bundle) => Bundle }> = [];
    for (const sec of current.sections) {
      for (const layer of sec.layers || []) {
        const original = layerOriginalForProxy(layer);
        if (!original) continue;
        jobs.push({
          original,
          apply: (ref, b) => {
            let changed = false;
            const sections = b.sections.map((s) => {
              if (s.slug !== sec.slug) return s;
              const layers = (s.layers || []).map((item) => {
                if (item.id !== layer.id || item.editProxySrc) return item;
                if (publishPlaybackSrc(item) !== original) return item;
                changed = true;
                return { ...item, editProxySrc: ref };
              });
              return changed ? { ...s, layers } : s;
            });
            return changed ? { ...b, sections } : b;
          }
        });
      }
    }
    const pageVideo = current.manifest.pagePresentation?.backgroundVideo?.trim();
    if (pageVideo && !current.manifest.pagePresentation?.editProxySrc) {
      jobs.push({
        original: pageVideo,
        apply: (ref, b) => {
          const pres = b.manifest.pagePresentation;
          if (!pres?.backgroundVideo || pres.backgroundVideo.trim() !== pageVideo || pres.editProxySrc) {
            return b;
          }
          return {
            ...b,
            manifest: {
              ...b.manifest,
              pagePresentation: { ...pres, editProxySrc: ref }
            }
          };
        }
      });
    }
    if (!jobs.length) return;
    let cancelled = false;
    void (async () => {
      const updates: Array<(b: Bundle) => Bundle> = [];
      for (const job of jobs) {
        const ref = await ensureEditProxy({
          docId,
          originalRef: job.original,
          session
        });
        if (ref) updates.push((b) => job.apply(ref, b));
      }
      if (cancelled || !updates.length) return;
      const latest = bundleRef.current;
      if (!latest) return;
      let next = latest;
      for (const update of updates) next = update(next);
      if (next !== latest) persist(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [bundle, session]);

  const flowsBody = layer0Flows(bundle?.manifest.classId, bundle?.manifest.pageLayout);

  const canvasSection = useMemo(() => {
    if (!section) return undefined;
    if (!isPageLayerId(activeLayerId)) {
      const layer = section.layers?.find((l) => l.id === activeLayerId);
      if (
        layer?.kind === 'text' &&
        layer.widgetElement !== 'time' &&
        layer.widgetElement !== 'input' &&
        layer.widgetElement !== 'html'
      ) {
        return { ...section, doc: getTextLayerDoc(layer) };
      }
      // Non-text object: do not bind TipTap to Body under that object's name
      return undefined;
    }
    if (flowsBody && section.storyId && bundle) {
      const story = storyForSlug(bundle.sections, bundle.manifest.toc, section.slug);
      const anchor = story
        ? bundle.sections.find((item) => item.slug === story.anchorSlug)
        : undefined;
      if (anchor) return { ...section, slug: anchor.slug, doc: normalizeSection(anchor).doc };
    }
    return section;
  }, [section, activeLayerId, flowsBody, bundle]);

  const writingEnabled = useMemo(() => {
    if (!section) return false;
    if (isPageLayerId(activeLayerId)) return true;
    const layer = section.layers?.find((l) => l.id === activeLayerId);
    if (!layer || layer.kind !== 'text') return false;
    if (
      layer.widgetElement === 'time' ||
      layer.widgetElement === 'input' ||
      layer.widgetElement === 'html'
    ) {
      return false;
    }
    // Media fills on a text object use the media panel, not TipTap.
    if (layer.imageSrc || layer.videoSrc || layer.backgroundImage || layer.backgroundVideo) {
      return false;
    }
    return true;
  }, [section, activeLayerId]);

  const activeMediaLayer = useMemo(() => {
    if (!section || isPageLayerId(activeLayerId)) return null;
    const layer = section.layers?.find((l) => l.id === activeLayerId);
    if (!layer) return null;
    if (layer.kind === 'image' || layer.kind === 'video') return layer;
    // Legacy fill-on-text attachments still open the media panel.
    if (layer.imageSrc || layer.videoSrc || layer.backgroundImage || layer.backgroundVideo) {
      return layer;
    }
    return null;
  }, [section, activeLayerId]);

  const buttonCaptionById = useMemo(() => {
    const map: Record<string, string> = {};
    if (!section) return map;
    for (const layer of section.layers || []) {
      const groupKey = layer.parentGroupId || 'doc';
      if (layer.behavior === 'widget.toggle') {
        const key = `${groupKey}:${session.pnIdentifier}`;
        if (toggledKeys.has(key)) map[layer.id] = `${layer.label || 'Button'} On`;
      } else if (layer.behavior === 'widget.stamp' && stampAt[layer.id]) {
        map[layer.id] = new Date(stampAt[layer.id]).toLocaleString();
      } else if (layer.behavior === 'widget.rank') {
        const rank = rankByGroup[groupKey]?.[layer.id];
        if (rank) map[layer.id] = String(rank);
      } else if (layer.behavior === 'widget.allocate') {
        const amounts = amountByGroup[groupKey] || {};
        const spent = Object.values(amounts).reduce((sum, value) => sum + value, 0);
        const left = Math.max(0, allocateTotal(section, layer.parentGroupId || null) - spent);
        const amount = amounts[layer.id] || 0;
        if (amount || spent) map[layer.id] = `${amount} · ${left} left`;
      }
    }
    return map;
  }, [section, session.pnIdentifier, toggledKeys, stampAt, rankByGroup, amountByGroup]);

  const widgetStripLayer = useMemo(() => {
    if (!section || isPageLayerId(activeLayerId)) return null;
    return section.layers?.find((item) => item.id === activeLayerId) || null;
  }, [section, activeLayerId]);

  const activeWritingDoc = useMemo((): PenTipTapNode | undefined => {
    if (!section) return undefined;
    if (!isPageLayerId(activeLayerId)) {
      const layer = section.layers?.find((l) => l.id === activeLayerId);
      if (layer?.kind === 'text') return getTextLayerDoc(layer);
      return undefined;
    }
    if (flowsBody && section.storyId && bundle) {
      const story = storyForSlug(bundle.sections, bundle.manifest.toc, section.slug);
      const anchor = story
        ? bundle.sections.find((item) => item.slug === story.anchorSlug)
        : undefined;
      if (anchor) return normalizeSection(anchor).doc;
    }
    return section.doc;
  }, [section, activeLayerId, flowsBody, bundle]);

  const sectionTitle = useMemo(() => {
    const fromTpl = template?.sections.find((s) => s.slug === activeSlug)?.title;
    return fromTpl || activeSlug;
  }, [template, activeSlug]);

  const writingLabel = useMemo(() => {
    if (!section || isPageLayerId(activeLayerId)) {
      return sectionTitle === 'body' || activeSlug === 'body' ? 'Body' : sectionTitle;
    }
    const layer = section.layers?.find((l) => l.id === activeLayerId);
    if (layer) return defaultLayerName(layer, section.layers || []);
    return sectionTitle;
  }, [section, activeLayerId, sectionTitle, activeSlug]);

  function persistWritingDoc(nextDoc: PenTipTapNode) {
    if (!section || !bundle) return;
    let updated = section;
    if (isPageLayerId(activeLayerId)) {
      if (flowsBody && section.storyId) {
        const story = storyForSlug(bundle.sections, bundle.manifest.toc, section.slug);
        const anchor = story
          ? bundle.sections.find((item) => item.slug === story.anchorSlug)
          : undefined;
        updated = { ...(anchor || section), doc: nextDoc };
      } else {
        updated = { ...section, doc: nextDoc };
      }
    } else if (activeLayerId) {
      try {
        updated = setTextLayerDoc(normalizeSection(section), activeLayerId, nextDoc, {
          syncDoc: false
        });
      } catch {
        return;
      }
    }
    persist({
      ...bundle,
      sections: bundle.sections.map((s) => (s.slug === updated.slug ? updated : s)),
      manifest: { ...bundle.manifest, updatedAt: new Date().toISOString() }
    });
  }

  const onEditorReady = useCallback((ed: Editor | null) => setEditor(ed), []);

  const pageLayout: PenPageLayout = bundle?.manifest.pageLayout || 'flow';

  useEffect(() => {
    if (!flowsBody) return;
    const current = bundleRef.current;
    if (!current) return;
    const next = ensureLayer0Stories(current.sections, current.manifest.toc, true);
    if (next === current.sections) return;
    persist({
      ...current,
      sections: next,
      manifest: { ...current.manifest, updatedAt: new Date().toISOString() }
    });
  }, [flowsBody, bundle]);

  function onStoryBlockHeights(heights: number[]) {
    const current = bundleRef.current;
    if (!current || !flowsBody || !isPageLayerId(activeLayerId)) return;
    const story = storyForSlug(current.sections, current.manifest.toc, activeSlugRef.current);
    if (!story) return;
    const contentH = paperContentHeightPx(
      current.manifest.pageLayout,
      resolvePagePaddingPx(current.manifest.pagePresentation?.padding),
      {
        widthPx: current.manifest.flowWorkspaceWidthPx,
        heightPx: current.manifest.flowWorkspaceHeightPx,
        sizeId: current.manifest.pageSize
      }
    );
    if (contentH <= 0 || !heights.length) return;
    const rounded = heights.map((height) => Math.round(height));
    const packed = assignBlocksToFrames(rounded, contentH);
    let sections = current.sections;
    let toc = current.manifest.toc;
    if (packed.length > story.slugs.length) {
      for (let i = story.slugs.length; i < packed.length; i += 1) {
        const added = appendStoryFrame(sections, toc, story.storyId);
        if (!added) break;
        sections = added.sections;
        toc = added.toc;
      }
    }
    const frameCount = toc.filter(
      (slug) => sections.find((item) => item.slug === slug)?.storyId === story.storyId
    ).length;
    const { ranges } = rangesForFrameCount(rounded, contentH, frameCount);
    const ranged = applyStoryRanges(sections, toc, story.storyId, ranges);
    if (ranged === sections && toc === current.manifest.toc) return;
    const next = {
      ...current,
      sections: ranged,
      manifest: { ...current.manifest, toc, updatedAt: new Date().toISOString() }
    };
    bundleRef.current = next;
    persist(next);
  }

  const bumpHistoryUi = useCallback(() => {
    setHistoryUi({
      canUndo: ledgerRef.current.canUndo(),
      canRedo: ledgerRef.current.canRedo()
    });
  }, []);

  const snapshotOf = useCallback(
    (b: NonNullable<typeof initial>, slug: string): DocSnapshot => ({
      title: b.manifest.title,
      sections: b.sections,
      activeSlug: slug
    }),
    []
  );

  const scheduleLedgerPush = useCallback(
    (next: NonNullable<typeof initial>) => {
      if (applyingHistoryRef.current) return;
      if (ledgerTimerRef.current != null) window.clearTimeout(ledgerTimerRef.current);
      ledgerTimerRef.current = window.setTimeout(() => {
        ledgerTimerRef.current = null;
        ledgerRef.current.pushEdit(snapshotOf(next, activeSlugRef.current));
        bumpHistoryUi();
      }, 400);
    },
    [bumpHistoryUi, snapshotOf]
  );

  const flushLedgerPush = useCallback(() => {
    if (ledgerTimerRef.current != null) {
      window.clearTimeout(ledgerTimerRef.current);
      ledgerTimerRef.current = null;
    }
    const current = bundleRef.current;
    if (!current || applyingHistoryRef.current) return;
    ledgerRef.current.pushEdit(snapshotOf(current, activeSlugRef.current));
    bumpHistoryUi();
  }, [bumpHistoryUi, snapshotOf]);

  const applyHistorySnapshot = useCallback(
    (snap: DocSnapshot) => {
      applyingHistoryRef.current = true;
      setActiveSlug(snap.activeSlug);
      setActiveLayerId(null);
      setBundle((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: snap.sections,
          manifest: {
            ...prev.manifest,
            title: snap.title,
            updatedAt: new Date().toISOString()
          }
        };
      });
      setDirty(true);
      setHistoryEpoch((n) => n + 1);
      bumpHistoryUi();
      window.requestAnimationFrame(() => {
        applyingHistoryRef.current = false;
      });
    },
    [bumpHistoryUi]
  );

  const undoEdit = useCallback(() => {
    flushLedgerPush();
    const snap = ledgerRef.current.undo();
    if (snap) applyHistorySnapshot(snap);
    else bumpHistoryUi();
  }, [applyHistorySnapshot, bumpHistoryUi, flushLedgerPush]);

  const redoEdit = useCallback(() => {
    flushLedgerPush();
    const snap = ledgerRef.current.redo();
    if (snap) applyHistorySnapshot(snap);
    else bumpHistoryUi();
  }, [applyHistorySnapshot, bumpHistoryUi, flushLedgerPush]);

  // Seed ledger when document loads / changes.
  useEffect(() => {
    const loaded = loadLocalDoc(session.pnIdentifier, docId);
    if (!loaded) return;
    ledgerRef.current.seed(
      snapshotOf(loaded, loaded.manifest.toc[0] || 'body')
    );
    bumpHistoryUi();
  }, [docId, session.pnIdentifier, snapshotOf, bumpHistoryUi]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (key === 'y' || (key === 'z' && e.shiftKey)) redoEdit();
      else undoEdit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoEdit, redoEdit]);

  // Cloud hydrate on mount. Skip GET while local-first bootstrap is still queued
  // (avoids console 404). When a local buffer exists, do not block the editor;
  // only apply cloud if the user has not started editing.
  useEffect(() => {
    let cancelled = false;
    const pn = session.pnIdentifier;
    if (isDocBootstrapPending(pn, docId)) {
      setHydrating(false);
      return;
    }
    const hadLocal = Boolean(loadLocalDoc(pn, docId));
    if (!hadLocal) setHydrating(true);
    void hydrateDocFromCloud({ session, docId })
      .then((fromCloud) => {
        if (cancelled) return;
        if (!fromCloud) return;
        if (dirtyRef.current) return;
        setBundle(fromCloud);
        setActiveSlug(fromCloud.manifest.toc[0] || 'body');
        setLastDraftAt(fromCloud.manifest.updatedAt || null);
        setDirty(false);
      })
      .catch(() => {
        /* offline — keep local buffer if any */
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [docId, session]);

  // Load Google + doc-scoped custom fonts for the open doc (editor WYSIWYG only).
  useEffect(() => {
    if (!bundle) return;
    const families = collectFontFamiliesFromDoc({
      sections: bundle.sections,
      pagePresentationFontFamily: bundle.manifest.pagePresentation?.fontFamily
    });
    ensureGoogleFontsLoaded(families.filter((f) => isGooglePenFont(f)));
    const used = bundle.manifest.usedCustomFonts || [];
    if (used.length) {
      void loadDocScopedFontsForEditor({
        pnIdentifier: session.pnIdentifier,
        docId,
        used
      }).catch(() => undefined);
    }
  }, [bundle, docId, session.pnIdentifier]);

  // Backfill owner-wrapped docKey for docs created before bootstrap registered the group.
  useEffect(() => {
    const docKey = loadDocKey(docId);
    const local = loadLocalDoc(session.pnIdentifier, docId);
    const groupId = local?.manifest.groupId;
    if (!docKey || !groupId || !session.mlKemSecretKey) return;
    void ensureOwnerDocGroup({
      ownerPnIdentifier: session.pnIdentifier,
      groupId,
      title: local.manifest.title || 'Untitled',
      docKey,
      mlKemSecretKey: session.mlKemSecretKey
    }).catch(() => {
      /* already registered or offline */
    });
  }, [docId, session]);

  function onStageAction(message: PenActionMessage) {
    if (!bundle) return;
    for (const sec of bundle.sections) {
      const layer = (sec.layers || []).find((item) => item.id === message.layerId);
      if (!layer) continue;
      setActiveLayerId(layer.id);
      setSocialSelectedIds([layer.id]);
      if (message.behavior === 'poll.vote') {
        void voteOnPoll({ ...layer, bindRowId: layer.bindRowId || message.bindRowId || layer.id });
      } else if (message.behavior) {
        void runWidgetAction(layer);
      }
      return;
    }
  }

  async function voteOnPoll(layer: PenPageLayer) {
    if (!bundle || !section || layer.behavior !== 'poll.vote' || !layer.bindRowId) return;
    const group = layer.parentGroupId
      ? section.layers?.find((item) => item.id === layer.parentGroupId)
      : undefined;
    const spreadsheetId = group?.spreadsheetId || bundle.manifest.pollSpreadsheetId;
    if (!spreadsheetId) {
      setError('Save the poll before voting.');
      return;
    }
    try {
      const result = await castPollVote({
        session,
        ownerPnIdentifier: session.pnIdentifier,
        docId: bundle.manifest.docId,
        spreadsheetId,
        optionId: layer.bindRowId
      });
      const structure = structureFromLayers(section, group?.id || null);
      const next = syncPollLayers(section, group?.id || null, structure, result.counts);
      persist({
        ...bundle,
        sections: bundle.sections.map((s) => (s.slug === next.slug ? next : s)),
        manifest: { ...bundle.manifest, updatedAt: new Date().toISOString() }
      });
      if (!result.enqueued) {
        setError('Vote counted. It will reach the sheet after the owner unlocks.');
      }
      const optionId = layer.bindRowId || layer.id;
      setVotedOptionByGroup((prev) => ({ ...prev, [group?.id || 'doc']: optionId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'vote_failed');
    }
  }

  function persist(next: NonNullable<typeof bundle>, opts?: { draft?: boolean }) {
    const stamped = {
      ...next,
      manifest: {
        ...next.manifest,
        updatedAt: next.manifest.updatedAt || new Date().toISOString()
      }
    };
    if (opts?.draft !== false) {
      // Stage in memory; autosave / Save draft flushes to local store.
      bundleRef.current = stamped;
      setBundle({ ...stamped });
      setDirty(true);
      scheduleLedgerPush(stamped);
      return;
    }
    void saveLocalDocAsync(session.pnIdentifier, stamped)
      .then((saved) => {
        setBundle({ ...saved });
        setDirty(false);
        setLastDraftAt(saved.manifest.updatedAt);
        scheduleLedgerPush(saved);
      })
      .catch((e) => {
        setError(
          e instanceof PenLocalStoreQuotaError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'save_failed'
        );
      });
  }

  function persistSection(next: NonNullable<typeof section>) {
    if (!bundle) return;
    persist({
      ...bundle,
      sections: bundle.sections.map((s) => (s.slug === next.slug ? next : s)),
      manifest: { ...bundle.manifest, updatedAt: new Date().toISOString() }
    });
  }

  function commitWidgetSection(next: NonNullable<typeof section>) {
    persistSection(next);
    if (widgetSheetTimer.current) window.clearTimeout(widgetSheetTimer.current);
    widgetSheetTimer.current = window.setTimeout(() => {
      void pushWidgetSheet(next);
    }, 500);
  }

  function setInputValue(layerId: string, value: string) {
    setInputValues((prev) => (prev[layerId] === value ? prev : { ...prev, [layerId]: value }));
  }

  async function runWidgetAction(layer: PenPageLayer) {
    if (!bundle || !section || !layer.behavior) return;
    const groupId = layer.parentGroupId || null;
    const groupKey = groupId || 'doc';
    if (layer.behavior === 'cta.open') {
      const url = (layer.openUrl || '').trim();
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (layer.behavior === 'widget.reveal') {
      persistSection(revealSibling(section, layer.id));
      return;
    }
    if (layer.behavior === 'widget.submit') {
      const values = inputValuesRef.current;
      const fields = submitFields(section, groupId, values);
      const body = Object.entries(fields)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      const to = (layer.submitTo || '').trim();
      if (to) {
        if (to.includes('@')) {
          window.location.assign(
            `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(layer.label || 'Widget')}&body=${encodeURIComponent(body)}`
          );
        } else {
          openMessagingWithCorrespondence({
            title: layer.label || 'Widget',
            body,
            docId: bundle.manifest.docId
          });
        }
        return;
      }
      if (!formCollectsToSheet(section, groupId)) {
        openMessagingWithCorrespondence({
          title: layer.label || 'Widget',
          body,
          docId: bundle.manifest.docId
        });
        return;
      }
      const headers = inputColumnKeys(section, groupId);
      const cells = cellsForInputs(section, groupId, values);
      const built = buildWidgetActionRow({
        trigger: 'widget.submit',
        actorId: session.pnIdentifier,
        actionId: crypto.randomUUID(),
        headers,
        cells,
        fields
      });
      try {
        const spreadsheetId = await ensureWidgetSpreadsheet(section, groupId);
        await queueWidgetAction({
          session,
          docId: bundle.manifest.docId,
          spreadsheetId,
          row: built.row
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'widget_action_failed');
      }
      return;
    }
    if (!isSheetTrigger(layer.behavior)) return;
    const actorId = session.pnIdentifier;
    const actionId = crypto.randomUUID();
    const trigger = layer.behavior;
    let present: boolean | undefined;
    let headers: string[] | undefined;
    let cells: string[] | undefined;
    let createdAt: string | undefined;
    if (trigger === 'widget.toggle') {
      const key = `${groupKey}:${actorId}`;
      present = !toggledKeys.has(key);
      setToggledKeys((prev) => {
        const next = new Set(prev);
        if (present) next.add(key);
        else next.delete(key);
        return next;
      });
    } else if (trigger === 'widget.stamp') {
      createdAt = new Date().toISOString();
      setStampAt((prev) => ({ ...prev, [layer.id]: createdAt! }));
    } else if (trigger === 'widget.rank') {
      const next = nextRankPress(rankByGroup[groupKey] || {}, layer.id);
      setRankByGroup((prev) => ({ ...prev, [groupKey]: next }));
      headers = rankColumnKeys(section, groupId);
      cells = cellsForRanks(section, groupId, next);
    } else if (trigger === 'widget.allocate') {
      const step = nextAllocatePress(amountByGroup[groupKey] || {}, layer.id, allocateTotal(section, groupId));
      setAmountByGroup((prev) => ({ ...prev, [groupKey]: step.amounts }));
      if (!step.complete) return;
      headers = allocateColumnKeys(section, groupId);
      cells = cellsForAmounts(section, groupId, step.amounts);
    }
    const built = buildWidgetActionRow({
      trigger,
      actorId,
      actionId,
      createdAt,
      present,
      headers,
      cells
    });
    try {
      const spreadsheetId = await ensureWidgetSpreadsheet(section, groupId);
      await queueWidgetAction({
        session,
        docId: bundle.manifest.docId,
        spreadsheetId,
        row: built.row
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'widget_action_failed');
    }
  }

  function sectionNeedsSheet(next: NonNullable<typeof section>): boolean {
    return (next.layers || []).some(
      (layer) => layer.behavior === 'poll.vote' || isSheetTrigger(layer.behavior)
    );
  }

  async function ensureWidgetSpreadsheet(
    source: NonNullable<typeof section>,
    groupId: string | null
  ): Promise<string> {
    if (!bundle) throw new Error('poll_save_failed');
    const group = groupId ? (source.layers || []).find((layer) => layer.id === groupId) : null;
    const existing = (group?.spreadsheetId || (!groupId ? bundle.manifest.pollSpreadsheetId : '') || '').trim();
    if (existing) return existing;
    const created = await createPollSheet({
      session,
      docId: bundle.manifest.docId,
      groupId: groupId || bundle.manifest.docId,
      structure: structureFromLayers(source, groupId)
    });
    if (groupId) {
      persistSection({
        ...source,
        layers: (source.layers || []).map((layer) =>
          layer.id === groupId ? { ...layer, spreadsheetId: created } : layer
        )
      });
    } else {
      persist({
        ...bundle,
        sections: bundle.sections.map((item) => (item.slug === source.slug ? source : item)),
        manifest: {
          ...bundle.manifest,
          pollSpreadsheetId: created,
          updatedAt: new Date().toISOString()
        }
      });
    }
    return created;
  }

  async function pushWidgetSheet(next: NonNullable<typeof section>) {
    if (!bundle || !sectionNeedsSheet(next)) return;
    const docId = bundle.manifest.docId;
    let section = next;
    const groups = (section.layers || []).filter(
      (layer) => layer.kind === 'group' && sectionHasVoteButton(section, layer.id)
    );
    const targets = groups.length
      ? groups.map((group) => ({ groupId: group.id as string | null, spreadsheetId: group.spreadsheetId || null }))
      : [{ groupId: null as string | null, spreadsheetId: bundle.manifest.pollSpreadsheetId || null }];
    for (const target of targets) {
      if (!sectionHasVoteButton(section, target.groupId)) continue;
      const structure = structureFromLayers(section, target.groupId);
      if (!structure.options.length) continue;
      try {
        const spreadsheetId = target.spreadsheetId || (await ensureWidgetSpreadsheet(section, target.groupId));
        if (structure.options.length) {
          await putPollStructure({ session, docId, spreadsheetId, structure });
        }
      } catch {
        setError('poll_save_failed');
      }
    }
  }

  useEffect(() => {
    if (!bundle || !isWidgetDoc) return;
    const pres = bundle.manifest.pagePresentation;
    const bare =
      bundle.manifest.pageLayout === 'flow' &&
      pres?.backgroundColor === 'transparent' &&
      !pres.backgroundGradient &&
      !pres.backgroundImage &&
      !pres.backgroundVideo;
    if (bare) return;
    persist({
      ...bundle,
      manifest: {
        ...bundle.manifest,
        pageLayout: 'flow',
        pagePresentation: {
          ...(pres || defaultEditorPagePresentation()),
          backgroundColor: 'transparent',
          backgroundGradient: undefined,
          backgroundImage: undefined,
          backgroundVideo: undefined
        }
      }
    });
  }, [bundle, isWidgetDoc]);

  function saveDraft(opts?: { silent?: boolean }) {
    const current = bundleRef.current;
    if (!current || !dirtyRef.current) return;
    const now = new Date().toISOString();
    const draftId =
      current.manifest.activeDraftId ||
      sessionStorage.getItem(`pen_active_draft:${docId}`) ||
      `draft_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const used = syncUsedCustomFontsOnManifest({
      manifest: current.manifest,
      sections: current.sections,
      pnIdentifier: session.pnIdentifier
    });
    const next = {
      ...current,
      manifest: {
        ...current.manifest,
        updatedAt: now,
        activeDraftId: draftId,
        lifecycle: current.manifest.lifecycle || ('draft' as const),
        usedCustomFonts: used
      }
    };
    // Optimistic UI; async sanitize+IDB migrate then persist.
    setBundle({ ...next });
    setDirty(false);
    setLastDraftAt(now);

    void (async () => {
      try {
        const saved = await saveLocalDocAsync(session.pnIdentifier, next);
        setBundle({ ...saved });
        bundleRef.current = saved;

        const draftMeta = {
          draftId,
          docId,
          authorPnHash: hashPnIdentifier(session.pnIdentifier),
          createdAt: now,
          updatedAt: now,
          status: 'unfinished' as const,
          toc: saved.manifest.toc
        };
        sessionStorage.setItem(
          `pen_draft_meta:${docId}:${draftId}`,
          JSON.stringify(draftMeta)
        );

        void upsertDraftCloud({
          userPnIdentifier: session.pnIdentifier,
          manifest: saved.manifest,
          draft: draftMeta,
          sections: saved.sections
        }).catch((e) => {
          enqueueSyncJob(session.pnIdentifier, {
            kind: 'draft_upsert',
            docId,
            payload: {
              manifest: saved.manifest,
              draft: draftMeta,
              sections: saved.sections
            }
          });
          void e;
        });

        if (used.length && session.mlKemSecretKey) {
          void ensureDocScopedFonts({
            session,
            docId,
            groupId: saved.manifest.groupId,
            used
          }).catch(() => {
            /* offline */
          });
        }

        void ensureDocScopedMedia({
          session,
          docId,
          sections: saved.sections,
          pagePresentation: saved.manifest.pagePresentation,
          onSectionsRewritten: (sections, pagePresentation) => {
            const cur = bundleRef.current;
            if (!cur) return;
            const rewritten = {
              ...cur,
              sections,
              manifest: {
                ...cur.manifest,
                ...(pagePresentation ? { pagePresentation } : {})
              }
            };
            bundleRef.current = rewritten;
            setBundle({ ...rewritten });
            void saveLocalDocAsync(session.pnIdentifier, rewritten).catch(() => {
              /* offline / quota */
            });
          }
        }).catch(() => {
          /* offline */
        });

        if (!opts?.silent) {
          setStatus('Draft saved');
          window.setTimeout(() => setStatus(null), 1500);
        }
      } catch (e) {
        setDirty(true);
        setError(
          e instanceof PenLocalStoreQuotaError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'draft_save_failed'
        );
      }
    })();
  }

  // Idle draft autosave (~2s after last edit).
  useEffect(() => {
    if (!dirty) return;
    const idle = window.setTimeout(() => saveDraft({ silent: true }), 2000);
    return () => window.clearTimeout(idle);
  }, [dirty, bundle]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      if (dirtyRef.current) saveDraft({ silent: true });
    }, 30_000);
    const relabel = window.setInterval(() => setSavedTick((n) => n + 1), 15_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(relabel);
    };
  }, []);

  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current || !bundleRef.current) return;
      const now = new Date().toISOString();
      saveLocalDoc(session.pnIdentifier, {
        ...bundleRef.current,
        manifest: { ...bundleRef.current.manifest, updatedAt: now }
      });
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
    };
  }, [session.pnIdentifier]);

  async function promote() {
    setError(null);
    setStatus('Publishing live…');
    try {
      const keys = resolveSigningKeys(session);
      const now = new Date();
      const paths = promoteSectionToPast(docId, section!.slug, now);
      const pub = publishCurrentToPast(docId, now, { forceTime: true });
      const bytes = new TextEncoder().encode(JSON.stringify(section));
      const contentHash = hashSectionContent(bytes);
      const prevHeadHash = headHashFromChain(bundle!.chain);
      let link = signPromoteLink({
        sectionSlug: section!.slug,
        pastName: paths.pastName,
        contentHash,
        prevHeadHash,
        authorPn: session.pnIdentifier,
        clientPromotedAt: now.toISOString(),
        secretKey: keys.secretKey,
        publicKey: keys.publicKey
      });
      try {
        const notary = await requestNotaryStamp(session.accessToken, notaryHashForPromote(link));
        attachNotary(link, notary);
      } catch {
        /* offline notary optional */
      }

      const nextChain = { ...bundle!.chain, links: [...bundle!.chain.links, link] };
      const verified = verifyChain(nextChain);
      if (!verified.ok) throw new Error(verified.error);

      let nextManifest: PenDocManifest = {
        ...bundle!.manifest,
        updatedAt: now.toISOString(),
        lifecycle: 'published',
        ownerPnHash:
          bundle!.manifest.ownerPnHash || hashPnIdentifier(session.pnIdentifier),
        roles:
          bundle!.manifest.roles ||
          ensureOwnerAssignment([], hashPnIdentifier(session.pnIdentifier))
      };

      // Composed gallery preview (local + Drive penmedia).
      // Video-layer docs: encode must succeed — do not soft-skip.
      const needsVideoGallery = docRequiresGalleryVideoCompose(
        bundle!.sections,
        bundle!.manifest.pagePresentation
      );
      try {
        setStatus('Building gallery preview…');
        // Social live preview is feed-tile only — mount page layers offscreen so
        // compose can flatten video + overlays (same surface as non-social preview).
        flushSync(() => setGalleryComposeCapture(true));
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        await new Promise((r) => setTimeout(r, 450));
        const preview = await buildAndStoreGalleryPreview({
          session,
          docId,
          commitHash: headHashFromChain(nextChain),
          sections: bundle!.sections,
          clockSection: section,
          pagePresentation: bundle!.manifest.pagePresentation
        });
        nextManifest = withGalleryPreview(nextManifest, preview);
        if (!preview.uploaded) {
          enqueueSyncJob(session.pnIdentifier, {
            kind: 'gallery_preview',
            docId,
            payload: {
              localMediaId: preview.localMediaId,
              posterLocalMediaId: preview.posterLocalMediaId,
              kind: preview.galleryPreviewKind,
              commitHash: preview.galleryPreviewCommitHash
            }
          });
        }
      } catch (e) {
        if (needsVideoGallery) {
          throw e instanceof Error
            ? e
            : new Error('gallery_video_compose_failed');
        }
        const msg = e instanceof Error ? e.message : 'gallery_preview_failed';
        setStatus(`Committed — gallery preview skipped (${msg})`);
        window.setTimeout(() => setStatus(null), 4000);
      } finally {
        setGalleryComposeCapture(false);
      }

      persist(
        {
          manifest: nextManifest,
          sections: bundle!.sections,
          chain: nextChain
        },
        { draft: false }
      );

      setStatus((s) => (s && s.startsWith('Committed —') ? s : 'Publishing live…'));

      const ciphertextB64 = envelopeToWireB64(
        await encryptSectionJson(section!, mintDocKey(docId))
      );

      const peerRouteKeys = await peerRoutes(session, bundle!.manifest.groupId);

      try {
        await publishDocCloud({
          userPnIdentifier: session.pnIdentifier,
          manifest: nextManifest,
          sections: bundle!.sections,
          link,
          sourceDraftId: bundle!.manifest.activeDraftId,
          at: now
        });
      } catch (e) {
        enqueueSyncJob(session.pnIdentifier, {
          kind: 'publish',
          docId,
          payload: {
            manifest: nextManifest,
            sections: bundle!.sections,
            link,
            sourceDraftId: bundle!.manifest.activeDraftId
          }
        });
        if (!(e instanceof Error && /cloud_token|Failed to fetch|NetworkError/i.test(e.message))) {
          throw e;
        }
        setStatus('Queued offline — will publish when online');
        window.setTimeout(() => setStatus(null), 3000);
        return;
      }

      // Owner chain append is solely via pen.publish above. Peer replicas get
      // section_promote throughway only — ownCloudApplied skips a second Drive append.
      if (peerRouteKeys.length > 0) {
        queuePenSectionPromote({
          session,
          outboxId: `pen_${crypto.randomUUID()}`,
          payload: {
            docId,
            groupId: bundle!.manifest.groupId,
            sectionSlug: section!.slug,
            pastName: paths.pastName,
            currentRelPath: paths.currentPath,
            pastRelPath: paths.pastPath,
            sectionCiphertextB64: ciphertextB64,
            contentHash,
            link
          },
          peerRouteKeys,
          ownCloudApplied: true
        });
        void promotePenOutboxAndFanout(session);
      }

      void pub;
      setStatus('Published live');
      window.setTimeout(() => setStatus(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'publish_failed');
      setStatus(null);
    }
  }

  async function inviteCollaborator(roleOverride?: typeof inviteRole, peerPnOverride?: string) {
    const pn = (peerPnOverride ?? invitePn).trim();
    if (!pn || !bundle) return;
    if (
      !actorCan(
        bundle.manifest.roles,
        bundle.manifest.ownerPnHash,
        session.pnIdentifier,
        'invite'
      )
    ) {
      setError('no_invite_permission');
      return;
    }
    setStatus('Inviting…');
    setError(null);
    try {
      const groupId = bundle.manifest.groupId || sessionStorage.getItem(`pen_group_id:${docId}`) || '';
      if (!groupId) throw new Error('group_id_required');

      let peerPk = sessionStorage.getItem(`pen_peer_kem:${pn}`) || '';
      if (!peerPk) {
        const lookup = await ownerGet(`/api/profile/${encodeURIComponent(pn)}`, {
          pnIdentifier: session.pnIdentifier
        });
        if (!lookup.ok) {
          throw new Error(
            lookup.status === 404
              ? 'peer_profile_not_found'
              : `peer_profile_lookup_failed_${lookup.status}`
          );
        }
        const data = (await lookup.json().catch(() => ({}))) as {
          mlKemPublicKey?: string | null;
        };
        peerPk = (data.mlKemPublicKey || '').trim();
      }
      if (!peerPk) {
        throw new Error(
          'peer_messaging_key_unpublished — ask them to unlock browse or messaging once so their ML-KEM public key is on their profile'
        );
      }
      sessionStorage.setItem(`pen_peer_kem:${pn}`, peerPk);

      const granted = roleOverride || inviteRole;
      await invitePenCollaborator({
        session,
        docId,
        groupId,
        title: bundle.manifest.title,
        peerPnIdentifier: pn,
        role: granted,
        peerMlKemPublicKey: peerPk
      });
      const peerHash = hashPnIdentifier(pn);
      const roles = [
        ...(bundle.manifest.roles ||
          ensureOwnerAssignment([], hashPnIdentifier(session.pnIdentifier))),
        { pnHash: peerHash, role: granted }
      ];
      persist({
        ...bundle,
        manifest: { ...bundle.manifest, roles, updatedAt: new Date().toISOString() }
      });
      setStatus(roleOverride === 'viewer' ? `Preview sealed. ${previewPath(docId)}` : 'Invited');
      if (!peerPnOverride) setInvitePn('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'invite_failed');
      setStatus(null);
    }
  }

  async function inviteSelectedConnections() {
    for (const pn of selectedConnectionPns) {
      await inviteCollaborator(inviteRole, pn);
    }
    setSelectedConnectionPns([]);
  }

  async function createDocJoinLink() {
    if (!bundle) return;
    const groupId = bundle.manifest.groupId || sessionStorage.getItem(`pen_group_id:${docId}`) || '';
    if (!groupId) {
      setError('group_id_required');
      return;
    }
    setJoinLinkLoading(true);
    setError(null);
    try {
      const created = await createPenDocInvite({
        session,
        docId,
        groupId,
        title: bundle.manifest.title,
        role: inviteRole
      });
      setJoinLink(created.joinUrl);
      setStatus('Join link created');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'invite_link_failed');
    } finally {
      setJoinLinkLoading(false);
    }
  }

  function copyDocJoinLink() {
    if (!joinLink) return;
    void navigator.clipboard?.writeText(joinLink);
    setStatus('Link copied');
  }

  function rememberPostFileId(b: NonNullable<typeof bundle>, fileId: string) {
    const next = {
      ...b,
      manifest: { ...b.manifest, publishedFileId: fileId, updatedAt: new Date().toISOString() }
    };
    persist(next);
  }

  function waitTwoFrames(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  function pageExportRoot(slug: string): HTMLElement | null {
    const scoped = document.querySelector(
      `[data-preview-page="${CSS.escape(slug)}"] [data-pen-compose-export-root]`
    );
    return scoped instanceof HTMLElement ? scoped : null;
  }

  async function rootForSlug(slug: string): Promise<HTMLElement> {
    const live = pageExportRoot(slug);
    if (live) return live;
    flushSync(() => {
      setActiveSlug(slug);
      setGalleryComposeCapture(true);
    });
    await waitTwoFrames();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const root = findComposeExportRoot();
    if (!root) throw new Error('compose_export_root_missing');
    return root;
  }

  async function withActionsHidden<T>(root: HTMLElement, run: () => Promise<T>): Promise<T> {
    const current = bundleRef.current || bundle;
    const restore = hideActionLayers(root, actionLayerIds(current?.sections || []));
    try {
      return await run();
    } finally {
      restore();
    }
  }

  async function downloadFlattened() {
    if (!bundle) return;
    const kind = downloadKindForSections(bundle.sections);
    const name = downloadBasename(bundle.manifest.title || 'pen');
    const prev = activeSlugRef.current;
    const view = resolvePageView(bundle.manifest.pageView, bundle.manifest.pageLayout);
    setStatus(kind === 'video' ? 'Preparing video…' : 'Preparing download…');
    try {
      if (view === 'screen') {
        flushSync(() => setCaptureLayers(true));
        await waitTwoFrames();
      }
      if (kind === 'video') {
        const { videoSections } = partitionSectionsForPublish(bundle.sections);
        const slug = videoSections[0]?.slug || bundle.sections[0]?.slug;
        if (!slug) throw new Error('compose_export_root_missing');
        const root = await rootForSlug(slug);
        setPlaybackMode('publish');
        const section = bundle.sections.find((item) => item.slug === slug);
        const encoded = await withActionsHidden(root, () =>
          composePageToVideo(
            root,
            section && sectionHasMotion(section)
              ? {
                  clockDurationSec: resolveTimelineDuration(section),
                  onSample: emitTimelineSample
                }
              : {}
          )
        );
        const ext = encoded.videoContentType.includes('mp4') ? 'mp4' : 'webm';
        saveDownload(encoded.videoBlob, `${name}.${ext}`);
      } else if (kind === 'image') {
        const slug =
          bundle.sections.find((item) => sectionIsFeedPage(item))?.slug || bundle.sections[0]?.slug;
        if (!slug) throw new Error('compose_export_root_missing');
        const root = await rootForSlug(slug);
        const blob = await withActionsHidden(root, () =>
          rasterizeElementToPosterBlob(root, { mime: 'image/png' })
        );
        saveDownload(blob, `${name}.png`);
      } else {
        const pages = bundle.sections.filter((item) => sectionIsFeedPage(item));
        const targets = pages.length ? pages : bundle.sections;
        const blobs: Blob[] = [];
        for (const page of targets) {
          const root = await rootForSlug(page.slug);
          blobs.push(
            await withActionsHidden(root, () => rasterizeElementToPosterBlob(root, { mime: 'image/png' }))
          );
        }
        saveDownload(await pngBlobsToPdf(blobs), `${name}.pdf`);
      }
      setStatus(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'download_failed');
      setStatus(null);
    } finally {
      setPlaybackMode('edit');
      setCaptureLayers(false);
      setGalleryComposeCapture(false);
      if (activeSlugRef.current !== prev) setActiveSlug(prev);
    }
  }

  function publishSocial(feedIds: string[]) {
    const classId = bundleRef.current?.manifest.classId || bundle?.manifest.classId || '';
    if (!socialFeedPublishAllowed(classId)) {
      setError('social_feed_only');
      return;
    }
    void (async () => {
      try {
        saveDraft({ silent: true });
        const ready = await ensureBundleTrackingSheets({
          session,
          bundle: bundleRef.current || bundle!
        });
        bundleRef.current = ready;
        persist(ready);
        const b = ready;
        const publishOpts = {
          canPublishPublicTemplate: verifiedAuthor,
          connectReady
        };
        setStatus('Publishing to your cloud…');
        let fileId: string;
        if (shouldPublishAsSingleComposedVideo(b.sections)) {
          setStatus('Encoding composed video…');
          const prevSlug = activeSlugRef.current;
          const video = await writeComposedVideoPublishHandoff(b, {
            ...publishOpts,
            activateSection: (slug) => {
              setActiveSlug(slug);
            },
            onProgress: (pct) => {
              setStatus(`Encoding composed video… ${Math.round(pct)}%`);
            }
          });
          setActiveSlug(prevSlug);
          setStatus('Publishing to your cloud…');
          fileId = (
            await publishPostToOwnerCloud({
              bundle: b,
              feedIds,
              pnIdentifier: session.pnIdentifier,
              membership: verifiedAuthor,
              connectReady,
              video
            })
          ).fileId;
        } else if (shouldPublishAsMixedPages(b.sections)) {
          setStatus('Encoding video pages…');
          const prevSlug = activeSlugRef.current;
          const mixed = await writeMixedPagesPublishHandoff(b, {
            ...publishOpts,
            activateSection: (slug) => {
              setActiveSlug(slug);
            },
            onProgress: (pct) => {
              setStatus(`Encoding video pages… ${Math.round(pct)}%`);
            }
          });
          setActiveSlug(prevSlug);
          setStatus('Publishing to your cloud…');
          fileId = (
            await publishPostToOwnerCloud({
              bundle: b,
              feedIds,
              pnIdentifier: session.pnIdentifier,
              membership: verifiedAuthor,
              connectReady,
              mixed
            })
          ).fileId;
        } else {
          const template = getTemplate(b.manifest.templateId);
          const asCollection = shouldPublishSocialAsCollection({
            classId: b.manifest.classId,
            publishContentClass: template?.publishContentClass,
            templateSectionSlugs: template?.sections.map((section) => section.slug),
            sections: b.sections
          });
          fileId = (
            await publishPostToOwnerCloud({
              bundle: b,
              feedIds,
              pnIdentifier: session.pnIdentifier,
              membership: verifiedAuthor,
              connectReady,
              ...(asCollection
                ? { mixed: writeTextCollectionHandoff(b, publishOpts) }
                : {})
            })
          ).fileId;
        }
        rememberPostFileId(bundleRef.current || b, fileId);
        setStatus('Published to your cloud');
        window.setTimeout(() => setStatus(null), 4000);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'feed_connect_failed');
        setStatus(null);
      }
    })();
  }

  function publishTemplate(templateLicensing: PenLicensingRoot) {
    void (async () => {
      try {
        const b = bundleRef.current || bundle!;
        if (!b.manifest.publishedFileId) {
          setError('Publish the post before publishing the template');
          return;
        }
        setStatus('Publishing template to your cloud…');
        const { fileId } = await publishTemplateToOwnerCloud({
          bundle: b,
          templateLicensing,
          verified: verifiedAuthor,
          pnIdentifier: session.pnIdentifier,
          connectReady
        });
        const next = bundleRef.current || b;
        persist({
          ...next,
          manifest: {
            ...next.manifest,
            templatePublishedFileId: fileId,
            templateLicensing,
            updatedAt: new Date().toISOString()
          }
        });
        setStatus('Template published');
        window.setTimeout(() => setStatus(null), 4000);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'template_publish_failed');
        setStatus(null);
      }
    })();
  }

  function sendCorrespondence() {
    try {
      saveDraft({ silent: true });
      const b = bundleRef.current || bundle!;
      openMessagingWithCorrespondence({
        title: b.manifest.title || 'Untitled',
        body: bodyFromSections(b.sections),
        classId: b.manifest.classId,
        docId: b.manifest.docId
      });
      setStatus('Opened Messaging');
      window.setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'send_failed');
    }
  }

  async function publishLive() {
    await promote();
  }

  function publishAsTemplate() {
    void (async () => {
      try {
        const saved = await starTemplateToCloud(session, bundle!);
        setStatus(`Template saved: ${saved.title}`);
        window.setTimeout(() => setStatus(null), 3000);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'template_save_failed');
      }
    })();
  }

  function publishAsLibraryTemplate() {
    try {
      const saved = saveProjectAsLibraryTemplate(session.pnIdentifier, bundle!);
      setStatus(`Library template saved: ${saved.title}`);
      window.setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'library_template_save_failed');
    }
  }

  async function publishFinishedWork() {
    setError(null);
    setStatus('Creating finished Library document…');
    try {
      const next = await promoteProjectToFinishedLibraryDoc({ session, bundle: bundle! });
      setStatus('Finished Library document created');
      navigate(`/d/${next.manifest.docId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'finished_work_failed');
      setStatus(null);
    }
  }

  async function addComment() {
    const body = commentDraft.trim();
    if (!body || !bundle) return;
    const { from, to } = editor?.state.selection || { from: undefined, to: undefined };
    const comment = makeComment({
      docId,
      sectionSlug: activeSlug,
      body,
      authorPn: session.pnIdentifier,
      from,
      to: from !== to ? to : undefined
    });
    appendLocalComment(session.pnIdentifier, docId, comment);
    setComments(listLocalComments(session.pnIdentifier, docId));
    setCommentDraft('');
    const peerRouteKeys = await peerRoutes(session, bundle.manifest.groupId);
    const payload = { docId, groupId: bundle.manifest.groupId, comment };
    queuePenComment({
      session,
      outboxId: `pen_c_${crypto.randomUUID()}`,
      payload,
      peerRouteKeys
    });
    await applyPenCommentInbound({
      userPnIdentifier: session.pnIdentifier,
      docId,
      groupId: bundle.manifest.groupId,
      comment
    }).catch(() => null);
    setStatus('Comment added');
  }

  async function proposeSuggestion() {
    if (!section || !bundle) return;
    const suggestion = makeSuggestion({
      docId,
      sectionSlug: section.slug,
      authorPn: session.pnIdentifier,
      proposedDoc: section.doc,
      summary: `Proposed update to ${section.slug}`
    });
    upsertLocalSuggestion(session.pnIdentifier, docId, suggestion);
    setSuggestions(listLocalSuggestions(session.pnIdentifier, docId));
    const peerRouteKeys = await peerRoutes(session, bundle.manifest.groupId);
    const payload = { docId, groupId: bundle.manifest.groupId, suggestion };
    queuePenSuggestion({
      session,
      outboxId: `pen_s_${crypto.randomUUID()}`,
      payload,
      peerRouteKeys
    });
    await applyPenSuggestionInbound({
      userPnIdentifier: session.pnIdentifier,
      docId,
      groupId: bundle.manifest.groupId,
      suggestion
    }).catch(() => null);
    setStatus('Suggestion queued');
  }

  async function acceptSuggestion(suggestion: PenSuggestion) {
    if (!bundle) return;
    setError(null);
    setStatus('Accepting…');
    try {
      const keys = resolveSigningKeys(session);
      const now = new Date();
      const nextSection = { slug: suggestion.sectionSlug, doc: suggestion.proposedDoc };
      const paths = promoteSectionToPast(docId, suggestion.sectionSlug, now);
      const bytes = new TextEncoder().encode(JSON.stringify(nextSection));
      const contentHash = hashSectionContent(bytes);
      let link = signPromoteLink({
        sectionSlug: suggestion.sectionSlug,
        pastName: paths.pastName,
        contentHash,
        prevHeadHash: headHashFromChain(bundle.chain),
        authorPn: session.pnIdentifier,
        clientPromotedAt: now.toISOString(),
        secretKey: keys.secretKey,
        publicKey: keys.publicKey
      });
      try {
        const notary = await requestNotaryStamp(session.accessToken, notaryHashForPromote(link));
        attachNotary(link, notary);
      } catch {
        /* offline */
      }
      const nextChain = { ...bundle.chain, links: [...bundle.chain.links, link] };
      const nextSections = bundle.sections.map((s) =>
        s.slug === nextSection.slug ? nextSection : s
      );
      persist({
        manifest: { ...bundle.manifest, updatedAt: now.toISOString() },
        sections: nextSections,
        chain: nextChain
      });

      const accepted: PenSuggestion = { ...suggestion, status: 'accepted' };
      upsertLocalSuggestion(session.pnIdentifier, docId, accepted);
      setSuggestions(listLocalSuggestions(session.pnIdentifier, docId));

      const acceptPromote = {
        docId,
        groupId: bundle.manifest.groupId,
        sectionSlug: suggestion.sectionSlug,
        pastName: paths.pastName,
        currentRelPath: paths.currentPath,
        pastRelPath: paths.pastPath,
        sectionCiphertextB64: envelopeToWireB64(
          await encryptSectionJson(nextSection, mintDocKey(docId))
        ),
        contentHash,
        link
      };
      const peerRouteKeys = await peerRoutes(session, bundle.manifest.groupId);
      queuePenSuggestion({
        session,
        outboxId: `pen_s_${crypto.randomUUID()}`,
        payload: { docId, suggestion: accepted, acceptPromote },
        peerRouteKeys
      });
      await applyPenSuggestionInbound({
        userPnIdentifier: session.pnIdentifier,
        docId,
        groupId: bundle.manifest.groupId,
        suggestion: accepted,
        acceptPromote
      }).catch(() => null);
      setStatus('Suggestion accepted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'accept_failed');
      setStatus(null);
    }
  }

  function rejectSuggestion(suggestion: PenSuggestion) {
    const rejected: PenSuggestion = { ...suggestion, status: 'rejected' };
    upsertLocalSuggestion(session.pnIdentifier, docId, rejected);
    setSuggestions(listLocalSuggestions(session.pnIdentifier, docId));
    setStatus('Suggestion rejected');
  }

  if (hydrating) return { phase: 'loading' };
  if (!bundle || !section) return { phase: 'notFound' };
  return {
    phase: 'ready',
    acceptSuggestion,
    activeLayerId,
    activeMediaLayer,
    activeSlug,
    activeSlugRef,
    activeWritingDoc,
    addComment,
    amountByGroup,
    applyHistorySnapshot,
    applyingHistoryRef,
    bumpHistoryUi,
    bundle,
    bundleRef,
    buttonCaptionById,
    cancel,
    cancelled,
    canvasSection,
    captureLayers,
    changed,
    classTrail,
    commentDraft,
    comments,
    commitWidgetSection,
    connectReady,
    copyDocJoinLink,
    createDocJoinLink,
    dirty,
    dirtyRef,
    downloadFlattened,
    editor,
    editorPanePx,
    editorSplitEl,
    editorSplitWide,
    engagementGuide,
    ensureWidgetSpreadsheet,
    error,
    flushLedgerPush,
    galleryComposeCapture,
    historyEpoch,
    historyUi,
    hydrating,
    i,
    inputValues,
    inputValuesRef,
    introPlayKey,
    inviteCollaborator,
    invitePn,
    inviteRole,
    inviteSelectedConnections,
    isSocialDoc,
    isStickerDoc,
    isWidgetDoc,
    joinLink,
    joinLinkLoading,
    lastDraftAt,
    ledgerRef,
    ledgerTimerRef,
    link,
    navigate,
    next,
    onEditorReady,
    onStageAction,
    onStoryBlockHeights,
    pageExportRoot,
    peerPk,
    persist,
    persistSection,
    persistWritingDoc,
    playheadSec,
    previewLayoutRef,
    previewPaneEl,
    previewPaneSize,
    previewScroll,
    previewToolbarHost,
    previewZoom,
    promote,
    proposeSuggestion,
    publishAsLibraryTemplate,
    publishAsTemplate,
    publishFinishedWork,
    publishLive,
    publishSocial,
    publishTemplate,
    pushWidgetSheet,
    rankByGroup,
    redoEdit,
    rejectSuggestion,
    rememberPostFileId,
    rootForSlug,
    runWidgetAction,
    saveDraft,
    savedTick,
    scheduleLedgerPush,
    screenAllPages,
    section,
    sectionNeedsSheet,
    sectionTitle,
    sections,
    selectedConnectionPns,
    sendCorrespondence,
    setInputValue,
    shareConnections,
    shareConnectionsLoading,
    showComments,
    showHistory,
    showPreview,
    snapshotOf,
    socialActionLayer,
    socialLayersBtnRef,
    socialLayersOpen,
    socialSelectedIds,
    stampAt,
    status,
    suggestions,
    template,
    timelineGroupId,
    timelinePlaying,
    toc,
    toggledKeys,
    undoEdit,
    updated,
    verifiedAuthor,
    voteOnPoll,
    votedOptionByGroup,
    waitTwoFrames,
    widgetEditorLayer,
    widgetSheetTimer,
    widgetStripLayer,
    writingEnabled,
    writingLabel,
  };
}
