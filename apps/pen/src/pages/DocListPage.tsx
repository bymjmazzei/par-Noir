import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  emptySection,
  listStarterTemplates,
  requireTemplate,
  signGenesis,
  hashSectionContent,
  notaryHashForGenesis,
  attachNotary,
  type PenDocManifest,
  type PenHistoryChain
} from '@par-noir/pen-protocol';
import { generateGroupId, generateChatKey } from '@par-noir/dm-crypto';
import type { PenSession } from '../App';
import type { LocalDocSummary } from '../services/penLocalStore';
import { saveLocalDoc } from '../services/penLocalStore';
import { fetchTemplates, requestNotaryStamp } from '../services/penApi';
import { resolveSigningKeys } from '../services/penKeys';

function randomDocId(): string {
  return `pen_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  note: 'Notes',
  post: 'Posts',
  carousel: 'Carousels',
  self_hosted_feed: 'Feeds'
};

export function DocListPage({
  session,
  docs,
  onDocsChange
}: {
  session: PenSession;
  docs: LocalDocSummary[];
  onDocsChange: () => void;
}) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState(listStarterTemplates());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchTemplates(session.accessToken)
      .then((t) => {
        if (t?.length) setTemplates(t as ReturnType<typeof listStarterTemplates>);
      })
      .catch(() => {
        /* packaged starters */
      });
  }, [session.accessToken]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof templates>();
    for (const t of templates) {
      if (filter !== 'all' && t.docType !== filter) continue;
      const list = map.get(t.docType) || [];
      list.push(t);
      map.set(t.docType, list);
    }
    return map;
  }, [templates, filter]);

  async function createDoc(templateId: string) {
    setBusy(true);
    setError(null);
    try {
      const template = requireTemplate(templateId);
      const docId = randomDocId();
      const now = new Date().toISOString();
      const sections = template.sections.map((s) => emptySection(s.slug));
      const commitment = hashSectionContent(
        new TextEncoder().encode(JSON.stringify(sections))
      );

      const keys = resolveSigningKeys(session);

      let genesis = signGenesis({
        docId,
        templateId: template.id,
        authorPn: session.pnIdentifier,
        clientCreatedAt: now,
        contentCommitment: commitment,
        secretKey: keys.secretKey,
        publicKey: keys.publicKey
      });

      try {
        const notary = await requestNotaryStamp(
          session.accessToken,
          notaryHashForGenesis(genesis)
        );
        attachNotary(genesis, notary);
      } catch {
        /* optional offline */
      }

      const groupId = generateGroupId();
      const docKey = generateChatKey();
      sessionStorage.setItem(`pen_doc_key:${docId}`, docKey);
      sessionStorage.setItem(`pen_group_id:${docId}`, groupId);

      const manifest: PenDocManifest = {
        docId,
        title: `Untitled ${template.title}`,
        docType: template.docType,
        templateId: template.id,
        templateVersion: template.version,
        groupId,
        toc: template.sections.map((s) => s.slug),
        createdAt: now,
        updatedAt: now,
        genesisProof: genesis
      };

      const chain: PenHistoryChain = { docId, genesis, links: [] };
      saveLocalDoc(session.pnIdentifier, { manifest, sections, chain });
      onDocsChange();
      navigate(`/d/${docId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create_failed');
    } finally {
      setBusy(false);
    }
  }

  const filters = [
    { id: 'all', label: 'All templates' },
    { id: 'note', label: 'Notes' },
    { id: 'post', label: 'Posts' },
    { id: 'carousel', label: 'Carousels' },
    { id: 'self_hosted_feed', label: 'Feeds' }
  ];

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-6">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-mute">Recent</h2>
          {docs.length === 0 ? (
            <p className="mt-3 text-sm text-mute">No documents yet.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {docs.map((d) => (
                <li key={d.docId}>
                  <Link
                    to={`/d/${d.docId}`}
                    className="block rounded-md px-2 py-2 text-sm hover:bg-white"
                  >
                    <div className="truncate font-medium text-ink">{d.title}</div>
                    <div className="truncate text-xs text-mute">
                      {new Date(d.updatedAt).toLocaleDateString()}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
            New document
          </h1>
          <p className="mt-1 text-sm text-mute">
            Choose a starter template. Structure is fixed; writing flows like a page.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                filter === f.id
                  ? 'bg-ink text-white'
                  : 'bg-white text-stone-600 ring-1 ring-line hover:bg-stone-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="space-y-8">
          {[...grouped.entries()].map(([docType, list]) => (
            <section key={docType}>
              <h2 className="mb-3 text-sm font-semibold text-stone-700">
                {DOC_TYPE_LABEL[docType] || docType}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={busy}
                    onClick={() => createDoc(t.id)}
                    className="pen-paper group rounded-xl border border-line p-5 text-left transition hover:-translate-y-0.5 hover:border-stone-300 disabled:opacity-50"
                  >
                    <div className="font-display text-lg font-semibold text-ink group-hover:text-accent">
                      {t.title}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-mute">{t.description}</p>
                    <div className="mt-4 text-xs text-stone-400">
                      {t.sections.map((s) => s.title).join(' · ')}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
