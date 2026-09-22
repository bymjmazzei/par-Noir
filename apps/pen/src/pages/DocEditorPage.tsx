import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import {
  compileDocumentToNote,
  getClass,
  getTemplate,
  hashSectionContent,
  headHashFromChain,
  notaryHashForPromote,
  promoteSectionToPast,
  signPromoteLink,
  attachNotary,
  verifyChain
} from '@par-noir/pen-protocol';
import type { PenSession } from '../App';
import { FormatRibbon, PageCanvas } from '../components/PageCanvas';
import { TemplateLivePreview } from '../components/TemplateLivePreview';
import { loadLocalDoc, saveLocalDoc } from '../services/penLocalStore';
import { requestNotaryStamp } from '../services/penApi';
import { resolveSigningKeys } from '../services/penKeys';
import {
  addPendingInvite,
  applyPenPromoteInbound,
  fetchGroupRoster,
  queuePenSectionPromote
} from '../services/penCollab';

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

export function DocEditorPage({ session, docId }: { session: PenSession; docId: string }) {
  const initial = loadLocalDoc(session.pnIdentifier, docId);
  const [bundle, setBundle] = useState(initial);
  const [activeSlug, setActiveSlug] = useState(initial?.manifest.toc[0] || 'body');
  const [showPreview, setShowPreview] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [invitePn, setInvitePn] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

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

      let peerRouteKeys: string[] = [];
      if (bundle!.manifest.groupId) {
        try {
          const roster = await fetchGroupRoster({
            accessToken: session.accessToken,
            groupId: bundle!.manifest.groupId,
            ownerPnIdentifier: session.pnIdentifier
          });
          peerRouteKeys = roster
            .filter((m) => m.memberPnIdentifier !== session.pnIdentifier && m.routeKey)
            .map((m) => m.routeKey!) as string[];
        } catch {
          peerRouteKeys = [];
        }
      }

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
        sections: bundle!.sections
      });
      sessionStorage.setItem(
        `pen_publish_note:${docId}`,
        JSON.stringify({
          contentClass: 'note',
          title: compiled.title,
          pages: compiled.pages,
          templateId: compiled.templateId,
          headProof: bundle!.chain.links[bundle!.chain.links.length - 1] || bundle!.chain.genesis
        })
      );
      setStatus('Note ready for Browse');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'compile_failed');
    }
  }

  const chainStatus = verifyChain(bundle.chain);
  const toc = template?.sections.map((s) => s.slug) || bundle.manifest.toc;

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
        <button
          type="button"
          className={`rounded px-2 py-0.5 ${showPreview ? 'bg-white shadow-sm' : 'hover:bg-stone-200'}`}
          onClick={() => setShowPreview((v) => !v)}
        >
          Preview
        </button>
        <button
          type="button"
          className={`rounded px-2 py-0.5 ${showHistory ? 'bg-white shadow-sm' : 'hover:bg-stone-200'}`}
          onClick={() => setShowHistory((v) => !v)}
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

      {/* Section tabs — Word-style inputs per template slot */}
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
        <div className={`relative flex min-w-0 flex-col ${showPreview && !showHistory ? 'w-1/2 border-r border-stone-400' : 'flex-1'}`}>
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
            </div>
          ) : (
            <PageCanvas
              key={activeSlug}
              section={section}
              sectionTitle={sectionTitle}
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

        {showPreview && !showHistory && (
          <div className="hidden min-w-0 w-1/2 sm:block">
            <TemplateLivePreview manifest={bundle.manifest} sections={bundle.sections} />
          </div>
        )}
      </div>
    </div>
  );
}
