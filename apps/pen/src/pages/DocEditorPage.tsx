import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import {
  compileDocumentToNote,
  defaultPagePresentation,
  getClass,
  getTemplate,
  hashSectionContent,
  headHashFromChain,
  notaryHashForPromote,
  promoteSectionToPast,
  signPromoteLink,
  attachNotary,
  verifyChain,
  type PenDocComment,
  type PenPageLayout,
  type PenSuggestion
} from '@par-noir/pen-protocol';
import type { PenSession } from '../App';
import { FormatRibbon, PageCanvas } from '../components/PageCanvas';
import { TemplateLivePreview } from '../components/TemplateLivePreview';
import { loadLocalDoc, saveLocalDoc } from '../services/penLocalStore';
import { requestNotaryStamp } from '../services/penApi';
import { resolveSigningKeys } from '../services/penKeys';
import {
  addPendingInvite,
  applyPenCommentInbound,
  applyPenPromoteInbound,
  applyPenSuggestionInbound,
  fetchGroupRoster,
  queuePenComment,
  queuePenSectionPromote,
  queuePenSuggestion
} from '../services/penCollab';
import {
  appendLocalComment,
  listLocalComments,
  listLocalSuggestions,
  makeComment,
  makeSuggestion,
  readPublishedFileId,
  upsertLocalSuggestion
} from '../services/penAnnotations';

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

