import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  compileDocumentToNote,
  hashSectionContent,
  headHashFromChain,
  notaryHashForPromote,
  promoteSectionToPast,
  signPromoteLink,
  attachNotary,
  verifyChain
} from '@par-noir/pen-protocol';
import type { PenSession } from '../App';
import { FlowEditor, PageGrid } from '../components/FlowEditor';
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
  const [view, setView] = useState<'edit' | 'grid' | 'history'>('edit');
  const [invitePn, setInvitePn] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);

  const section = useMemo(
    () => bundle?.sections.find((s) => s.slug === activeSlug) || bundle?.sections[0],
    [bundle, activeSlug]
  );

  if (!bundle || !section) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-mute">Document not found.</p>
        <Link to="/" className="mt-4 inline-block text-accent underline">
          Back to templates
        </Link>
      </div>
    );
  }

  function persist(next: NonNullable<typeof bundle>) {
    saveLocalDoc(session.pnIdentifier, next);
    setBundle({ ...next });
  }

  async function promote() {
    setError(null);
    setStatus('Saving version…');
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
        /* offline ok */
      }

      const nextChain = {
        ...bundle!.chain,
        links: [...bundle!.chain.links, link]
      };
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

      setStatus(
        peerRouteKeys.length
          ? `Version saved · syncing to ${peerRouteKeys.length} collaborator(s)`
          : 'Version saved'
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'promote_failed');
      setStatus(null);
    }
  }

  function inviteCollaborator() {
    const pn = invitePn.trim();
    if (!pn) return;
    addPendingInvite(docId, pn);
    if (bundle!.manifest.groupId) {
      sessionStorage.setItem(
        `pen_share:${docId}:${pn}`,
        JSON.stringify({
          docId,
          groupId: bundle!.manifest.groupId,
          accessRole: 'readWrite',
          invitedBy: session.pnIdentifier,
          docKeyHint: !!sessionStorage.getItem(`pen_doc_key:${docId}`)
        })
      );
    }
    setStatus(`Invited collaborator (readWrite)`);
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
      setStatus('Note compiled — open Browse Pen Mini to publish to the feed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'compile_failed');
    }
  }

  const chainStatus = verifyChain(bundle.chain);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-paper">
      <div className="sticky top-14 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2">
          <Link to="/" className="text-sm text-mute hover:text-ink">
            ← Templates
          </Link>
          <span className="text-line">|</span>
          <input
            className="min-w-[12rem] flex-1 bg-transparent font-display text-base font-semibold outline-none"
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
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                ['edit', 'Write'],
                ['grid', 'Pages'],
                ['history', 'History']
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`rounded-md px-2.5 py-1.5 text-sm ${
                  view === id ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
              onClick={promote}
            >
              Save version
            </button>
            <button
              type="button"
              className="rounded-md px-2.5 py-1.5 text-sm text-stone-600 ring-1 ring-line hover:bg-stone-50"
              onClick={() => setShowShare((v) => !v)}
            >
              Share
            </button>
            <button
              type="button"
              className="rounded-md px-2.5 py-1.5 text-sm text-stone-600 ring-1 ring-line hover:bg-stone-50"
              onClick={publishNote}
            >
              Publish Note
            </button>
          </div>
        </div>
      </div>

      {(status || error) && (
        <div className="mx-auto max-w-5xl px-4 pt-3">
          {status && <p className="text-sm text-teal-800">{status}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {showShare && (
        <div className="mx-auto max-w-5xl px-4 pt-3">
          <div className="flex gap-2 rounded-lg border border-line bg-white p-3">
            <input
              className="flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Collaborator pn identifier"
              value={invitePn}
              onChange={(e) => setInvitePn(e.target.value)}
            />
            <button
              type="button"
              className="rounded-md bg-ink px-3 py-2 text-sm text-white"
              onClick={inviteCollaborator}
            >
              Invite
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-5xl px-4 py-6">
        {view === 'grid' && (
          <div className="pen-paper rounded-xl border border-line p-6">
            <PageGrid toc={bundle.manifest.toc} active={activeSlug} onSelect={setActiveSlug} />
          </div>
        )}

        {view === 'history' && (
          <div className="pen-paper space-y-4 rounded-xl border border-line p-6 text-sm">
            <p>
              Authenticity:{' '}
              <span className={chainStatus.ok ? 'text-teal-700' : 'text-red-600'}>
                {chainStatus.ok
                  ? 'verified'
                  : `invalid (${'error' in chainStatus ? chainStatus.error : ''})`}
              </span>
            </p>
            <div>
              <div className="text-mute">Genesis</div>
              <pre className="mt-1 overflow-auto rounded bg-stone-50 p-3 text-xs text-stone-700">
                {JSON.stringify(bundle.chain.genesis, null, 2)}
              </pre>
            </div>
            {bundle.chain.links.map((l, i) => (
              <div key={i}>
                <div className="text-mute">
                  Version {i + 1}: {l.pastName}
                  {l.notary ? ` · notary ${l.notary.notaryTime}` : ''}
                </div>
                <pre className="mt-1 overflow-auto rounded bg-stone-50 p-3 text-xs text-stone-700">
                  {JSON.stringify(l, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}

        {view === 'edit' && (
          <div className="space-y-4">
            {bundle.manifest.toc.length > 1 && (
              <div className="flex gap-1 overflow-x-auto">
                {bundle.manifest.toc.map((slug) => (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => setActiveSlug(slug)}
                    className={`rounded-full px-3 py-1 text-sm capitalize ${
                      activeSlug === slug
                        ? 'bg-ink text-white'
                        : 'bg-white text-stone-600 ring-1 ring-line'
                    }`}
                  >
                    {slug}
                  </button>
                ))}
              </div>
            )}
            <div className="pen-paper min-h-[70vh] rounded-xl border border-line px-8 py-10 sm:px-14 sm:py-12">
              <FlowEditor
                section={section}
                onChange={(next) => {
                  persist({
                    ...bundle,
                    sections: bundle.sections.map((s) => (s.slug === next.slug ? next : s)),
                    manifest: { ...bundle.manifest, updatedAt: new Date().toISOString() }
                  });
                }}
              />
            </div>
            <p className="text-center text-xs text-mute">
              Template {bundle.manifest.templateId}
              {bundle.manifest.groupId
                ? ` · collab ${bundle.manifest.groupId.slice(0, 10)}…`
                : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
