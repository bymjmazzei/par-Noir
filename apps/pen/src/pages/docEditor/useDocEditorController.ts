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
  shouldPublishAsSingleComposedVideoForFeed,
  shouldPublishAsMixedPages,
  shouldPublishAsSocialTocCollection,
  shouldPublishSocialAsCollection,
  downloadKindForSections,
  partitionSectionsForPublish,
  resolveTimelineDuration,
  isSectionTimelineActive,
  sectionIsFeedPage,
  isGooglePenFont,
  remapSectionsForAspect,
  normalizeGalleryAspect,
  isSheetTrigger,
  buildActionStageHtml,
  sectionHasVoteButton,
  structureFromLayers,
  type PenDocComment,
  type PenPageLayout,
  type PenDocManifest,
  type PenRole,
  type PenSuggestion,
  type PenTipTapNode,
  type PenLicensingRoot
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
import { ActionBindStrip } from '../../components/ActionBindStrip';
import { IconLayers } from '../../components/icons/PenIcons';
import { MediaEditorPanel } from '../../components/MediaEditorPanel';
import { SectionTimeline } from '../../components/SectionTimeline';
import { setPlayheadSec } from '../../services/playheadStore';
import { findComposeExportRoot } from '../../services/penGalleryPreview';
import {
  composedMaster,
  composePageStill,
  composePageToVideo
} from '../../services/composePageVideoEncode';
import { composeTimelineEncodeOpts } from '../../services/penFeedPagePublish';
import { setPlaybackMode } from '../../services/playbackMode';
import {
  rasterizeElementSafeStill,
  rasterizeElementToPosterBlob
} from '../../services/rasterizePagePoster';
import {
  actionLayerIds,
  downloadBasename,
  hideActionLayers,
  pngBlobsToPdf,
  saveDownload
} from '../../services/penDownload';
import { WidgetEditorPanel } from '../../components/WidgetEditorPanel';
import { LayerPartsMenu } from '../../components/LayerPartsMenu';
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
  writeSocialTocCollectionHandoff,
  writeTextCollectionHandoff,
  type PublishPostTarget
} from '../../services/penPublish';
import { previewPath, socialFeedPublishAllowed } from '../../services/penPreview';
import { requestNotaryStamp, fetchMonetizationStatus } from '../../services/penApi';
import { ensureWidgetSheet, registerTapWidget, registerWidget } from '../../services/pollCloud';
import { ensureBundleTrackingSheets } from '../../services/widgetTracking';
import { resolveSigningKeys } from '../../services/penKeys';
import {
  actorCan,
  invitePenCollaborator,
  knownMemberPns,
  rekeyPenDoc,
  resolvePeerKemPublicKey,
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
  captureTemplatePosterBlob,
  docRequiresGalleryVideoCompose,
  withGalleryPreview
} from '../../services/penGalleryPreview';
import type { Connection } from '@par-noir/social-connections';
import { getPenConnections } from '../../services/penConnections';
import { createPenDocInvite } from '../../services/penDocInvite';
import {
  syncUsedCustomFontsOnManifest,
  ensureDocScopedFonts,
  loadDocScopedFontsForEditor
} from '../../services/penDocFonts';
import { assertDocMediaOnDrive } from '../../services/penDraftFlush';
import { ensurePublishPlaybackBytes } from '../../services/penPublishMedia';
import type { ShareToFeedSubmit } from '../../components/ShareToFeedDialog';
import { forkDocForNewPost } from '../../services/forkDocForNewPost';
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
import { loadDocKey, saveDocKey } from '../../services/penDocCrypto';

