import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    fetchTemplates(session.accessToken)
      .then((t) => {
        if (t?.length) setTemplates(t as any);
      })
      .catch(() => {
        /* use packaged starters */
      });
  }, [session.accessToken]);

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
        /* notary optional if API down during local create */
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

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <section>
        <h2 className="text-xl font-medium mb-3">Your documents</h2>
        {docs.length === 0 ? (
          <p className="text-neutral-500 text-sm">No documents yet. Create one from a template.</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.docId}>
                <Link
                  className="block rounded-lg border border-white/10 px-4 py-3 hover:bg-white/5"
                  to={`/d/${d.docId}`}
                >
                  <div className="font-medium">{d.title}</div>
                  <div className="text-xs text-neutral-500">
                    {d.templateId} · {new Date(d.updatedAt).toLocaleString()}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xl font-medium mb-3">New from template</h2>
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={() => createDoc(t.id)}
              className="text-left rounded-lg border border-white/10 px-4 py-3 hover:bg-white/5 disabled:opacity-50"
            >
              <div className="font-medium">{t.title}</div>
              <div className="text-xs text-neutral-500 mt-1">{t.description}</div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
