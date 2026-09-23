import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  hashPnIdentifier,
  hashSectionContent,
  headHashFromChain,
  isPageLayerId,
  mergePagePresentation,
  normalizeSection,
  notaryHashForPromote,
  PAGE_LAYER_ID,
  promoteSectionToPast,
  publishCurrentToPast,
  setTextLayerDoc,
  signPromoteLink,
  attachNotary,
  verifyChain,
  ensureOwnerAssignment,
  collectFontFamiliesFromDoc,
  isGooglePenFont,
  type PenDocComment,
  type PenPageLayout,
  type PenRole,
  type PenSuggestion
} from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { FormatRibbon, PageCanvas } from '../components/PageCanvas';
import { EditablePagePreview } from '../components/EditablePagePreview';
import { BrowseFeedTilePreview } from '../components/BrowseFeedTilePreview';
import { SectionTocMenu, type SectionTocItem } from '../components/SectionTocMenu';
import { PublishMenu, type PenAggregatorTarget } from '../components/PublishMenu';
import { SaveMenu } from '../components/SaveMenu';
import { ShareMenu } from '../components/ShareMenu';
import {
  IconComments,
  IconHistory,
  IconPreview,
  IconRedo,
  IconUndo
} from '../components/icons/PenIcons';
import { isVerifiedAuthor } from '../services/penVerified';
import { starTemplateToCloud } from '../services/penCloudTemplates';
import { loadLocalDoc, saveLocalDoc } from '../services/penLocalStore';
import {
  isProjectDoc,
  promoteProjectToFinishedLibraryDoc,
  saveProjectAsLibraryTemplate,
  writeSocialPublishHandoff
} from '../services/penPublish';
import { requestNotaryStamp } from '../services/penApi';
import { resolveSigningKeys } from '../services/penKeys';
import {
  actorCan,
  invitePenCollaborator,
  applyPenCommentInbound,
  applyPenPromoteInbound,
  applyPenSuggestionInbound,
  fetchGroupRoster,
  queuePenComment,
  queuePenSectionPromote,
  queuePenSuggestion
} from '../services/penCollab';
import { publishDocCloud, upsertDraftCloud } from '../services/penCloudStore';
import { enqueueSyncJob } from '../services/penSyncQueue';
import { ownerGet } from '../services/penOwnerFetch';
import {
  syncUsedCustomFontsOnManifest,
  ensureDocScopedFonts,
  loadDocScopedFontsForEditor
} from '../services/penDocFonts';
import { ensureGoogleFontsLoaded } from '../services/penGoogleFonts';
import {
  appendLocalComment,
  listLocalComments,
  listLocalSuggestions,
  makeComment,
  makeSuggestion,
  readPublishedFileId,
  upsertLocalSuggestion
} from '../services/penAnnotations';
import {
  ActivityLedger,
  type DocSnapshot
} from '../services/penActivityLedger';
import { encryptSectionJson, envelopeToWireB64, mintDocKey } from '../services/penDocCrypto';
import { openBrowseWithPenHandoff } from '../services/penBrowseHandoff';
import {
  bodyFromSections,
  openMessagingWithCorrespondence
} from '../services/penCorrespondenceHandoff';
import { hydrateDocFromCloud } from '../services/penHydrate';
import { isDocBootstrapPending } from '../services/penSyncQueue';
import { ensureOwnerDocGroup } from '../services/penCollab';
import { loadDocKey } from '../services/penDocCrypto';

async function peerRoutes(
  session: PenSession,
  groupId: string | undefined
): Promise<string[]> {
  if (!groupId) return [];
  try {
    const roster = await fetchGroupRoster({
      groupId,
      ownerPnIdentifier: session.pnIdentifier
    });
    return roster
      .filter((m) => m.memberPnIdentifier !== session.pnIdentifier && m.routeKey)
      .map((m) => m.routeKey!) as string[];
  } catch {
    return [];
  }
}

