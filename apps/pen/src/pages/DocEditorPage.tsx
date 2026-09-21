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

  const section = useMemo(
    () => bundle?.sections.find((s) => s.slug === activeSlug) || bundle?.sections[0],
    [bundle, activeSlug]
  );

  if (!bundle || !section) {
    return (
      <div className="p-8">
        <p>Document not found.</p>
        <Link to="/">Back</Link>
      </div>
    );
  }

  function persist(next: NonNullable<typeof bundle>) {
    saveLocalDoc(session.pnIdentifier, next);
    setBundle({ ...next });
  }

  async function promote() {
    setError(null);
    setStatus('Promoting…');
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
        /* continue without notary if offline */
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
          ? `Promoted ${paths.pastName}. Fanout to ${peerRouteKeys.length} peer(s).`
          : `Promoted ${paths.pastName}. Chain verified.`
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
    setStatus(
      `Invited ${pn} (readWrite). Connect via messaging first, then they open this doc after replica sync.`
    );
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
      setStatus('Compiled Note ready for Pen Mini / browse publish (pen_publish_note).');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'compile_failed');
    }
  }

  const chainStatus = verifyChain(bundle.chain);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/" className="text-sm text-neutral-500 hover:text-white">
            ← Documents
          </Link>
          <input
            className="block mt-2 text-2xl font-semibold bg-transparent outline-none w-full"
            value={bundle.manifest.title}
            onChange={(e) =>
              persist({
                ...bundle,
                manifest: { ...bundle.manifest, title: e.target.value, updatedAt: new Date().toISOString() }
              })
            }
          />
          <p className="text-xs text-neutral-500 mt-1">
            {bundle.manifest.templateId} · group {bundle.manifest.groupId?.slice(0, 12)}…
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="text-sm px-3 py-1.5 rounded border border-white/15" onClick={() => setView('edit')}>
            Edit
          </button>
          <button type="button" className="text-sm px-3 py-1.5 rounded border border-white/15" onClick={() => setView('grid')}>
            Page grid
          </button>
          <button type="button" className="text-sm px-3 py-1.5 rounded border border-white/15" onClick={() => setView('history')}>
            History
          </button>
          <button type="button" className="text-sm px-3 py-1.5 rounded bg-white text-black" onClick={promote}>
            Promote
          </button>
          <button type="button" className="text-sm px-3 py-1.5 rounded border border-white/15" onClick={publishNote}>
            Publish Note
          </button>
        </div>
      </div>

      {status && <p className="text-sm text-emerald-400">{status}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2 items-center">
        <input
          className="flex-1 rounded border border-white/15 bg-black/30 px-3 py-2 text-sm"
          placeholder="Invite collaborator pn identifier"
          value={invitePn}
          onChange={(e) => setInvitePn(e.target.value)}
        />
        <button type="button" className="text-sm px-3 py-2 rounded border border-white/15" onClick={inviteCollaborator}>
          Invite readWrite
        </button>
      </div>

      {view === 'grid' && (
        <PageGrid toc={bundle.manifest.toc} active={activeSlug} onSelect={setActiveSlug} />
      )}

      {view === 'history' && (
        <div className="rounded-lg border border-white/10 p-4 space-y-3 text-sm">
          <p>
            Chain:{' '}
            <span className={chainStatus.ok ? 'text-emerald-400' : 'text-red-400'}>
              {chainStatus.ok ? 'verified' : `invalid (${'error' in chainStatus ? chainStatus.error : ''})`}
            </span>
          </p>
          <div>
            <div className="text-neutral-500">Genesis</div>
            <pre className="text-xs overflow-auto mt-1 opacity-80">
              {JSON.stringify(bundle.chain.genesis, null, 2)}
            </pre>
          </div>
          {bundle.chain.links.map((l, i) => (
            <div key={i}>
              <div className="text-neutral-500">
                Promote {i + 1}: {l.pastName}
                {l.notary ? ` · notary ${l.notary.notaryTime}` : ''}
              </div>
              <pre className="text-xs overflow-auto mt-1 opacity-80">{JSON.stringify(l, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}

      {view === 'edit' && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {bundle.manifest.toc.map((slug) => (
              <button
                key={slug}
                type="button"
                onClick={() => setActiveSlug(slug)}
                className={`text-sm px-3 py-1 rounded-full border ${
                  activeSlug === slug ? 'border-white' : 'border-white/20 text-neutral-400'
                }`}
              >
                {slug}
              </button>
            ))}
          </div>
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
        </>
      )}
    </div>
  );
}
