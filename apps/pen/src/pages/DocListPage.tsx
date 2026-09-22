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

/** Quiet file-manager home — not a CMS dashboard. Templates open as a sheet. */
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
  const [pickerOpen, setPickerOpen] = useState(docs.length === 0);

  useEffect(() => {
    fetchTemplates(session.accessToken)
      .then((t) => {
        if (t?.length) setTemplates(t as ReturnType<typeof listStarterTemplates>);
      })
      .catch(() => undefined);
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
        /* optional */
      }

      const groupId = generateGroupId();
      sessionStorage.setItem(`pen_doc_key:${docId}`, generateChatKey());
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
      setPickerOpen(false);
      navigate(`/d/${docId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-2.5rem)] bg-stone-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Documents</h1>
            <p className="text-sm text-stone-500">Open a file or start from a template.</p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-800"
          >
            New…
          </button>
        </div>

        {docs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
            <p className="text-stone-600">No documents yet.</p>
            <button
              type="button"
              className="mt-4 text-sm text-sky-700 underline"
              onClick={() => setPickerOpen(true)}
            >
              Choose a template
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200 bg-white">
            {docs.map((d) => (
              <li key={d.docId}>
                <Link
                  to={`/d/${d.docId}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-stone-50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-stone-900">{d.title}</div>
                    <div className="truncate text-xs text-stone-500">{d.templateId}</div>
                  </div>
                  <div className="shrink-0 text-xs text-stone-400">
                    {new Date(d.updatedAt).toLocaleString()}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div
            className="absolute inset-0"
            onClick={() => docs.length > 0 && setPickerOpen(false)}
            aria-hidden
          />
          <div className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
              <h2 className="text-sm font-semibold text-stone-900">New from template</h2>
              {docs.length > 0 && (
                <button
                  type="button"
                  className="text-sm text-stone-500 hover:text-stone-800"
                  onClick={() => setPickerOpen(false)}
                >
                  Cancel
                </button>
              )}
            </div>
            {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}
            <ul className="divide-y divide-stone-100 p-2">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => createDoc(t.id)}
                    className="w-full rounded-lg px-3 py-3 text-left hover:bg-stone-50 disabled:opacity-50"
                  >
                    <div className="font-medium text-stone-900">{t.title}</div>
                    <div className="mt-0.5 text-xs text-stone-500">{t.description}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