export function DocEditorPage({ session, docId }: { session: PenSession; docId: string }) {
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
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [invitePn, setInvitePn] = useState('');
  const [inviteRole, setInviteRole] = useState<PenRole>('collaborator');
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
  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(PAGE_LAYER_ID);
  const [comments, setComments] = useState<PenDocComment[]>(() =>
    listLocalComments(session.pnIdentifier, docId)
  );
  const [suggestions, setSuggestions] = useState<PenSuggestion[]>(() =>
    listLocalSuggestions(session.pnIdentifier, docId)
  );

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

  const section = useMemo(() => {
    const raw = bundle?.sections.find((s) => s.slug === activeSlug) || bundle?.sections[0];
    if (!raw) return undefined;
    return collapseLegacyPrimaryTextLayer(ensureDefaultTextLayer(normalizeSection(raw)));
  }, [bundle, activeSlug]);

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

  const canvasSection = useMemo(() => {
    if (!section) return undefined;
    if (!isPageLayerId(activeLayerId)) {
      const layer = section.layers?.find((l) => l.id === activeLayerId);
      if (layer?.kind === 'text' && layer.textDoc) {
        return { ...section, doc: layer.textDoc };
      }
    }
    // Page / Body: edit section.doc flow — no forced overlay object
    return section;
  }, [section, activeLayerId]);

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

  const onEditorReady = useCallback((ed: Editor | null) => setEditor(ed), []);

  const pageLayout: PenPageLayout = bundle?.manifest.pageLayout || 'flow';

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
      setBundle({ ...stamped });
      setDirty(true);
      scheduleLedgerPush(stamped);
      return;
    }
    saveLocalDoc(session.pnIdentifier, stamped);
    setBundle({ ...stamped });
    setDirty(false);
    setLastDraftAt(stamped.manifest.updatedAt);
    scheduleLedgerPush(stamped);
  }

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
    saveLocalDoc(session.pnIdentifier, next);
    setBundle({ ...next });
    setDirty(false);
    setLastDraftAt(now);

    const draftMeta = {
      draftId,
      docId,
      authorPnHash: hashPnIdentifier(session.pnIdentifier),
      createdAt: now,
      updatedAt: now,
      status: 'unfinished' as const,
      toc: next.manifest.toc
    };
    sessionStorage.setItem(`pen_draft_meta:${docId}:${draftId}`, JSON.stringify(draftMeta));

    void upsertDraftCloud({
      userPnIdentifier: session.pnIdentifier,
      manifest: next.manifest,
      draft: draftMeta,
      sections: next.sections
    }).catch((e) => {
      enqueueSyncJob(session.pnIdentifier, {
        kind: 'draft_upsert',
        docId,
        payload: { manifest: next.manifest, draft: draftMeta, sections: next.sections }
      });
      void e;
    });

    if (used.length && session.mlKemSecretKey) {
      void ensureDocScopedFonts({
        session,
        docId,
        groupId: next.manifest.groupId,
        used
      }).catch(() => {
        /* offline */
      });
    }

    if (!opts?.silent) {
      setStatus('Draft saved');
      window.setTimeout(() => setStatus(null), 1500);
    }
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

      const nextManifest = {
        ...bundle!.manifest,
        updatedAt: now.toISOString(),
        lifecycle: 'published' as const,
        ownerPnHash:
          bundle!.manifest.ownerPnHash || hashPnIdentifier(session.pnIdentifier),
        roles:
          bundle!.manifest.roles ||
          ensureOwnerAssignment([], hashPnIdentifier(session.pnIdentifier))
      };

      persist(
        {
          manifest: nextManifest,
          sections: bundle!.sections,
          chain: nextChain
        },
        { draft: false }
      );

      const ciphertextB64 = envelopeToWireB64(
        await encryptSectionJson(section!, mintDocKey(docId))
      );
      const payload = {
        docId,
        groupId: bundle!.manifest.groupId,
        sectionSlug: section!.slug,
        pastName: paths.pastName,
        currentRelPath: paths.currentPath,
        pastRelPath: paths.pastPath,
        sectionCiphertextB64: ciphertextB64,
        contentHash,
        link
      };

      const peerRouteKeys = await peerRoutes(session, bundle!.manifest.groupId);
      queuePenSectionPromote({
        session,
        outboxId: `pen_${crypto.randomUUID()}`,
        payload,
        peerRouteKeys
      });

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

      void pub;
      await applyPenPromoteInbound({
        userPnIdentifier: session.pnIdentifier,
        role: 'sender',
        ...payload
      }).catch(() => null);

      setStatus('Published live');
      window.setTimeout(() => setStatus(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'publish_failed');
      setStatus(null);
    }
  }

  async function inviteCollaborator() {
    const pn = invitePn.trim();
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

      await invitePenCollaborator({
        session,
        docId,
        groupId,
        title: bundle.manifest.title,
        peerPnIdentifier: pn,
        role: inviteRole,
        peerMlKemPublicKey: peerPk
      });
      const peerHash = hashPnIdentifier(pn);
      const roles = [
        ...(bundle.manifest.roles ||
          ensureOwnerAssignment([], hashPnIdentifier(session.pnIdentifier))),
        { pnHash: peerHash, role: inviteRole }
      ];
      persist({
        ...bundle,
        manifest: { ...bundle.manifest, roles, updatedAt: new Date().toISOString() }
      });
      setStatus('Invited');
      setInvitePn('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'invite_failed');
      setStatus(null);
    }
  }

  function publishSocial(targets: PenAggregatorTarget[] = ['browse']) {
    void (async () => {
      try {
        saveDraft({ silent: true });
        const b = bundleRef.current || bundle!;
        const payload = await writeSocialPublishHandoff(b, {
          pnIdentifier: session.pnIdentifier,
          aggregatorTargets: targets
        });
        openBrowseWithPenHandoff(payload);
        setStatus(
          targets.includes('pen-templates')
            ? 'Opened Browse — finish template share there'
            : 'Opened Browse — finish publish there'
        );
        window.setTimeout(() => setStatus(null), 4000);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'feed_connect_failed');
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

  if (hydrating) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-white">
        <p className="text-stone-600">Loading document…</p>
      </div>
    );
  }

  if (!bundle || !section || !canvasSection) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-stone-600">Document not found.</p>
          <Link to="/" className="mt-2 inline-block text-sm text-sky-700 underline">
            Back
          </Link>
        </div>
      </div>
    );
  }

  const chainStatus = verifyChain(bundle.chain);
  const tocSections: SectionTocItem[] = (
    template?.sections ||
    bundle.manifest.toc.map((slug) => ({ slug, title: slug, required: true as boolean | undefined }))
  ).map((s) => ({
    slug: s.slug,
    title: s.title || s.slug,
    required: s.required
  }));
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
          canSharePublic={isVerifiedAuthor(session)}
          onPublishLive={() => void publishLive()}
          onShareToAggregators={(targets) => publishSocial(targets)}
          onSendCorrespondence={sendCorrespondence}
          onTemplatePrivate={publishAsTemplate}
          onLibraryTemplate={publishAsLibraryTemplate}
          onFinishedWork={() => void publishFinishedWork()}
          licensing={
            bundle?.manifest.licensing ||
            defaultLicensingRoot(bundle?.manifest.ownerPnHash, {
              membership: isVerifiedAuthor(session)
            })
          }
          ownerPnHash={bundle?.manifest.ownerPnHash}
          membership={isVerifiedAuthor(session)}
          connectReady={isVerifiedAuthor(session)}
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

      <div className="flex min-h-0 flex-1">
        <div
          className={`relative flex min-w-0 flex-col ${
            (showPreview || sidePanel) && !showHistory ? 'w-1/2 border-r border-stone-400' : 'flex-1'
          }`}
        >
          {!showHistory && (
            <div className="flex shrink-0 flex-col border-b border-stone-300 bg-stone-50">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <SectionTocMenu
                  sections={tocSections}
                  activeSlug={activeSlug}
                  onSelect={setActiveSlug}
                />
                <div className="ml-auto flex items-center gap-1">
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
              <FormatRibbon
                editor={editor}
                accessToken={session.accessToken}
                pnIdentifier={session.pnIdentifier}
                excludeDocId={bundle.manifest.docId}
              />
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
          ) : (
            <PageCanvas
              key={`${activeSlug}:${activeLayerId || PAGE_LAYER_ID}:${session.pnIdentifier}:${historyEpoch}`}
              section={canvasSection}
              sectionTitle={writingLabel}
              pageLayout={pageLayout}
              pnIdentifier={session.pnIdentifier}
              onEditorReady={onEditorReady}
              onChange={(next) => {
                let updated: typeof section = { ...next, layers: section.layers };
                if (!isPageLayerId(activeLayerId)) {
                  const layerId = activeLayerId;
                  if (layerId) {
                    try {
                      updated = setTextLayerDoc(normalizeSection(section), layerId, next.doc, {
                        syncDoc: true
                      });
                    } catch {
                      updated = { ...next, layers: section.layers };
                    }
                  }
                }
                persist({
                  ...bundle,
                  sections: bundle.sections.map((s) =>
                    s.slug === updated.slug ? updated : s
                  ),
                  manifest: { ...bundle.manifest, updatedAt: new Date().toISOString() }
                });
              }}
            />
          )}
        </div>

        {showComments && !showHistory && (
          <div className="flex w-1/2 flex-col bg-white">
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
          <div className="hidden min-w-0 w-1/2 flex-col sm:flex">
            {isSocialDoc ? (
              <>
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
                </div>
                <div className="min-h-0 flex-1">
                  <BrowseFeedTilePreview manifest={bundle.manifest} sections={bundle.sections} />
                </div>
              </>
            ) : section ? (
              <div className="min-h-0 min-w-0 flex-1">
                <EditablePagePreview
                  manifest={bundle.manifest}
                  section={section}
                  activeLayerId={activeLayerId}
                  session={session}
                  onSelectLayer={(id) => {
                    setActiveLayerId(id || PAGE_LAYER_ID);
                  }}
                  onPageLayoutChange={(layout) => {
                    persist({
                      ...bundle,
                      manifest: {
                        ...bundle.manifest,
                        pageLayout: layout,
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
                  onSectionChange={(next) => {
                    persist({
                      ...bundle,
                      sections: bundle.sections.map((s) => (s.slug === next.slug ? next : s)),
                      manifest: { ...bundle.manifest, updatedAt: new Date().toISOString() }
                    });
                  }}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
