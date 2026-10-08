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

import { Link } from 'react-router-dom';
import type { DocEditorReadyState } from './useDocEditorController';
import { DocEditorSocialPreview } from './DocEditorSocialPreview';

export function DocEditorShell(state: DocEditorReadyState) {
  const {
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
  } = state;
  const chainStatus = verifyChain(bundle.chain);
  const tocSections = (
    template?.sections ||
    bundle.manifest.toc.map((slug) => ({ slug, title: slug, required: true as boolean | undefined }))
  ).map((s) => ({
    slug: s.slug,
    title: s.title || s.slug,
    required: s.required
  }));
  const pageView = resolvePageView(bundle.manifest.pageView, bundle.manifest.pageLayout);
  const pageOrientation = orientationFromPageSize(
    bundle.manifest.flowWorkspaceWidthPx,
    bundle.manifest.flowWorkspaceHeightPx,
    bundle.manifest.pageOrientation
  );
  const previewPages = bundle.manifest.toc.map((slug, index) => {
    const fromTemplate = template?.sections.find((item) => item.slug === slug);
    return {
      slug,
      title:
        fromTemplate?.title && fromTemplate.title !== 'Body'
          ? fromTemplate.title
          : `Page ${index + 1}`,
      section: bundle.sections.find((item) => item.slug === slug)
    };
  });
  const pagePresentation = mergePagePresentation(
    defaultEditorPagePresentation(),
    bundle.manifest.pagePresentation
  );
  const previewGutter = previewPageUsesGutter(
    bundle.manifest.pageLayout,
    bundle.manifest.flowWorkspaceWidthPx
  )
    ? PREVIEW_PAGE_GUTTER_PX
    : 0;
  const artboard = pageAllowsPasteboard(
    bundle.manifest.pageLayout,
    bundle.manifest.flowWorkspaceWidthPx
  );
  const fitInset = previewGutter;
  const paneReady = previewPaneSize.width > 0 && previewPaneSize.height > 0;
  const slotW = paneReady ? Math.max(1, previewPaneSize.width - fitInset * 2) : 0;
  const slotH = paneReady ? Math.max(1, previewPaneSize.height - fitInset * 2) : 0;
  const fittedPage = paneReady
    ? fittedPreviewPagePx(bundle.manifest.pageLayout, slotW, slotH, {
        widthPx: bundle.manifest.flowWorkspaceWidthPx,
        heightPx: bundle.manifest.flowWorkspaceHeightPx,
        sizeId: bundle.manifest.pageSize
      })
    : null;
  const pageSizeKey = [
    bundle.manifest.pageLayout ?? '',
    bundle.manifest.pageSize ?? '',
    bundle.manifest.flowWorkspaceWidthPx ?? '',
    bundle.manifest.flowWorkspaceHeightPx ?? ''
  ].join('|');
  if (
    fittedPage &&
    fittedPage.width > 0 &&
    (previewLayoutRef.current == null || previewLayoutRef.current.key !== pageSizeKey)
  ) {
    previewLayoutRef.current = {
      key: pageSizeKey,
      width: fittedPage.width,
      height: fittedPage.height
    };
  }
  const heldPage = previewLayoutRef.current;
  const previewPageBox = heldPage ?? fittedPage ?? { width: 1, height: 1 };
  const screenPageCount = Math.max(1, previewPages.length);
  const screenFullWidth = screenStripWidthPx(screenPageCount, previewPageBox.width);
  const screenFullHeight = previewPageBox.height;
  const docFit =
    fittedPage && previewPageBox.width > 0 ? fittedPage.width / previewPageBox.width : 1;
  const screenFit = previewFitScale(screenFullWidth, screenFullHeight, slotW, slotH);
  const previewFit = pageView === 'screen' && screenAllPages ? screenFit : docFit;
  const layerPad = resolvePagePaddingPx(pagePresentation.padding);
  const activePageIndex = Math.max(
    0,
    previewPages.findIndex((page) => page.slug === activeSlug)
  );
  const previewStrip = previewStripLayout({
    pageView,
    pageCount: previewPages.length,
    pageW: previewPageBox.width,
    pageH: previewPageBox.height,
    activeIndex: activePageIndex,
    screenAllPages: pageView === 'screen' && screenAllPages,
    screenFit: 1
  });
  const extentPages = previewPages;
  const layerRects = artboard
    ? extentPages.flatMap((page) => {
        const index = previewPages.findIndex((item) => item.slug === page.slug);
        const origin = previewStrip.origin(Math.max(0, index));
        return (page.section?.layers || [])
          .filter((layer) => layer.kind !== 'guide')
          .map((layer) => ({
            x: origin.x + (layer.x + layerPad) * previewStrip.extentScale,
            y: origin.y + (layer.y + layerPad) * previewStrip.extentScale,
            w: layer.w * previewStrip.extentScale,
            h: layer.h * previewStrip.extentScale
          }));
      })
    : [];
  const previewWorkspace = previewWorkspaceLayout({
    docW: previewStrip.docW,
    docH: previewStrip.docH,
    focusX: previewStrip.focusX,
    focusY: previewStrip.focusY,
    edgeX: previewStrip.edgeX,
    edgeY: previewStrip.edgeY,
    extents: pasteboardExtents(layerRects, previewStrip.docW, previewStrip.docH),
    zoom: previewZoom,
    fit: previewFit,
    viewW: previewPaneSize.width,
    viewH: previewPaneSize.height
  });
  const previewRecenterKey = [
    previewZoom,
    activeSlug,
    pageView,
    screenAllPages,
    previewStrip.docW,
    previewStrip.docH,
    previewPaneSize.width,
    previewPaneSize.height
  ].join('|');
  const guideSpanFor = (
    originX: number,
    originY: number,
    pageW: number,
    pageH: number,
    docW: number,
    docH: number,
    spaceScale = 1
  ) =>
    workspaceGuideSpan({
      padLeft: previewWorkspace.padLeft,
      padRight: previewWorkspace.padRight,
      padTop: previewWorkspace.padTop,
      padBottom: previewWorkspace.padBottom,
      overLeft: previewWorkspace.overLeft,
      overRight: previewWorkspace.overRight,
      overTop: previewWorkspace.overTop,
      overBottom: previewWorkspace.overBottom,
      zoom: previewWorkspace.zoom,
      originX,
      originY,
      pageW,
      pageH,
      docW,
      docH,
      spaceScale
    });
  const workspaceGuides = previewPages.flatMap((page, index) => {
    const origin = previewStrip.origin(index);
    return (page.section?.layers || [])
      .filter((layer) => layer.kind === 'guide' && layer.visible !== false)
      .map((layer) => {
        const axis = layer.guideAxis === 'horizontal' ? 'horizontal' : 'vertical';
        const local = (axis === 'horizontal' ? layer.y : layer.x) + layerPad;
        const originAlong = axis === 'horizontal' ? origin.y : origin.x;
        const along = originAlong + local * previewStrip.extentScale;
        const lead =
          axis === 'horizontal'
            ? previewWorkspace.padTop + previewWorkspace.overTop
            : previewWorkspace.padLeft + previewWorkspace.overLeft;
        return {
          id: layer.id,
          axis,
          position: workspaceGuideFrame(along, lead, previewWorkspace.zoom),
          lead,
          originAlong,
          fit: previewStrip.extentScale || 1
        };
      });
  });
  const moveWorkspaceGuide = (id: string, framePosition: number) => {
    const guide = workspaceGuides.find((item) => item.id === id);
    if (!guide) return;
    const along = workspaceGuideAlong(framePosition, guide.lead, previewWorkspace.zoom);
    const local = (along - guide.originAlong) / guide.fit - layerPad;
    persist({
      ...bundle,
      sections: bundle.sections.map((section) => ({
        ...section,
        layers: (section.layers || []).map((layer) =>
          layer.id === id
            ? {
                ...layer,
                x: guide.axis === 'horizontal' ? layer.x : local,
                y: guide.axis === 'horizontal' ? local : layer.y
              }
            : layer
        )
      })),
      manifest: { ...bundle.manifest, updatedAt: new Date().toISOString() }
    });
  };
  const previewLeadingX = previewWorkspace.padLeft + previewWorkspace.overLeft;
  const previewLeadingY = previewWorkspace.padTop + previewWorkspace.overTop;
  const previewScrollSig = [
    previewRecenterKey,
    previewLeadingX,
    previewLeadingY,
    previewWorkspace.scrollLeft,
    previewWorkspace.scrollTop
  ].join('|');
  if (paneReady && previewScroll.sig !== previewScrollSig) {
    setPreviewScroll({
      sig: previewScrollSig,
      recenterKey: previewRecenterKey,
      scrollLeft: previewWorkspace.scrollLeft,
      scrollTop: previewWorkspace.scrollTop,
      leadingX: previewLeadingX,
      leadingY: previewLeadingY,
      prevLeadingX: previewScroll.leadingX,
      prevLeadingY: previewScroll.leadingY,
      recenter: previewScroll.recenterKey !== previewRecenterKey
    });
  }
  const screenStripBackground = pageFrameStyle(pagePresentation);
  if (
    (!screenStripBackground.backgroundColor ||
      screenStripBackground.backgroundColor === 'transparent') &&
    !screenStripBackground.backgroundImage
  ) {
    screenStripBackground.backgroundColor = '#ffffff';
  }

  const addPreviewPage = () => {
    const story = flowsBody
      ? storyForSlug(bundle.sections, bundle.manifest.toc, activeSlug)
      : undefined;
    const added = story
      ? appendStoryFrame(bundle.sections, bundle.manifest.toc, story.storyId)
      : appendDocPage(bundle.sections, bundle.manifest.toc);
    if (!added) return;
    persist({
      ...bundle,
      sections: added.sections,
      manifest: {
        ...bundle.manifest,
        toc: added.toc,
        pageView,
        pageSwipeAxis: bundle.manifest.pageSwipeAxis || pageSwipeAxisForView(pageView),
        updatedAt: new Date().toISOString()
      }
    });
    setActiveSlug(added.slug);
  };

  const addChapter = () => {
    const added = appendChapter(bundle.sections, bundle.manifest.toc);
    persist({
      ...bundle,
      sections: added.sections,
      manifest: {
        ...bundle.manifest,
        toc: added.toc,
        updatedAt: new Date().toISOString()
      }
    });
    setActiveSlug(added.slug);
    setActiveLayerId(PAGE_LAYER_ID);
  };

  const setPreviewPageView = (next: typeof pageView) => {
    if (bundle.manifest.pageViewLocked) return;
    persist({
      ...bundle,
      manifest: {
        ...bundle.manifest,
        pageView: next,
        pageSwipeAxis: pageSwipeAxisForView(next),
        updatedAt: new Date().toISOString()
      }
    });
  };

  const setPageOrientation = (next: typeof pageOrientation) => {
    if (bundle.manifest.pageViewLocked) return;
    const sized = orientPageSize(
      matchPageSize(
        bundle.manifest.pageLayout,
        bundle.manifest.flowWorkspaceWidthPx,
        bundle.manifest.flowWorkspaceHeightPx,
        bundle.manifest.pageSize
      ),
      next
    );
    persist({
      ...bundle,
      manifest: {
        ...bundle.manifest,
        pageOrientation: next,
        pageLayout: sized.layout,
        pageSize: sized.id,
        flowWorkspaceWidthPx: sized.widthPx,
        flowWorkspaceHeightPx: sized.heightPx,
        updatedAt: new Date().toISOString()
      }
    });
  };

  const deletePreviewPage = (slug: string) => {
    const removed = flowsBody
      ? removeStoryFrame(bundle.sections, bundle.manifest.toc, slug)
      : removeDocPage(bundle.sections, bundle.manifest.toc, slug);
    if (!removed) return;
    persist({
      ...bundle,
      sections: removed.sections,
      manifest: {
        ...bundle.manifest,
        toc: removed.toc,
        updatedAt: new Date().toISOString()
      }
    });
    if (slug === activeSlug || !removed.toc.includes(activeSlug)) {
      setActiveSlug(removed.slug);
      setActiveLayerId(PAGE_LAYER_ID);
    }
  };

  const reorderPreviewPages = (fromIndex: number, toIndex: number) => {
    const next = reorderDocPages(bundle.sections, bundle.manifest.toc, fromIndex, toIndex);
    persist({
      ...bundle,
      sections: next.sections,
      manifest: {
        ...bundle.manifest,
        toc: next.toc,
        updatedAt: new Date().toISOString()
      }
    });
  };

  const flipPreviewPage = (direction: -1 | 1) => {
    setActiveSlug(adjacentPageSlug(bundle.manifest.toc, activeSlug, direction));
  };

  const onEditorSplitDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const row = editorSplitEl;
    if (!row) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      const rect = row.getBoundingClientRect();
      setEditorPanePx(clampEditorPanePx(next.clientX - rect.left, rect.width));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const togglePageViewLock = () => {
    persist({
      ...bundle,
      manifest: {
        ...bundle.manifest,
        pageViewLocked: !bundle.manifest.pageViewLocked,
        updatedAt: new Date().toISOString()
      }
    });
  };

  const sectionComments = comments.filter((c) => c.sectionSlug === activeSlug && !c.resolved);
  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');

  const sidePanel = showComments;
  const projectEnabled = isProjectDoc(bundle.manifest);
  const correspondenceEnabled =
    bundle.manifest.classId === 'projects.letter' || bundle.manifest.classId === 'projects.note';
  const canCommit = actorCan(
    bundle.manifest.roles,
    bundle.manifest.ownerPnHash || bundle.chain.genesis.authorPnHash,
    session.pnIdentifier,
    'publish'
  );
  const canInvite = actorCan(
    bundle.manifest.roles,
    bundle.manifest.ownerPnHash || bundle.chain.genesis.authorPnHash,
    session.pnIdentifier,
    'invite'
  );
  const canAccept = actorCan(
    bundle.manifest.roles,
    bundle.manifest.ownerPnHash || bundle.chain.genesis.authorPnHash,
    session.pnIdentifier,
    'accept_suggestion'
  );
  void savedTick;
  void canAccept;

  return (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col bg-white">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-2 text-[13px]">
        <Link to="/" className="px-1 text-neutral-400 hover:text-black">
          ←
        </Link>
        <input
          className="min-w-0 flex-1 truncate bg-transparent font-bold text-black outline-none"
          value={bundle.manifest.title}
          onChange={(e) =>
            persist({
              ...bundle,
              manifest: {
                ...bundle.manifest,
                title: e.target.value,
                updatedAt: new Date().toISOString()
              }
            })
          }
        />
        <span className="hidden max-w-[40%] truncate text-[11px] text-neutral-400 sm:inline">
          {classTrail}
        </span>
        <button
          type="button"
          className={`inline-flex items-center px-2 py-0.5 ${showPreview ? 'text-black' : 'text-neutral-600 hover:text-black'}`}
          title="Preview"
          aria-label="Preview"
          aria-pressed={showPreview}
          onClick={() => setShowPreview((v) => !v)}
        >
          <IconPreview />
        </button>
        <button
          type="button"
          className={`inline-flex items-center px-2 py-0.5 ${showComments ? 'text-black' : 'text-neutral-600 hover:text-black'}`}
          title="Comments"
          aria-label="Comments"
          aria-pressed={showComments}
          onClick={() => {
            setShowComments((v) => !v);
            setShowHistory(false);
          }}
        >
          <IconComments />
        </button>
        <button
          type="button"
          className={`inline-flex items-center px-2 py-0.5 ${showHistory ? 'text-black' : 'text-neutral-600 hover:text-black'}`}
          title="History"
          aria-label="History"
          aria-pressed={showHistory}
          onClick={() => {
            setShowHistory((v) => !v);
            setShowComments(false);
          }}
        >
          <IconHistory />
        </button>
        <ShareMenu
          docId={docId}
          invitePn={invitePn}
          onInvitePnChange={setInvitePn}
          onInvite={() => {
            void inviteCollaborator();
          }}
          inviteRole={inviteRole}
          onInviteRoleChange={setInviteRole}
          canInvite={canInvite}
          connections={shareConnections}
          connectionsLoading={shareConnectionsLoading}
          selectedConnectionPns={selectedConnectionPns}
          onToggleConnection={(peerPn) => {
            setSelectedConnectionPns((prev) =>
              prev.includes(peerPn) ? prev.filter((p) => p !== peerPn) : [...prev, peerPn]
            );
          }}
          onInviteConnections={() => {
            void inviteSelectedConnections();
          }}
          joinLink={joinLink}
          joinLinkLoading={joinLinkLoading}
          onCreateJoinLink={() => {
            void createDocJoinLink();
          }}
          onCopyJoinLink={copyDocJoinLink}
        />
        <SaveMenu
          canCommit={canCommit}
          dirty={dirty}
          lastDraftAt={lastDraftAt}
          onSaveDraft={() => saveDraft()}
          onCommit={() => void promote()}
          onSuggest={() => void proposeSuggestion()}
        />
        <PublishMenu
          projectEnabled={projectEnabled}
          correspondenceEnabled={correspondenceEnabled}
          canPublishPublicTemplate={verifiedAuthor}
          hasPublishedPost={Boolean(bundle?.manifest.publishedFileId)}
          widgetTemplatesOnly={isWidgetDoc}
          pnIdentifier={session.pnIdentifier}
          onPublishLive={() => void publishLive()}
          onShareToAggregators={(feedIds) => publishSocial(feedIds)}
          feedEnabled={isSocialDoc}
          previewPn={invitePn}
          onPreviewPnChange={setInvitePn}
          onSendPreview={() => {
            void inviteCollaborator('viewer');
          }}
          onPublishTemplate={(licensing) => publishTemplate(licensing)}
          onSendCorrespondence={sendCorrespondence}
          onTemplatePrivate={publishAsTemplate}
          onLibraryTemplate={publishAsLibraryTemplate}
          onFinishedWork={() => void publishFinishedWork()}
          onDownload={() => void downloadFlattened()}
          licensing={
            bundle?.manifest.licensing ||
            defaultLicensingRoot(bundle?.manifest.ownerPnHash, {
              membership: verifiedAuthor
            })
          }
          ownerPnHash={bundle?.manifest.ownerPnHash}
          membership={verifiedAuthor}
          connectReady={connectReady}
          musicAsset={bundle?.manifest.classId === 'library.music'}
          onLicensingChange={(next) => {
            if (!bundle) return;
            persist({
              ...bundle,
              manifest: { ...bundle.manifest, licensing: next }
            });
          }}
        />
        {(status || error) && (
          <span className={`ml-1 text-[12px] ${error ? 'text-red-600' : 'text-teal-800'}`}>
            {error || status}
          </span>
        )}
      </div>

      <div ref={setEditorSplitEl} className="flex min-h-0 flex-1">
        <div
          className={`relative flex min-w-0 flex-col overflow-hidden ${
            (showPreview || sidePanel) && !showHistory && editorSplitWide
              ? editorPanePx
                ? 'shrink-0'
                : 'w-1/2 shrink-0'
              : 'flex-1'
          }`}
          style={
            (showPreview || sidePanel) && !showHistory && editorSplitWide && editorPanePx
              ? { width: editorPanePx }
              : undefined
          }
        >
          {!showHistory && (
            <div className="flex shrink-0 flex-col border-b border-stone-300 bg-stone-50">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <LayerPartsMenu
                  doc={activeWritingDoc}
                  editor={editor}
                  writingEnabled={writingEnabled}
                  onDocChange={persistWritingDoc}
                  documentSections={tocSections}
                  activeSlug={activeSlug}
                  onSelectDocumentSection={setActiveSlug}
                  allowAddPage={
                    !flowsBody &&
                    (bundle.manifest.classId === 'social.collection' ||
                      bundle.manifest.docType === 'collection' ||
                      template?.publishContentClass === 'collection' ||
                      getClass(bundle.manifest.classId)?.parentId === 'library')
                  }
                  onAddPage={addPreviewPage}
                  flowingStory={flowsBody && isPageLayerId(activeLayerId)}
                  chapters={listLayer0Stories(bundle.sections, bundle.manifest.toc)}
                  activeStoryId={
                    storyForSlug(bundle.sections, bundle.manifest.toc, activeSlug)?.storyId
                  }
                  onSelectChapter={(slug) => {
                    setActiveSlug(slug);
                    setActiveLayerId(PAGE_LAYER_ID);
                  }}
                  onAddChapter={flowsBody ? addChapter : undefined}
                  partFrameSlug={(index) => {
                    const story = storyForSlug(bundle.sections, bundle.manifest.toc, activeSlug);
                    if (!story) return undefined;
                    return frameSlugForBlock(
                      bundle.sections,
                      bundle.manifest.toc,
                      story.storyId,
                      index
                    );
                  }}
                  onSelectFrame={(slug) => {
                    setActiveSlug(slug);
                    setActiveLayerId(PAGE_LAYER_ID);
                  }}
                />
                <div className="ml-auto flex items-center gap-1">
                  {(getClass(bundle.manifest.classId)?.parentId === 'social' ||
                    bundle.manifest.galleryAspect) && (
                    <select
                      className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-[11px] text-neutral-700"
                      title="Aspect"
                      aria-label="Gallery aspect"
                      value={normalizeGalleryAspect(bundle.manifest.galleryAspect)}
                      onChange={(e) => {
                        const next = normalizeGalleryAspect(e.target.value);
                        const from = normalizeGalleryAspect(bundle.manifest.galleryAspect);
                        const remapped = remapSectionsForAspect(bundle.sections, from, next);
                        persist({
                          ...bundle,
                          sections: remapped,
                          manifest: {
                            ...bundle.manifest,
                            galleryAspect: next,
                            updatedAt: new Date().toISOString()
                          }
                        });
                      }}
                    >
                      <option value="9/16">9:16</option>
                      <option value="16/9">16:9</option>
                      <option value="1/1">1:1</option>
                    </select>
                  )}
                  {bundle.manifest.classId === 'social.audio' && (
                    <input
                      className="max-w-[7rem] truncate rounded border border-neutral-300 bg-white px-1 py-0.5 text-[11px] text-neutral-700"
                      placeholder="audio SoT id"
                      title="Published music/audio doc id (SoT)"
                      aria-label="Audio source of truth doc id"
                      value={bundle.manifest.audioSotDocId || ''}
                      onChange={(e) => {
                        persist({
                          ...bundle,
                          manifest: {
                            ...bundle.manifest,
                            audioSotDocId: e.target.value.trim() || null,
                            updatedAt: new Date().toISOString()
                          }
                        });
                      }}
                    />
                  )}
                  <button
                    type="button"
                    title="Undo"
                    aria-label="Undo"
                    disabled={!historyUi.canUndo}
                    onClick={undoEdit}
                    className="inline-flex items-center px-2 py-0.5 text-neutral-600 hover:text-black disabled:opacity-30"
                  >
                    <IconUndo />
                  </button>
                  <button
                    type="button"
                    title="Redo"
                    aria-label="Redo"
                    disabled={!historyUi.canRedo}
                    onClick={redoEdit}
                    className="inline-flex items-center px-2 py-0.5 text-neutral-600 hover:text-black disabled:opacity-30"
                  >
                    <IconRedo />
                  </button>
                </div>
              </div>
              {writingEnabled && !activeMediaLayer && !isWidgetDoc && !widgetEditorLayer ? (
                <FormatRibbon
                  editor={editor}
                  accessToken={session.accessToken}
                  pnIdentifier={session.pnIdentifier}
                  excludeDocId={bundle.manifest.docId}
                />
              ) : null}
            </div>
          )}

          {showHistory ? (
            <div className="h-full overflow-auto bg-white p-6 text-sm">
              <p className="mb-4">
                Chain:{' '}
                <span className={chainStatus.ok ? 'text-teal-700' : 'text-red-600'}>
                  {chainStatus.ok
                    ? 'verified'
                    : `invalid (${'error' in chainStatus ? chainStatus.error : ''})`}
                </span>
              </p>
              <pre className="overflow-auto rounded bg-stone-50 p-3 text-xs">
                {JSON.stringify(bundle.chain, null, 2)}
              </pre>
              {pendingSuggestions.length > 0 && (
                <div className="mt-4 space-y-2">
                <button
                  type="button"
                  className="rounded border border-stone-300 bg-white px-2 py-1 text-[12px] text-stone-700"
                  onClick={() => void proposeSuggestion()}
                >
                  Propose current section
                </button>
                {pendingSuggestions.length > 0 && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                      Pending suggestions
                    </p>
                    {pendingSuggestions.map((s) => (
                      <div
                        key={s.id}
                        className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"
                      >
                        <div className="text-[10px] text-stone-500">
                          {s.sectionSlug} · {s.summary || 'Update'}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            className="rounded bg-teal-800 px-2 py-0.5 text-[12px] text-white"
                            onClick={() => void acceptSuggestion(s)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="rounded px-2 py-0.5 text-[12px] text-stone-600 hover:bg-stone-200"
                            onClick={() => rejectSuggestion(s)}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
              )}
              {bundle.manifest.publishedFileId && (
                <p className="mt-4 text-xs text-stone-500">
                  Published fileId linked for social comments:{' '}
                  <code>{bundle.manifest.publishedFileId}</code>
                </p>
              )}
            </div>
          ) : activeMediaLayer && section ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <MediaEditorPanel
                key={activeMediaLayer.id}
                layer={activeMediaLayer}
                section={section}
                session={session}
                docId={bundle.manifest.docId}
                playheadSec={playheadSec}
                playing={timelinePlaying}
                onPlayhead={setPlayheadSec}
                onPlaying={setTimelinePlaying}
                onSelectLayer={(id) => setActiveLayerId(id)}
                scopeGroupId={timelineGroupId}
                onEnterGroup={(id) => {
                  setTimelineGroupId(id);
                  if (id) setActiveLayerId(id);
                }}
                onSectionChange={(next) => {
                  persist({
                    ...bundle,
                    sections: bundle.sections.map((s) => (s.slug === next.slug ? next : s)),
                    manifest: { ...bundle.manifest, updatedAt: new Date().toISOString() }
                  });
                }}
              />
            </div>
          ) : section && (isWidgetDoc || widgetEditorLayer) ? (
            <WidgetEditorPanel
              key={widgetStripLayer?.id || 'widget'}
              layer={widgetStripLayer}
              section={section}
              accessToken={session.accessToken}
              pnIdentifier={session.pnIdentifier}
              excludeDocId={bundle.manifest.docId}
              docId={bundle.manifest.docId}
              session={session}
              pageLayout={pageLayout}
              playheadSec={playheadSec}
              playing={timelinePlaying}
              onPlayhead={setPlayheadSec}
              onPlaying={setTimelinePlaying}
              onSelectLayer={(id) => {
                setActiveLayerId(id);
                setSocialSelectedIds([id]);
              }}
              scopeGroupId={timelineGroupId}
              onEnterGroup={(id) => {
                setTimelineGroupId(id);
                if (id) {
                  setActiveLayerId(id);
                  setSocialSelectedIds([id]);
                }
              }}
              onSectionChange={commitWidgetSection}
              onPlaced={(id) => {
                setActiveLayerId(id);
                setSocialSelectedIds([id]);
              }}
              hideTriggers={isStickerDoc}
            />
          ) : writingEnabled && canvasSection && section ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <PageCanvas
                key={
                  flowsBody && isPageLayerId(activeLayerId)
                    ? `story:${section.storyId || activeSlug}:${session.pnIdentifier}:${historyEpoch}`
                    : `${activeSlug}:${activeLayerId || PAGE_LAYER_ID}:${session.pnIdentifier}:${historyEpoch}`
                }
                section={canvasSection}
                sectionTitle={writingLabel}
                pageLayout={pageLayout}
                flowWorkspaceWidthPx={bundle.manifest.flowWorkspaceWidthPx}
                flowWorkspaceHeightPx={bundle.manifest.flowWorkspaceHeightPx}
                pageSize={bundle.manifest.pageSize}
                pnIdentifier={session.pnIdentifier}
                flowing={flowsBody && isPageLayerId(activeLayerId)}
                focusBlockIndex={section.storyRange?.startBlock ?? 0}
                focusBlockKey={
                  flowsBody && isPageLayerId(activeLayerId) ? activeSlug : undefined
                }
                frameStartBlocks={
                  flowsBody
                    ? (storyForSlug(bundle.sections, bundle.manifest.toc, activeSlug)?.slugs || []).map(
                        (slug) =>
                          bundle.sections.find((item) => item.slug === slug)?.storyRange
                            ?.startBlock ?? 0
                      )
                    : undefined
                }
                onBlockHeights={onStoryBlockHeights}
                onEditorReady={onEditorReady}
                onChange={(next) => {
                  persistWritingDoc(next.doc);
                }}
              />
              <SectionTimeline
                section={section}
                activeLayerId={activeLayerId}
                playheadSec={playheadSec}
                playing={timelinePlaying}
                docId={bundle.manifest.docId}
                session={session}
                scopeGroupId={timelineGroupId}
                onPlayhead={setPlayheadSec}
                onPlaying={setTimelinePlaying}
                onSelectLayer={(id) => {
                  setActiveLayerId(id);
                  setSocialSelectedIds([id]);
                }}
                onEnterGroup={(id) => {
                  setTimelineGroupId(id);
                  if (id) {
                    setActiveLayerId(id);
                    setSocialSelectedIds([id]);
                  }
                }}
                onSectionChange={(next) => {
                  persist({
                    ...bundle,
                    sections: bundle.sections.map((item) => (item.slug === next.slug ? next : item)),
                    manifest: { ...bundle.manifest, updatedAt: new Date().toISOString() }
                  });
                }}
              />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center bg-[#f3f3f3] px-6 text-center">
              <p className="text-sm text-stone-500">
                Select Body or a text layer to write.
              </p>
            </div>
          )}
        </div>

        {(showPreview || sidePanel) && !showHistory && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panels"
            className="hidden w-1.5 shrink-0 cursor-col-resize bg-stone-300 hover:bg-sky-500 sm:block"
            onPointerDown={onEditorSplitDown}
          />
        )}

        {showComments && !showHistory && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
            <div className="border-b border-stone-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Comments · {activeSlug}
            </div>
            <div className="flex-1 space-y-2 overflow-auto p-3">
              {sectionComments.length === 0 && (
                <p className="text-sm text-stone-400">No comments on this section.</p>
              )}
              {sectionComments.map((c) => (
                <div key={c.id} className="rounded border border-stone-200 bg-stone-50 p-2 text-sm">
                  <div className="text-[10px] text-stone-400">
                    {c.authorPnHash.slice(0, 8)} · {new Date(c.createdAt).toLocaleString()}
                    {c.from != null ? ` · @${c.from}` : ''}
                  </div>
                  <div className="mt-1 text-stone-800">{c.body}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-stone-200 p-2">
              <input
                className="flex-1 rounded border border-stone-300 px-2 py-1 text-sm"
                placeholder="Add comment (uses selection)…"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addComment();
                }}
              />
              <button
                type="button"
                className="rounded bg-stone-800 px-3 py-1 text-sm text-white"
                onClick={() => void addComment()}
              >
                Post
              </button>
            </div>
          </div>
        )}

        {showPreview && !showHistory && !sidePanel && (
          <div className="hidden min-h-0 min-w-0 flex-1 flex-col sm:flex">
            {isSocialDoc ? (
            <DocEditorSocialPreview {...state} />
            ) : section ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div
                  ref={setPreviewToolbarHost}
                  className="relative z-30 shrink-0 overflow-visible bg-white"
                />
                <div className="relative min-h-0 min-w-0 flex-1">
                <div
                  ref={setPreviewPaneEl}
                  className="absolute inset-0 bg-neutral-100"
                  style={{
                    overflowX:
                      previewWorkspace.contentW > previewPaneSize.width + 1 ? 'auto' : 'hidden',
                    overflowY:
                      previewWorkspace.contentH > previewPaneSize.height + 1 ? 'auto' : 'hidden'
                  }}
                >
                <div
                  data-preview-zoom-frame
                  className="relative shrink-0 overflow-hidden"
                  style={{
                    boxSizing: 'border-box',
                    width: previewWorkspace.contentW,
                    height: previewWorkspace.contentH,
                    paddingLeft: previewWorkspace.padLeft + previewWorkspace.overLeft,
                    paddingRight: previewWorkspace.padRight + previewWorkspace.overRight,
                    paddingTop: previewWorkspace.padTop + previewWorkspace.overTop,
                    paddingBottom: previewWorkspace.padBottom + previewWorkspace.overBottom
                  }}
                >
                <div
                  data-preview-zoom-stage
                  className="shrink-0"
                  style={{ width: previewWorkspace.docW, height: previewWorkspace.docH }}
                >
                <div
                  className="shrink-0"
                  style={{
                    width: previewStrip.docW,
                    height: previewStrip.docH,
                    transform: `scale(${previewWorkspace.zoom})`,
                    transformOrigin: 'top left'
                  }}
                >
                <div
                  data-preview-center={pageLayout === 'flow' ? undefined : ''}
                  className={
                    pageLayout === 'flow' ? 'contents' : 'm-auto h-max w-max'
                  }
                >
                <div
                  className={pageView === 'screen' ? 'relative shrink-0 overflow-visible' : 'contents'}
                  style={
                    pageView === 'screen'
                      ? {
                          width: screenFullWidth,
                          height: screenFullHeight,
                          margin: 0
                        }
                      : undefined
                  }
                >
                <div
                  className={pageView === 'screen' ? 'relative' : 'contents'}
                  style={
                    pageView === 'screen'
                      ? {
                          width: screenFullWidth,
                          height: screenFullHeight
                        }
                      : undefined
                  }
                >
                <PreviewPageStrip
                  pageView={pageView}
                  pageCount={previewPages.length}
                  pageWidthPx={previewPageBox.width}
                  pageHeightPx={previewPageBox.height}
                  background={pageView === 'screen' ? screenStripBackground : undefined}
                  pageBreak={
                    bundle.manifest.pageLayout === 'flow' &&
                    isFlowWorkspaceOpen(bundle.manifest.flowWorkspaceWidthPx) &&
                    pageView === 'vertical'
                  }
                >
                  {previewPages.map((page, index) => {
                    const storedSection = page.section;
                    if (!storedSection) return null;
                    const pageSection =
                      flowsBody && storedSection.storyId
                        ? {
                            ...storedSection,
                            doc: layer0DocForSection(
                              bundle.sections,
                              bundle.manifest.toc,
                              storedSection
                            )
                          }
                        : storedSection;
                    const active = page.slug === activeSlug;
                    const pageOrigin = previewStrip.origin(index);
                    const pageGuideSpan = guideSpanFor(
                      pageOrigin.x,
                      pageOrigin.y,
                      previewPageBox.width,
                      previewPageBox.height,
                      previewStrip.docW,
                      previewStrip.docH
                    );
                    const pageManifest =
                      pageView === 'screen'
                        ? {
                            ...bundle.manifest,
                            pagePresentation: {
                              ...pagePresentation,
                              backgroundColor: 'transparent',
                              backgroundGradient: undefined,
                              backgroundImage: undefined,
                              backgroundVideo: undefined
                            }
                          }
                        : bundle.manifest;
                    return (
                      <div
                        key={page.slug}
                        data-preview-page={page.slug}
                        className="relative shrink-0 grow-0 self-center overflow-visible"
                        style={{
                          width: previewPageBox.width,
                          height: previewPageBox.height
                        }}
                        onClick={() => {
                          if (!active) setActiveSlug(page.slug);
                        }}
                      >
                        <div className={active ? 'h-full' : 'pointer-events-none h-full'}>
                          <EditablePagePreview
                            manifest={pageManifest}
                            section={pageSection}
                            activeLayerId={active ? activeLayerId : PAGE_LAYER_ID}
                            hideActionBind={isWidgetDoc || Boolean(widgetEditorLayer)}
                            hideObjectTools={isWidgetDoc}
                            showToolbar={active}
                            toolbarHost={active ? previewToolbarHost : null}
                            scrollWithParent
                            clearChrome={pageView === 'screen'}
                            showAbsoluteLayers={pageView !== 'screen' || captureLayers}
                            pageView={pageView}
                            pageOrientation={pageOrientation}
                            viewLocked={bundle.manifest.pageViewLocked === true}
                            engagementGuide={engagementGuide}
                            paintEngagementGuide={engagementGuideOnPage(
                              engagementGuide,
                              pageView,
                              index,
                              previewPages.length
                            )}
                            onPageOrientation={setPageOrientation}
                            onPageView={setPreviewPageView}
                            onToggleViewLock={togglePageViewLock}
                            onToggleEngagementGuide={() => setEngagementGuide((on) => !on)}
                            buttonCaptionById={buttonCaptionById}
                            session={session}
                            onEnterGroup={(id) => {
                              setTimelineGroupId(id);
                              setActiveSlug(page.slug);
                              setActiveLayerId(id);
                              setSocialSelectedIds([id]);
                            }}
                            onSelectLayer={(id) => {
                              setActiveSlug(page.slug);
                              setActiveLayerId(id || PAGE_LAYER_ID);
                            }}
                            onPageSizeChange={(size) => {
                              persist({
                                ...bundle,
                                manifest: {
                                  ...bundle.manifest,
                                  pageLayout: size.layout,
                                  pageSize: size.id,
                                  flowWorkspaceWidthPx: size.widthPx,
                                  flowWorkspaceHeightPx: size.heightPx,
                                  pageView: resolvePageView(bundle.manifest.pageView, size.layout),
                                  updatedAt: new Date().toISOString()
                                }
                              });
                            }}
                            onSnapChange={(enabled) => {
                              persist({
                                ...bundle,
                                manifest: {
                                  ...bundle.manifest,
                                  snapToPageGuides: enabled,
                                  updatedAt: new Date().toISOString()
                                }
                              });
                            }}
                            onPresentationChange={(partial) => {
                              const next = mergePagePresentation(
                                defaultEditorPagePresentation(),
                                {
                                  ...(bundle.manifest.pagePresentation || {}),
                                  ...partial
                                }
                              );
                              persist({
                                ...bundle,
                                manifest: {
                                  ...bundle.manifest,
                                  pagePresentation: next,
                                  updatedAt: new Date().toISOString()
                                }
                              });
                            }}
                            onPollVote={(layer) => void voteOnPoll(layer)}
                            onWidgetAction={(layer) => void runWidgetAction(layer)}
                            inputValues={inputValues}
                            onInputValue={setInputValue}
                            votedOptionByGroup={votedOptionByGroup}
                            playheadSec={playheadSec}
                            guideSpan={pageGuideSpan}
                            onSectionChange={(next) => {
                              if (sectionHasVoteButton(next)) {
                                commitWidgetSection(next);
                                return;
                              }
                              const stored = bundle.sections.find((item) => item.slug === next.slug);
                              const saved =
                                flowsBody && stored?.storyId
                                  ? {
                                      ...next,
                                      doc: stored.doc,
                                      storyId: stored.storyId,
                                      storyRange: stored.storyRange
                                    }
                                  : next;
                              persist({
                                ...bundle,
                                sections: bundle.sections.map((s) =>
                                  s.slug === saved.slug ? saved : s
                                ),
                                manifest: { ...bundle.manifest, updatedAt: new Date().toISOString() }
                              });
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </PreviewPageStrip>
                {pageView === 'screen' && (
                  <ScreenLayerStage
                    sections={bundle.sections}
                    pageWidth={previewPageBox.width}
                    pageHeight={previewPageBox.height}
                    pad={layerPad}
                    presentation={pagePresentation}
                    activeLayerId={activeLayerId}
                    session={session}
                    docId={bundle.manifest.docId}
                    buttonCaptionById={buttonCaptionById}
                    votedOptionByGroup={votedOptionByGroup}
                    inputValues={inputValues}
                    onInputValue={setInputValue}
                    onSelectLayer={(id) => {
                      if (id) {
                        const owner = bundle.sections.find((section) =>
                          section.layers?.some((layer) => layer.id === id)
                        );
                        if (owner) setActiveSlug(owner.slug);
                      }
                      setActiveLayerId(id || PAGE_LAYER_ID);
                    }}
                    onSectionsChange={(next) =>
                      persist({
                        ...bundle,
                        sections: next,
                        manifest: { ...bundle.manifest, updatedAt: new Date().toISOString() }
                      })
                    }
                    onPollVote={(layer) => void voteOnPoll(layer)}
                    onWidgetAction={(layer) => void runWidgetAction(layer)}
                    snapToPageCenter={Boolean(bundle.manifest.snapToPageGuides)}
                    playheadSec={playheadSec}
                    freePlacement={artboard}
                    drawGuides={false}
                    guideSpan={guideSpanFor(
                      0,
                      0,
                      screenFullWidth,
                      screenFullHeight,
                      previewStrip.docW,
                      previewStrip.docH
                    )}
                  />
                )}
                </div>
                </div>
                </div>
                </div>
                </div>
                <PageGuides
                  guides={workspaceGuides}
                  onMove={moveWorkspaceGuide}
                />
                </div>
                </div>
                <PreviewZoomControl zoom={previewZoom} onZoom={setPreviewZoom} />
                </div>
              </div>
            ) : null}
            <PreviewPageBar
              pages={previewPages}
              activeSlug={activeSlug}
              pageView={pageView}
              presentation={pagePresentation}
              screenAllPages={screenAllPages}
              onToggleScreenPages={() => setScreenAllPages((on) => !on)}
              onSelect={setActiveSlug}
              onAddPage={addPreviewPage}
              onDeletePage={deletePreviewPage}
              onReorder={reorderPreviewPages}
              onFlip={flipPreviewPage}
            />
          </div>
        )}

        {galleryComposeCapture && section && bundle ? (
          <div
            aria-hidden
            className="pointer-events-none fixed left-[-12000px] top-0 z-[-1] h-[720px] w-[405px] overflow-hidden opacity-0"
          >
            <EditablePagePreview
              manifest={bundle.manifest}
              section={
                flowsBody && section.storyId
                  ? {
                      ...section,
                      doc: layer0DocForSection(bundle.sections, bundle.manifest.toc, section)
                    }
                  : section
              }
              activeLayerId={PAGE_LAYER_ID}
              session={session}
              onSelectLayer={() => undefined}
              onSectionChange={() => undefined}
              playheadSec={playheadSec}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