async function peerRoutes(
  session: PenSession,
  groupId: string | undefined
): Promise<string[]> {
  if (!groupId) return [];
  try {
    const roster = await fetchGroupRoster({
      accessToken: session.accessToken,
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
  const [activeSlug, setActiveSlug] = useState(initial?.manifest.toc[0] || 'body');
  const [showPreview, setShowPreview] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [invitePn, setInvitePn] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
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

  const section = useMemo(
    () => bundle?.sections.find((s) => s.slug === activeSlug) || bundle?.sections[0],
    [bundle, activeSlug]
  );

  const sectionTitle = useMemo(() => {
    const fromTpl = template?.sections.find((s) => s.slug === activeSlug)?.title;
    return fromTpl || activeSlug;
  }, [template, activeSlug]);

  const onEditorReady = useCallback((ed: Editor | null) => setEditor(ed), []);

  const pageLayout: PenPageLayout = bundle?.manifest.pageLayout || 'flow';

  if (!bundle || !section) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-stone-200">
        <div className="text-center">
          <p className="text-stone-600">Document not found.</p>
          <Link to="/" className="mt-2 inline-block text-sm text-sky-700 underline">
            Back
          </Link>
        </div>
      </div>
    );
  }

  function persist(next: NonNullable<typeof bundle>) {
    saveLocalDoc(session.pnIdentifier, next);
    setBundle({ ...next });
  }

  async function promote() {
    setError(null);
    setStatus('Saving…');
    try {
      const keys = resolveSigningKeys(session);
      const now = new Date();
      const paths = promoteSectionToPast(docId, section!.slug, now);
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
        /* offline */
      }

      const nextChain = { ...bundle!.chain, links: [...bundle!.chain.links, link] };
      const verified = verifyChain(nextChain);
      if (!verified.ok) throw new Error(verified.error);

      persist({
        manifest: { ...bundle!.manifest, updatedAt: now.toISOString() },
        sections: bundle!.sections,
        chain: nextChain
      });

      const ciphertextB64 = bytesToB64(bytes);
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
        outboxId: `pen_${crypto.randomUUID()}`,
        payload,
        peerRouteKeys
      });

      await applyPenPromoteInbound({
        accessToken: session.accessToken,
        userPnIdentifier: session.pnIdentifier,
        role: 'sender',
        ...payload
      }).catch(() => null);

      setStatus('Saved');
      window.setTimeout(() => setStatus(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save_failed');
      setStatus(null);
    }
  }

  function inviteCollaborator() {
    const pn = invitePn.trim();
    if (!pn) return;
    addPendingInvite(docId, pn);
    setStatus('Invite queued');
    setInvitePn('');
  }

  function publishNote() {
    try {
      const compiled = compileDocumentToNote({
        templateId: bundle!.manifest.templateId,
        title: bundle!.manifest.title,
        sections: bundle!.sections,
        pagePresentation: bundle!.manifest.pagePresentation || defaultPagePresentation(),
        docId
      });
      sessionStorage.setItem(
        `pen_publish_note:${docId}`,
        JSON.stringify({
          contentClass: 'note',
          title: compiled.title,
          pages: compiled.pages,
          templateId: compiled.templateId,
          docId,
          headProof: bundle!.chain.links[bundle!.chain.links.length - 1] || bundle!.chain.genesis
        })
      );
      setStatus('Note ready for Browse');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'compile_failed');
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
    queuePenComment({ outboxId: `pen_c_${crypto.randomUUID()}`, payload, peerRouteKeys });
    await applyPenCommentInbound({
      accessToken: session.accessToken,
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
    queuePenSuggestion({ outboxId: `pen_s_${crypto.randomUUID()}`, payload, peerRouteKeys });
    await applyPenSuggestionInbound({
      accessToken: session.accessToken,
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
        sectionCiphertextB64: bytesToB64(bytes),
        contentHash,
        link
      };
      const peerRouteKeys = await peerRoutes(session, bundle.manifest.groupId);
      queuePenSuggestion({
        outboxId: `pen_s_${crypto.randomUUID()}`,
        payload: { docId, suggestion: accepted, acceptPromote },
        peerRouteKeys
      });
      await applyPenSuggestionInbound({
        accessToken: session.accessToken,
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

  const chainStatus = verifyChain(bundle.chain);
  const toc = template?.sections.map((s) => s.slug) || bundle.manifest.toc;
  const sectionComments = comments.filter((c) => c.sectionSlug === activeSlug && !c.resolved);
  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');

  const sidePanel = showComments || showSuggestions;

  return (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col bg-stone-300">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-stone-400 bg-stone-100 px-2 text-[13px]">
        <Link to="/" className="px-1 text-stone-600 hover:text-stone-900">
          ←
        </Link>
        <input
          className="min-w-0 flex-1 truncate bg-transparent font-medium text-stone-900 outline-none"
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
        <span className="hidden max-w-[40%] truncate text-[11px] text-stone-500 sm:inline">
          {classTrail}
        </span>
        <select
          className="h-7 rounded border border-stone-300 bg-white px-1 text-[11px]"
          value={pageLayout}
          title="Page layout"
          onChange={(e) =>
            persist({
              ...bundle,
              manifest: {
                ...bundle.manifest,
                pageLayout: e.target.value as PenPageLayout,
                updatedAt: new Date().toISOString()
              }
            })
          }
        >
          <option value="flow">Flow</option>
          <option value="letter">Letter</option>
          <option value="a4">A4</option>
        </select>
        <button
          type="button"
          className={`rounded px-2 py-0.5 ${showPreview ? 'bg-white shadow-sm' : 'hover:bg-stone-200'}`}
          onClick={() => setShowPreview((v) => !v)}
        >
          Preview
        </button>
        <button
          type="button"
          className={`rounded px-2 py-0.5 ${showComments ? 'bg-white shadow-sm' : 'hover:bg-stone-200'}`}
          onClick={() => {
            setShowComments((v) => !v);
            setShowSuggestions(false);
            setShowHistory(false);
          }}
        >
          Comments
        </button>
        <button
          type="button"
          className={`rounded px-2 py-0.5 ${showSuggestions ? 'bg-white shadow-sm' : 'hover:bg-stone-200'}`}
          onClick={() => {
            setShowSuggestions((v) => !v);
            setShowComments(false);
            setShowHistory(false);
          }}
        >
          Suggest
        </button>
        <button
          type="button"
          className={`rounded px-2 py-0.5 ${showHistory ? 'bg-white shadow-sm' : 'hover:bg-stone-200'}`}
          onClick={() => {
            setShowHistory((v) => !v);
            setShowComments(false);
            setShowSuggestions(false);
          }}
        >
          History
        </button>
        <button
          type="button"
          className="rounded bg-stone-800 px-2.5 py-0.5 text-white hover:bg-stone-700"
          onClick={promote}
        >
          Save
        </button>
        <button type="button" className="rounded px-2 py-0.5 hover:bg-stone-200" onClick={publishNote}>
          Note
        </button>
        {(status || error) && (
          <span className={`ml-1 text-[12px] ${error ? 'text-red-600' : 'text-teal-800'}`}>
            {error || status}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-stone-300 bg-stone-50 px-2 py-1">
        {toc.map((slug) => {
          const label = template?.sections.find((s) => s.slug === slug)?.title || slug;
          const active = slug === activeSlug;
          return (
            <button
              key={slug}
              type="button"
              onClick={() => setActiveSlug(slug)}
              className={`rounded px-2.5 py-1 text-[12px] ${
                active
                  ? 'bg-white font-medium text-stone-900 shadow-sm ring-1 ring-stone-300'
                  : 'text-stone-600 hover:bg-stone-200/70'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {!showHistory && <FormatRibbon editor={editor} />}

      <div className="flex min-h-0 flex-1">
        <div
          className={`relative flex min-w-0 flex-col ${
            (showPreview || sidePanel) && !showHistory ? 'w-1/2 border-r border-stone-400' : 'flex-1'
          }`}
        >
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
              <div className="mt-4 flex gap-2">
                <input
                  className="flex-1 rounded border border-stone-300 px-2 py-1 text-sm"
                  placeholder="Invite pn…"
                  value={invitePn}
                  onChange={(e) => setInvitePn(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded bg-stone-800 px-3 py-1 text-sm text-white"
                  onClick={inviteCollaborator}
                >
                  Invite
                </button>
              </div>
              {bundle.manifest.publishedFileId && (
                <p className="mt-4 text-xs text-stone-500">
                  Published fileId linked for social comments:{' '}
                  <code>{bundle.manifest.publishedFileId}</code>
                </p>
              )}
            </div>
          ) : (
            <PageCanvas
              key={activeSlug}
              section={section}
              sectionTitle={sectionTitle}
              pageLayout={pageLayout}
              onEditorReady={onEditorReady}
              onChange={(next) => {
                persist({
                  ...bundle,
                  sections: bundle.sections.map((s) => (s.slug === next.slug ? next : s)),
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

        {showSuggestions && !showHistory && (
          <div className="flex w-1/2 flex-col bg-white">
            <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Suggestions
              </span>
              <button
                type="button"
                className="rounded bg-teal-800 px-2 py-0.5 text-[12px] text-white"
                onClick={() => void proposeSuggestion()}
              >
                Propose current
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-auto p-3">
              {pendingSuggestions.length === 0 && (
                <p className="text-sm text-stone-400">
                  No pending suggestions. Propose the current section as a track-change.
                </p>
              )}
              {pendingSuggestions.map((s) => (
                <div key={s.id} className="rounded border border-amber-200 bg-amber-50 p-2 text-sm">
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
            </div>
          </div>
        )}

        {showPreview && !showHistory && !sidePanel && (
          <div className="hidden min-w-0 w-1/2 sm:block">
            <TemplateLivePreview manifest={bundle.manifest} sections={bundle.sections} />
          </div>
        )}
      </div>
    </div>
  );
}
