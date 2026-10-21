import { useEffect, useState } from 'react';
import type { PenSession } from '../services/penSession';
import {
  acceptAgentDraft,
  discardAgentDraft,
  listAgentDrafts,
  type PenAgentDraft
} from '../services/penAgentDrafts';

/** Drafts the owner's AI agent proposed. Hidden when there are none. */
export function AgentDraftsInbox({
  session,
  onAccepted
}: {
  session: PenSession;
  onAccepted: (docId: string) => void;
}) {
  const [drafts, setDrafts] = useState<PenAgentDraft[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listAgentDrafts(session).then((next) => {
      if (!cancelled) setDrafts(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.pnIdentifier, session.mlKemSecretKey]);

  if (drafts.length === 0) return null;

  const act = async (draft: PenAgentDraft, action: 'accept' | 'discard') => {
    setBusyId(draft.jobId);
    setError(null);
    try {
      if (action === 'accept') {
        const bundle = await acceptAgentDraft(session, draft);
        setDrafts((prev) => prev.filter((d) => d.jobId !== draft.jobId));
        onAccepted(bundle.manifest.docId);
      } else {
        await discardAgentDraft(session, draft);
        setDrafts((prev) => prev.filter((d) => d.jobId !== draft.jobId));
      }
    } catch {
      setError(action === 'accept' ? 'Could not save this draft. Try again.' : 'Could not discard this draft. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="border-b border-stone-200 px-6 py-4" aria-label="AI drafts">
      <h2 className="text-sm font-bold text-black">AI drafts</h2>
      <p className="mt-0.5 text-xs text-neutral-600">
        Proposed by your AI agent. Nothing is saved until you accept.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ul className="mt-3 divide-y divide-stone-100 rounded-md border border-stone-200 bg-white">
        {drafts.map((draft) => (
          <li key={draft.jobId} className="flex items-start gap-3 px-3 py-3">
            <div className="min-w-0 flex-1">
              {draft.valid ? (
                <>
                  <div className="truncate font-medium text-black">{draft.preview.title}</div>
                  <div className="truncate text-xs text-neutral-600">{draft.preview.templateTitle}</div>
                  {draft.preview.excerpt && (
                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-neutral-700">
                      {draft.preview.excerpt}
                    </p>
                  )}
                </>
              ) : (
                <div className="text-sm text-neutral-600">This draft could not be opened.</div>
              )}
            </div>
            <div className="flex shrink-0 gap-3 text-sm">
              {draft.valid && (
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void act(draft, 'accept')}
                  className="font-bold text-black hover:opacity-60 disabled:opacity-30"
                >
                  Accept
                </button>
              )}
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void act(draft, 'discard')}
                className="text-neutral-600 hover:text-black disabled:opacity-30"
              >
                Discard
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
