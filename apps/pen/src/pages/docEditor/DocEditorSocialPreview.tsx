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

import {
  mergePagePresentation,
  defaultPagePresentation,
  getTemplate,
  templateAuthorLabel,
  PAGE_LAYER_ID,
  buildActionStageHtml
} from '@par-noir/pen-protocol';
import { SocialFeedPhonePreview } from '../../components/SocialFeedPhonePreview';
import { LayersPopover } from '../../components/LayersPanel';
import { ActionLayerPhoneOverlay } from '../../components/ActionLayerPhoneOverlay';
import { ActionBindStrip } from '../../components/ActionBindStrip';
import { IconLayers } from '../../components/icons/PenIcons';
import type { DocEditorReadyState } from './useDocEditorController';

export function DocEditorSocialPreview(state: DocEditorReadyState) {
  const {
    bundle,
    section,
    session,
    persist,
    socialLayersBtnRef,
    socialLayersOpen,
    setSocialLayersOpen,
    socialActionLayer,
    commitWidgetSection,
    activeLayerId,
    onStageAction,
    votedOptionByGroup,
    voteOnPoll,
    runWidgetAction,
    inputValues,
    setInputValue,
    setActiveLayerId,
    socialSelectedIds,
    setSocialSelectedIds,
    setTimelineGroupId
  } = state;
  if (!bundle || !section) return null;
  return (
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="pen-social-pres-strip">
                  <label>
                    Bg
                    <input
                      type="color"
                      value={
                        mergePagePresentation(
                          defaultPagePresentation(),
                          bundle.manifest.pagePresentation
                        ).backgroundColor
                      }
                      onChange={(e) => {
                        const next = mergePagePresentation(
                          defaultPagePresentation(),
                          bundle.manifest.pagePresentation
                        );
                        persist({
                          ...bundle,
                          manifest: {
                            ...bundle.manifest,
                            pagePresentation: { ...next, backgroundColor: e.target.value },
                            updatedAt: new Date().toISOString()
                          }
                        });
                      }}
                    />
                  </label>
                  <label>
                    Text
                    <input
                      type="color"
                      value={
                        mergePagePresentation(
                          defaultPagePresentation(),
                          bundle.manifest.pagePresentation
                        ).textColor
                      }
                      onChange={(e) => {
                        const next = mergePagePresentation(
                          defaultPagePresentation(),
                          bundle.manifest.pagePresentation
                        );
                        persist({
                          ...bundle,
                          manifest: {
                            ...bundle.manifest,
                            pagePresentation: { ...next, textColor: e.target.value },
                            updatedAt: new Date().toISOString()
                          }
                        });
                      }}
                    />
                  </label>
                  <label>
                    Pad
                    <input
                      type="number"
                      min={8}
                      max={80}
                      className="w-14 border border-neutral-300 px-1"
                      value={
                        mergePagePresentation(
                          defaultPagePresentation(),
                          bundle.manifest.pagePresentation
                        ).padding
                      }
                      onChange={(e) => {
                        const next = mergePagePresentation(
                          defaultPagePresentation(),
                          bundle.manifest.pagePresentation
                        );
                        persist({
                          ...bundle,
                          manifest: {
                            ...bundle.manifest,
                            pagePresentation: {
                              ...next,
                              padding: Number(e.target.value) || 40
                            },
                            updatedAt: new Date().toISOString()
                          }
                        });
                      }}
                    />
                  </label>
                  <label>
                    Align
                    <select
                      className="border border-neutral-300 px-1"
                      value={
                        mergePagePresentation(
                          defaultPagePresentation(),
                          bundle.manifest.pagePresentation
                        ).textAlign
                      }
                      onChange={(e) => {
                        const next = mergePagePresentation(
                          defaultPagePresentation(),
                          bundle.manifest.pagePresentation
                        );
                        persist({
                          ...bundle,
                          manifest: {
                            ...bundle.manifest,
                            pagePresentation: {
                              ...next,
                              textAlign: e.target.value as typeof next.textAlign
                            },
                            updatedAt: new Date().toISOString()
                          }
                        });
                      }}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                      <option value="justify">Justify</option>
                    </select>
                  </label>
                  <button
                    ref={socialLayersBtnRef}
                    type="button"
                    className={`ml-auto inline-flex items-center gap-1 font-bold ${
                      socialLayersOpen ? 'text-black' : 'text-neutral-500 hover:text-black'
                    }`}
                    aria-expanded={socialLayersOpen}
                    aria-pressed={socialLayersOpen}
                    aria-label="Layers"
                    title="Layers"
                    onClick={() => setSocialLayersOpen((open) => !open)}
                  >
                    <IconLayers className="shrink-0" />
                    Layers
                  </button>
                </div>
                {socialActionLayer && section && (
                  <div className="border-b border-neutral-200 bg-neutral-50 px-2 py-1">
                    <ActionBindStrip
                      layer={socialActionLayer}
                      section={section}
                      session={session}
                      onSectionChange={commitWidgetSection}
                    />
                  </div>
                )}
                <div className="pen-social-live-preview min-h-0 flex-1">
                  <div className="pen-social-live-preview-stage">
                    <SocialFeedPhonePreview
                      large
                      manifest={bundle.manifest}
                      sections={bundle.sections}
                      session={session}
                      templateId={
                        bundle.manifest.templateId ||
                        bundle.manifest.basedOnTemplateId ||
                        bundle.manifest.docId
                      }
                      authorLabel={(() => {
                        const tid = bundle.manifest.templateId;
                        const t = tid ? getTemplate(tid) : undefined;
                        return t ? templateAuthorLabel(t) : 'You';
                      })()}
                      phoneActiveFeedId="public"
                      onAction={onStageAction}
                      actionOverlay={
                        buildActionStageHtml(bundle.sections) ? undefined : (
                        <ActionLayerPhoneOverlay
                          sections={bundle.sections}
                          galleryAspect={bundle.manifest.galleryAspect}
                          activeLayerId={activeLayerId}
                          session={session}
                          votedOptionByGroup={votedOptionByGroup}
                          onPollVote={(layer) => void voteOnPoll(layer)}
                          onWidgetAction={(layer) => void runWidgetAction(layer)}
                          inputValues={inputValues}
                          onInputValue={setInputValue}
                          onSectionChange={commitWidgetSection}
                          onSelectLayer={(id) => {
                            setActiveLayerId(id);
                            setSocialSelectedIds([id]);
                          }}
                        />
                        )
                      }
                    />
                  </div>
                </div>
                {section && (
                  <LayersPopover
                    open={socialLayersOpen}
                    onClose={() => setSocialLayersOpen(false)}
                    anchorRef={socialLayersBtnRef}
                    section={section}
                    activeLayerId={activeLayerId || PAGE_LAYER_ID}
                    onSelectLayer={(id) => setActiveLayerId(id || PAGE_LAYER_ID)}
                    onSectionChange={commitWidgetSection}
                    pageLayout={bundle.manifest.pageLayout}
                    selectedIds={socialSelectedIds}
                    onSelectedIdsChange={setSocialSelectedIds}
                    session={session}
                    docId={bundle.manifest.docId}
                    onEnterGroup={(id) => {
                      setTimelineGroupId(id);
                      setActiveLayerId(id);
                      setSocialSelectedIds([id]);
                    }}
                  />
                )}
              </div>
  );
}