import { useNavigate } from 'react-router-dom';
import type { PenSession } from '../../services/penSession';
import { peerRoutes } from './peerRoutes';
import { penControllerReady } from '../penControllerReady';
import {
  PEN_DRAFT_UPSERT_KIND,
  applyRoleChange,
  withMemberSigningKey,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import {
  signRekey,
  type PenLiveDocState,
  type PenLiveRemoteChange,
  type PenLiveSealedSnapshot
} from '@par-noir/pen-live';
import { queuePenOutbox } from '../../services/penCollab';
import { saveDriveLiveSnapshot, saveLocalLiveSnapshot } from '../../services/penLiveStore';
import type { LocalDocBundle } from '../../services/penLocalStore';
import { usePenLive } from './usePenLive';

/** Mailbox jobs stay small; larger live state reaches peers over the relay instead. */
const LIVE_FANOUT_MAX_CHARS = 400_000;
const LIVE_FANOUT_EVERY_MS = 5 * 60_000;

/** Ready keys validated by controllerReadyState.gate.test.ts */
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
  const [ledgerHistoryUi, setHistoryUi] = useState({ canUndo: false, canRedo: false });
  const bundleRef = useRef(bundle);
  const dirtyRef = useRef(false);
  const activeSlugRef = useRef(activeSlug);
  const ledgerRef = useRef(new ActivityLedger());
  const applyingHistoryRef = useRef(false);
  const ledgerTimerRef = useRef<number | null>(null);
  bundleRef.current = bundle;
  dirtyRef.current = dirty;
  activeSlugRef.current = activeSlug;

  /** Sections/toc a live update replaced (null = deleted), so stale closures persist the latest. */
  const liveReplacedRef = useRef(new WeakMap<object, object | null>());
  const liveActiveRef = useRef(false);
  const liveEditedRef = useRef(false);

  const commitLiveBundle = useCallback((next: LocalDocBundle) => {
    bundleRef.current = next;
    setBundle(next);
    setDirty(true);
    if (!next.manifest.toc.includes(activeSlugRef.current)) {
      setActiveSlug(next.manifest.toc[0] || 'body');
    }
  }, []);

  const onLiveRemote = useCallback(
    (change: PenLiveRemoteChange) => {
      const current = bundleRef.current;
      if (!current) return;
      const replaced = liveReplacedRef.current;
      const sections = current.sections.slice();
      for (const [slug, next] of change.sections) {
        const idx = sections.findIndex((s) => s.slug === slug);
        if (idx >= 0) {
          replaced.set(sections[idx], next);
          if (next) sections[idx] = next;
          else sections.splice(idx, 1);
        } else if (next) {
          sections.push(next);
        }
      }
      const manifest = { ...current.manifest };
      if (change.title !== undefined) manifest.title = change.title;
      if (change.toc) {
        replaced.set(current.manifest.toc, change.toc);
        manifest.toc = change.toc;
      }
      commitLiveBundle({ ...current, sections, manifest });
    },
    [commitLiveBundle]
  );

  const onLiveAdopt = useCallback(
    (state: PenLiveDocState) => {
      const current = bundleRef.current;
      if (!current) return;
      const replaced = liveReplacedRef.current;
      for (const s of current.sections) {
        replaced.set(s, state.sections.find((n) => n.slug === s.slug) ?? null);
      }
      replaced.set(current.manifest.toc, state.toc);
      commitLiveBundle({
        ...current,
        sections: state.sections,
        manifest: { ...current.manifest, title: state.title || current.manifest.title, toc: state.toc }
      });
    },
    [commitLiveBundle]
  );

  const onLiveAttest = useCallback(
    (pnHash: string, mlDsaPublicKey: string, attestation: { by: string; signature: string }) => {
      const current = bundleRef.current;
      if (!current) return;
      persist({
        ...current,
        manifest: {
          ...current.manifest,
          roles: withMemberSigningKey(current.manifest.roles || [], pnHash, mlDsaPublicKey, attestation),
          updatedAt: new Date().toISOString()
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const fanoutLiveSnapshot = useCallback(
    async (sealed: PenLiveSealedSnapshot | null, rolesUpdate: unknown) => {
      const groupId = bundleRef.current?.manifest.groupId;
      if (!sealed || !groupId || !liveEditedRef.current) return;
      if (sealed.ciphertext.length > LIVE_FANOUT_MAX_CHARS) return;
      liveEditedRef.current = false;
      const peerRouteKeys = await peerRoutes(session, groupId);
      if (!peerRouteKeys.length) return;
      await queuePenOutbox({
        session,
        kind: PEN_DRAFT_UPSERT_KIND,
        outboxId: `pen_live_${crypto.randomUUID()}`,
        payload: { docId, groupId, liveSnapshot: sealed, liveRoles: rolesUpdate || undefined },
        peerRouteKeys,
        ownCloudApplied: true
      });
      void promotePenOutboxAndFanout(session);
    },
    [docId, session]
  );

  const live = usePenLive({
    session,
    docId,
    bundle,
    onRemote: onLiveRemote,
    onAdopt: onLiveAdopt,
    onAttest: onLiveAttest,
    onClosed: (sealed, rolesUpdate) => {
      void fanoutLiveSnapshot(sealed, rolesUpdate).catch(() => undefined);
    },
    onRekey: ({ keyEpoch, roles }) => {
      const current = bundleRef.current;
      if (!current || (current.manifest.keyEpoch ?? 0) >= keyEpoch) return;
      persist(
        {
          ...current,
          manifest: { ...current.manifest, keyEpoch, roles, updatedAt: new Date().toISOString() }
        },
        { draft: false }
      );
    },
    onRemoved: (stillMember) => {
      setStatus(null);
      setError(
        stillMember
          ? 'The owner rotated this doc’s key and could not reach yours. Ask them to share it again.'
          : 'The owner removed you from this doc.'
      );
    }
  });
  const liveActive = live.status === 'live';
  liveActiveRef.current = liveActive;
  const liveRef = useRef(live);
  liveRef.current = live;
  const historyUi = liveActive
    ? { canUndo: live.canUndo, canRedo: live.canRedo }
    : ledgerHistoryUi;

  useEffect(() => {
    if (liveActive && bundle) {
      live.applyLocal({
        title: bundle.manifest.title,
        toc: bundle.manifest.toc,
        sections: bundle.sections
      });
    }
  }, [bundle, liveActive, live.applyLocal]);

  useEffect(() => {
    if (!liveActive) return;
    const tick = window.setInterval(() => {
      const handle = liveRef.current;
      void handle
        .sealSnapshot()
        .then((sealed) => fanoutLiveSnapshot(sealed, handle.rolesUpdate()))
        .catch(() => undefined);
    }, LIVE_FANOUT_EVERY_MS);
    return () => window.clearInterval(tick);
  }, [liveActive, fanoutLiveSnapshot]);

  /** Swap superseded sections/toc for the live versions (persist from a stale render). */
  function rebaseOnLive(next: LocalDocBundle): LocalDocBundle {
    const replaced = liveReplacedRef.current;
    const latest = <T extends object>(value: T): T | null => {
      let cur: T | null = value;
      for (let i = 0; cur && replaced.has(cur) && i < 1000; i++) cur = replaced.get(cur) as T | null;
      return cur;
    };
    const sections = next.sections
      .map((s) => latest(s))
      .filter((s): s is PenSectionContent => s !== null);
    const toc = latest(next.manifest.toc) || next.manifest.toc;
    return { ...next, sections, manifest: { ...next.manifest, toc } };
  }
  const [error, setError] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const widgetSheetTimer = useRef<number | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(PAGE_LAYER_ID);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineGroupId, setTimelineGroupId] = useState<string | null>(null);
  const [widgetPreviewFrame, setWidgetPreviewFrame] = useState(0);
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
  const [maintenanceActive, setMaintenanceActive] = useState(false);
  const verifiedAuthor = useVerifiedAuthor(session);
  const licensingMembership = verifiedAuthor && maintenanceActive;

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
    void fetchMonetizationStatus(session.accessToken, session.pnIdentifier)
      .then((s) => {
        if (!cancelled) {
          setConnectReady(s.connectReady);
          setMaintenanceActive(s.maintenanceActive);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConnectReady(false);
          setMaintenanceActive(false);
        }
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

  const isSocialActive = useMemo(() => {
    if (bundle?.manifest.isSocial !== undefined) {
      return Boolean(bundle.manifest.isSocial);
    }
    return isSocialDoc;
  }, [bundle?.manifest.isSocial, isSocialDoc]);

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

  useEffect(() => {
    if (!section) return;
    const ctx = { pageBackgroundVideo: bundle?.manifest.pagePresentation?.backgroundVideo };
    if (!isSectionTimelineActive(section, ctx)) {
      setTimelinePlaying(false);
      setPlayheadSec(0);
    }
  }, [section, bundle?.manifest.pagePresentation?.backgroundVideo]);

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

  const liveCollab = useMemo(() => {
    if (!liveActive || !canvasSection || !writingEnabled) {
      live.bindFragment(null);
      return null;
    }
    const layerId = isPageLayerId(activeLayerId) ? null : activeLayerId;
    const bound = live.bindFragment({ slug: canvasSection.slug, layerId, doc: canvasSection.doc });
    return bound ? { ...bound, presence: live.cursor() ?? undefined } : null;
    // Rebind only when the bound text target changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveActive, live.canEdit, canvasSection?.slug, activeLayerId, writingEnabled, live.bindFragment]);
  const livePeers = live.peers;

  const [memberPns, setMemberPns] = useState<Record<string, string>>({});
  const memberGroupId = bundle?.manifest.groupId || '';
  const memberRolesJson = JSON.stringify(bundle?.manifest.roles || []);
  useEffect(() => {
    if (!memberGroupId) return;
    let cancelled = false;
    void knownMemberPns({ session, docId, groupId: memberGroupId })
      .then((pns) => {
        if (!cancelled) setMemberPns(pns);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [docId, memberGroupId, memberRolesJson, session]);
  const shareMembers = useMemo(
    () =>
      (JSON.parse(memberRolesJson) as Array<{ pnHash: string; role: PenRole }>)
        .filter((r) => r.role !== 'owner')
        .map((r) => ({
          pnHash: r.pnHash,
          role: r.role,
          label: memberPns[r.pnHash] || `Member ${r.pnHash.slice(0, 8)}`
        })),
    [memberRolesJson, memberPns]
  );

  useEffect(() => {
    live.setPresence({
      activeSectionSlug: activeSlug,
      selectedLayerIds: activeLayerId ? [activeLayerId] : []
    });
  }, [activeSlug, activeLayerId, live.setPresence]);
  const liveReadOnly = live.status === 'connecting' || (liveActive && !live.canEdit);
  const liveStatus = live.status;

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

  // Live docs undo through Yjs so only this user's own changes are reverted.
  const undoEdit = useCallback(() => {
    if (liveActiveRef.current) {
      liveRef.current.undo();
      return;
    }
    flushLedgerPush();
    const snap = ledgerRef.current.undo();
    if (snap) applyHistorySnapshot(snap);
    else bumpHistoryUi();
  }, [applyHistorySnapshot, bumpHistoryUi, flushLedgerPush]);

  const redoEdit = useCallback(() => {
    if (liveActiveRef.current) {
      liveRef.current.redo();
      return;
    }
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
      // A live-bound editor already undid its own text.
      if (e.defaultPrevented) return;
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
        if (liveActiveRef.current) {
          // Live state owns sections/title/toc; take only the rest of the replica.
          setBundle((prev) =>
            prev
              ? {
                  ...prev,
                  chain: fromCloud.chain,
                  manifest: {
                    ...fromCloud.manifest,
                    title: prev.manifest.title,
                    toc: prev.manifest.toc,
                    roles: prev.manifest.roles || fromCloud.manifest.roles
                  }
                }
              : prev
          );
          return;
        }
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

  function persist(next: NonNullable<typeof bundle>, opts?: { draft?: boolean }) {
    if (liveActiveRef.current) {
      next = rebaseOnLive(next);
      liveEditedRef.current = true;
    }
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
    // Live: peers may edit during the async save, so memory keeps the newest state.
    if (liveActiveRef.current) {
      bundleRef.current = stamped;
      setBundle({ ...stamped });
    }
    void saveLocalDocAsync(session.pnIdentifier, stamped)
      .then((saved) => {
        if (!liveActiveRef.current) setBundle({ ...saved });
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
    const effectiveGroupId =
      groupId ||
      (source.layers || []).find((layer) => layer.kind === 'group' && sectionHasVoteButton(source, layer.id))
        ?.id ||
      bundle.manifest.docId;
    const sheetGroup = (source.layers || []).find((layer) => layer.id === effectiveGroupId);
    const existing = (sheetGroup?.spreadsheetId || group?.spreadsheetId || '').trim();
    if (existing) return existing;
    const created = await ensureWidgetSheet({
      session,
      docId: bundle.manifest.docId,
      groupId: effectiveGroupId,
      section: source
    });
    persistSection({
      ...source,
      layers: (source.layers || []).map((layer) =>
        layer.id === effectiveGroupId ? { ...layer, spreadsheetId: created } : layer
      )
    });
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
      ? groups.map((g) => ({ groupId: g.id, spreadsheetId: g.spreadsheetId || null }))
      : [{ groupId: bundle.manifest.docId, spreadsheetId: null as string | null }];
    for (const target of targets) {
      if (!sectionHasVoteButton(section, target.groupId)) continue;
      try {
        const spreadsheetId = target.spreadsheetId || (await ensureWidgetSpreadsheet(section, target.groupId));
        await registerWidget({
          session,
          docId,
          groupId: target.groupId,
          section,
          spreadsheetId
        });
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

  /** Durable live state beside the draft: local buffer and this member's own Drive. */
  async function persistLiveSnapshot(): Promise<void> {
    try {
      const sealed = await liveRef.current.sealSnapshot();
      if (!sealed) return;
      saveLocalLiveSnapshot(session.pnIdentifier, docId, sealed);
      await saveDriveLiveSnapshot(session.pnIdentifier, docId, sealed);
    } catch {
      /* offline — peers and the local copy still hold the state */
    }
  }

  async function persistDraftAsync(opts?: { silent?: boolean }): Promise<LocalDocBundle> {
    const current = bundleRef.current;
    if (!current) throw new Error('no_bundle');
    if (!dirtyRef.current) return current;
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

    if (liveActiveRef.current) void persistLiveSnapshot();

    try {
      const saved = await saveLocalDocAsync(session.pnIdentifier, next);
      if (!liveActiveRef.current) {
        setBundle({ ...saved });
        bundleRef.current = saved;
      }

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

      await upsertDraftCloud({
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
        throw e;
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

      if (!opts?.silent) {
        setStatus('Draft saved');
        window.setTimeout(() => setStatus(null), 1500);
      }
      return saved;
    } catch (e) {
      setDirty(true);
      setError(
        e instanceof PenLocalStoreQuotaError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'draft_save_failed'
      );
      throw e;
    }
  }

  function saveDraft(opts?: { silent?: boolean }) {
    const current = bundleRef.current;
    if (!current || !dirtyRef.current) return;
    void persistDraftAsync(opts).catch(() => {
      /* error surfaced via setError */
    });
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

      const peerPk = await resolvePeerKemPublicKey(session, pn);

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

  /**
   * Owner removes a member: drop their role, rotate the docKey to a new epoch,
   * and hand the new key to everyone else (live notice, mailbox, group rows).
   */
  async function removeMember(pnHash: string) {
    const current = bundleRef.current;
    if (!current) return;
    const ownerHash = hashPnIdentifier(session.pnIdentifier);
    const ownerPnHash = current.manifest.ownerPnHash || ownerHash;
    if (ownerHash !== ownerPnHash || !actorCan(current.manifest.roles, ownerPnHash, session.pnIdentifier, 'revoke')) {
      setError('no_revoke_permission');
      return;
    }
    const groupId = current.manifest.groupId || sessionStorage.getItem(`pen_group_id:${docId}`) || '';
    if (!groupId) {
      setError('group_id_required');
      return;
    }
    const roles = applyRoleChange(current.manifest.roles || [], ownerPnHash, pnHash, null, 'owner');
    if (!roles) {
      setError('cannot_remove_member');
      return;
    }
    setStatus('Removing member and rotating the doc key…');
    setError(null);
    try {
      const keyEpoch = (current.manifest.keyEpoch ?? 0) + 1;
      const knownPns = await knownMemberPns({ session, docId, groupId });
      const { docKey: nextDocKey, keys, unreachable } = await rekeyPenDoc({
        session,
        docId,
        groupId,
        title: current.manifest.title,
        keyEpoch,
        roles,
        knownPns
      });
      const signing = resolveSigningKeys(session);
      const rekey = signRekey({
        docId,
        keyEpoch,
        roles,
        keys,
        owner: { pnHash: ownerHash, mlDsaSecretKey: signing.secretKey }
      });
      const sealed = await liveRef.current.announceRekey(rekey, nextDocKey);
      saveDocKey(docId, nextDocKey);
      if (sealed) void saveDriveLiveSnapshot(session.pnIdentifier, docId, sealed).catch(() => undefined);

      const peerRouteKeys = await peerRoutes(session, groupId);
      if (peerRouteKeys.length) {
        const fitsMailbox = sealed && sealed.ciphertext.length <= LIVE_FANOUT_MAX_CHARS;
        await queuePenOutbox({
          session,
          kind: PEN_DRAFT_UPSERT_KIND,
          outboxId: `pen_rekey_${crypto.randomUUID()}`,
          payload: { docId, groupId, liveRekey: rekey, ...(fitsMailbox ? { liveSnapshot: sealed } : {}) },
          peerRouteKeys,
          ownCloudApplied: true
        });
        void promotePenOutboxAndFanout(session);
      }

      const latest = bundleRef.current || current;
      persist(
        {
          ...latest,
          manifest: { ...latest.manifest, roles, keyEpoch, updatedAt: new Date().toISOString() }
        },
        { draft: false }
      );
      setStatus(
        unreachable.length
          ? `Removed. ${unreachable.length} member(s) could not get the new key; share with them again.`
          : 'Removed. The doc key was rotated.'
      );
      window.setTimeout(() => setStatus(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'remove_member_failed');
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

  function rememberPostFileId(
    b: NonNullable<typeof bundle>,
    fileId: string,
    penFeedMediaBySlug?: PenDocManifest['penFeedMediaBySlug']
  ) {
    const next = {
      ...b,
      manifest: {
        ...b.manifest,
        publishedFileId: fileId,
        ...(penFeedMediaBySlug ? { penFeedMediaBySlug } : {}),
        updatedAt: new Date().toISOString()
      }
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

  /** Same offscreen page surface Commit uses — social/screen preview hides layer video otherwise. */
  async function mountComposeCaptureForEncode(slug: string): Promise<void> {
    flushSync(() => {
      setActiveSlug(slug);
      setGalleryComposeCapture(true);
    });
    await waitTwoFrames();
    await new Promise((resolve) => setTimeout(resolve, 450));
  }

  function teardownComposeCaptureForEncode(prevSlug: string): void {
    setGalleryComposeCapture(false);
    setCaptureLayers(false);
    setActiveSlug(prevSlug);
    setPlayheadSec(0);
  }

  function sharePublishErrorMessage(e: unknown): string {
    const raw = e instanceof Error ? e.message : 'feed_connect_failed';
    if (raw === 'gallery_video_not_ready') {
      return 'Video is still loading. Wait a moment, then try Share again.';
    }
    if (raw === 'compose_export_root_missing') {
      return 'Could not prepare the page for export. Switch to the video page and retry.';
    }
    if (raw === 'compose_no_video_frames' || raw === 'compose_empty_video') {
      return 'Could not record the page video for the feed. Wait for the clip to finish loading, then try Share again.';
    }
    if (/toBlob|tainted|rasterize_/i.test(raw)) {
      return 'Could not capture a page for the feed. Wait for media to load, then try Share again.';
    }
    if (raw.startsWith('r2_owner_upload_failed') || raw.startsWith('r2_put_failed')) {
      return 'Could not upload preview to the feed CDN. Try again after the API has finished deploying.';
    }
    if (raw.startsWith('metadata_index_500') || raw.includes('companion metadata')) {
      return 'Could not index this post on the network. Deploy the latest API and try Share again.';
    }
    return raw;
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

  /** Test mode base: flattened first-frame still per page, action layers hidden, keyed by slug. */
  async function buildTestMedia(): Promise<NonNullable<PenDocManifest['penFeedMediaBySlug']>> {
    const media: NonNullable<PenDocManifest['penFeedMediaBySlug']> = {};
    if (!bundle) return media;
    const prev = activeSlugRef.current;
    const view = resolvePageView(bundle.manifest.pageView, bundle.manifest.pageLayout);
    setStatus('Preparing test…');
    try {
      if (view === 'screen') {
        flushSync(() => setCaptureLayers(true));
        await waitTwoFrames();
      }
      for (const slug of bundle.manifest.toc) {
        try {
          const root = await rootForSlug(slug);
          const blob = await withActionsHidden(root, () => composePageStill(root));
          media[slug] = { ref: URL.createObjectURL(blob), kind: 'image' };
        } catch {
          /* page keeps its raw media layer */
        }
      }
      return media;
    } finally {
      setStatus(null);
      setCaptureLayers(false);
      setGalleryComposeCapture(false);
      if (activeSlugRef.current !== prev) setActiveSlug(prev);
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
            section ? composeTimelineEncodeOpts(section, bundle.manifest) : undefined
          )
        );
        const master = composedMaster(encoded);
        const ext = master.contentType.includes('mp4') ? 'mp4' : 'webm';
        saveDownload(master.blob, `${name}.${ext}`);
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

  function publishSocial(input: ShareToFeedSubmit) {
    const m = bundleRef.current?.manifest || bundle?.manifest;
    const classId = m?.classId || '';
    if (!socialFeedPublishAllowed(classId) && !m?.isSocial) {
      setError('social_feed_only');
      return;
    }
    const mode = input.mode || 'share';
    void (async () => {
      try {
        setError(null);
        let b = await persistDraftAsync({ silent: true });
        assertDocMediaOnDrive(b);
        persist({
          ...b,
          manifest: { ...b.manifest, title: input.metadata.name.trim() }
        });
        b = bundleRef.current || b;

        let navigatedToFork = false;
        if (mode === 'new') {
          setStatus('Copying doc for new post…');
          const fork = await forkDocForNewPost({ session, source: b });
          b = fork;
          bundleRef.current = fork;
          navigatedToFork = true;
        }

        let target: PublishPostTarget = { kind: 'new' };
        if (mode === 'update') {
          const fileId = b.manifest.publishedFileId?.trim();
          if (!fileId) throw new Error('update_requires_published_post');
          target = { kind: 'update', fileId };
        }

        await ensurePublishPlaybackBytes({
          session,
          docId: b.manifest.docId,
          sections: b.sections,
          pagePresentation: b.manifest.pagePresentation
        });
        const ready = await ensureBundleTrackingSheets({
          session,
          bundle: b,
          taps: true
        });
        const tapSheet = ready.manifest.tapSpreadsheetId?.trim();
        if (tapSheet) {
          await registerTapWidget({ session, docId: ready.manifest.docId, spreadsheetId: tapSheet }).catch(
            (e: unknown) => console.warn('[pen] tap widget register failed', e instanceof Error ? e.message : e)
          );
        }
        bundleRef.current = ready;
        persist({
          ...ready,
          manifest: { ...ready.manifest, title: input.metadata.name.trim() }
        });
        b = bundleRef.current || ready;
        const publishOpts = {
          canPublishPublicTemplate: verifiedAuthor,
          connectReady
        };
        const feedPublish = {
          metadata: input.metadata,
          indexingPermissions: input.indexingPermissions
        };
        setStatus(mode === 'update' ? 'Updating shared post…' : 'Publishing to your cloud…');
        let publishResult: {
          fileId: string;
          penFeedMediaBySlug?: PenDocManifest['penFeedMediaBySlug'];
        };
        const prevSlug = activeSlugRef.current;
        const feedManifest = {
          classId: b.manifest.classId,
          isSocial: b.manifest.isSocial,
          toc: b.manifest.toc
        };
        try {
          if (
            shouldPublishAsSocialTocCollection({
              ...feedManifest,
              sections: b.sections
            })
          ) {
            setStatus('Encoding feed pages…');
            const mixed = await writeSocialTocCollectionHandoff(b, {
              ...publishOpts,
              activateSection: async (slug) => {
                await mountComposeCaptureForEncode(slug);
              },
              resolveExportRoot: (slug) => rootForSlug(slug),
              rasterizeSection: async (slug) => {
                await mountComposeCaptureForEncode(slug);
                const view = resolvePageView(b.manifest.pageView, b.manifest.pageLayout);
                if (view === 'screen') {
                  flushSync(() => setCaptureLayers(true));
                  await waitTwoFrames();
                }
                const root = await rootForSlug(slug);
                try {
                  return await rasterizeElementToPosterBlob(root, {
                    mime: 'image/jpeg',
                    punchVideos: false
                  });
                } catch {
                  return await rasterizeElementSafeStill(root);
                } finally {
                  setCaptureLayers(false);
                }
              },
              onProgress: (pct) => {
                setStatus(`Encoding feed pages… ${Math.round(pct)}%`);
              }
            });
            setStatus(mode === 'update' ? 'Updating shared post…' : 'Publishing to your cloud…');
            publishResult = await publishPostToOwnerCloud({
              bundle: b,
              feedIds: input.feedIds,
              pnIdentifier: session.pnIdentifier,
              membership: licensingMembership,
              connectReady,
              session,
              mixed,
              feedPublish,
              target
            });
          } else if (
            shouldPublishAsSingleComposedVideoForFeed(b.sections, feedManifest)
          ) {
          const { videoSections } = partitionSectionsForPublish(b.sections);
          const videoSlug = videoSections[0]?.slug;
          if (videoSlug) await mountComposeCaptureForEncode(videoSlug);
          setStatus('Encoding composed video…');
          const exportRoot = videoSlug ? await rootForSlug(videoSlug) : undefined;
          const video = await writeComposedVideoPublishHandoff(b, {
            ...publishOpts,
            exportRoot,
            activateSection: (slug) => {
              setActiveSlug(slug);
            },
            onProgress: (pct) => {
              setStatus(`Encoding composed video… ${Math.round(pct)}%`);
            }
          });
          setStatus(mode === 'update' ? 'Updating shared post…' : 'Publishing to your cloud…');
          publishResult = await publishPostToOwnerCloud({
            bundle: b,
            feedIds: input.feedIds,
            pnIdentifier: session.pnIdentifier,
            membership: licensingMembership,
            connectReady,
            session,
            video,
            feedPublish,
            target
          });
          } else if (shouldPublishAsMixedPages(b.sections)) {
          setStatus('Encoding video pages…');
          const mixed = await writeMixedPagesPublishHandoff(b, {
            ...publishOpts,
            activateSection: async (slug) => {
              await mountComposeCaptureForEncode(slug);
            },
            onProgress: (pct) => {
              setStatus(`Encoding video pages… ${Math.round(pct)}%`);
            }
          });
          setStatus(mode === 'update' ? 'Updating shared post…' : 'Publishing to your cloud…');
          publishResult = await publishPostToOwnerCloud({
            bundle: b,
            feedIds: input.feedIds,
            pnIdentifier: session.pnIdentifier,
            membership: licensingMembership,
            connectReady,
            session,
            mixed,
            feedPublish,
            target
          });
          } else {
          const template = getTemplate(b.manifest.templateId);
          const asCollection = shouldPublishSocialAsCollection({
            classId: b.manifest.classId,
            isSocial: b.manifest.isSocial,
            toc: b.manifest.toc,
            publishContentClass: template?.publishContentClass,
            templateSectionSlugs: template?.sections.map((section) => section.slug),
            sections: b.sections
          });
          publishResult = await publishPostToOwnerCloud({
            bundle: b,
            feedIds: input.feedIds,
            pnIdentifier: session.pnIdentifier,
            membership: licensingMembership,
            connectReady,
            session,
            feedPublish,
            target,
            ...(asCollection
              ? { mixed: writeTextCollectionHandoff(b, publishOpts) }
              : {})
          });
          }
          rememberPostFileId(
            bundleRef.current || b,
            publishResult.fileId,
            publishResult.penFeedMediaBySlug
          );
          setStatus(mode === 'update' ? 'Shared post updated' : 'Published to your cloud');
          window.setTimeout(() => setStatus(null), 4000);
          if (navigatedToFork) {
            navigate(`/d/${b.manifest.docId}`);
          }
        } finally {
          teardownComposeCaptureForEncode(prevSlug);
        }
      } catch (e) {
        setError(sharePublishErrorMessage(e));
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
        setStatus('Building template poster…');
        let posterBlob: Blob | null = null;
        try {
          flushSync(() => setGalleryComposeCapture(true));
          await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
          await new Promise((r) => setTimeout(r, 450));
          posterBlob = await captureTemplatePosterBlob();
        } catch {
          posterBlob = null;
        } finally {
          setGalleryComposeCapture(false);
        }
        setStatus('Publishing template to your cloud…');
        const { fileId } = await publishTemplateToOwnerCloud({
          bundle: b,
          templateLicensing,
          verified: verifiedAuthor,
          pnIdentifier: session.pnIdentifier,
          connectReady,
          posterBlob
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

  function toggleSocial() {
    const b = bundleRef.current || bundle;
    if (!b) return;
    const currentIsSocial =
      b.manifest.isSocial !== undefined
        ? Boolean(b.manifest.isSocial)
        : isSocialDoc;
    const nextIsSocial = !currentIsSocial;
    const nextManifest: PenDocManifest = {
      ...b.manifest,
      isSocial: nextIsSocial,
      updatedAt: new Date().toISOString()
    };
    persist({ ...b, manifest: nextManifest });
    setStatus(nextIsSocial ? 'Social publishing enabled' : 'Social publishing disabled');
    window.setTimeout(() => setStatus(null), 2500);
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
    if (
      !actorCan(
        bundle.manifest.roles,
        bundle.manifest.ownerPnHash || bundle.chain.genesis.authorPnHash,
        session.pnIdentifier,
        'submit_suggestion'
      )
    ) {
      setError('Your role cannot suggest changes on this document.');
      return;
    }
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
  // Ready keys must be hook-level bindings; shells must not use bare identifiers.
  // Enforced by controllerReadyState.gate.test.ts
  return penControllerReady({
    phase: 'ready',
    acceptSuggestion,
    activeLayerId,
    activeMediaLayer,
    activeSlug,
    activeSlugRef,
    activeWritingDoc,
    addComment,
    applyHistorySnapshot,
    applyingHistoryRef,
    bumpHistoryUi,
    bundle,
    bundleRef,
    canvasSection,
    captureLayers,
    classTrail,
    commentDraft,
    comments,
    commitWidgetSection,
    connectReady,
    copyDocJoinLink,
    createDocJoinLink,
    dirty,
    dirtyRef,
    docId,
    buildTestMedia,
    downloadFlattened,
    editor,
    editorPanePx,
    editorSplitEl,
    editorSplitWide,
    engagementGuide,
    ensureWidgetSpreadsheet,
    error,
    flushLedgerPush,
    flowsBody,
    galleryComposeCapture,
    historyEpoch,
    historyUi,
    hydrating,
    inputValues,
    introPlayKey,
    inviteCollaborator,
    invitePn,
    inviteRole,
    inviteSelectedConnections,
    isSocialActive,
    isSocialDoc,
    isStickerDoc,
    isWidgetDoc,
    joinLink,
    joinLinkLoading,
    lastDraftAt,
    ledgerRef,
    ledgerTimerRef,
    liveCollab,
    livePeers,
    liveReadOnly,
    liveStatus,
    navigate,
    onEditorReady,
    onStoryBlockHeights,
    pageExportRoot,
    pageLayout,
    persist,
    persistSection,
    persistWritingDoc,
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
    publishSocial,
    publishTemplate,
    pushWidgetSheet,
    redoEdit,
    rejectSuggestion,
    rememberPostFileId,
    removeMember,
    rootForSlug,
    saveDraft,
    savedTick,
    scheduleLedgerPush,
    screenAllPages,
    section,
    sectionNeedsSheet,
    sectionTitle,
    selectedConnectionPns,
    sendCorrespondence,
    session,
    setActiveLayerId,
    setActiveSlug,
    setCommentDraft,
    setEditorPanePx,
    setEditorSplitEl,
    setEngagementGuide,
    setInputValue,
    setInvitePn,
    setInviteRole,
    setPreviewPaneEl,
    setPreviewScroll,
    setPreviewToolbarHost,
    setPreviewZoom,
    setScreenAllPages,
    setSelectedConnectionPns,
    setShowComments,
    setShowHistory,
    setShowPreview,
    setSocialSelectedIds,
    setTimelineGroupId,
    setTimelinePlaying,
    shareConnections,
    shareConnectionsLoading,
    shareMembers,
    showComments,
    showHistory,
    showPreview,
    snapshotOf,
    socialActionLayer,
    socialLayersBtnRef,
    socialLayersOpen,
    setSocialLayersOpen,
    socialSelectedIds,
    status,
    suggestions,
    template,
    timelineGroupId,
    timelinePlaying,
    toggleSocial,
    undoEdit,
    verifiedAuthor,
    licensingMembership,
    waitTwoFrames,
    widgetEditorLayer,
    widgetSheetTimer,
    widgetStripLayer,
    widgetPreviewFrame,
    setWidgetPreviewFrame,
    writingEnabled,
    writingLabel,
  });
}
