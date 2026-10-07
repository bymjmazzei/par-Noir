import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { PenSession } from '../services/penSession';
import { claimPenDocInvite, fetchPenDocInviteMetadata } from '../services/penDocInvite';
import { drainPenMailbox } from '../services/penCollab';

export function DocJoinPage({ session }: { session: PenSession | null }) {
  const { docId } = useParams();
  const [search] = useSearchParams();
  const inviteId = search.get('invite') || '';
  const navigate = useNavigate();
  const [meta, setMeta] = useState<{
    title: string;
    role: string;
    ownerPn: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!inviteId) {
      setError('missing_invite');
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const row = await fetchPenDocInviteMetadata(inviteId);
        if (docId && row.docId !== docId) {
          setError('invite_doc_mismatch');
          return;
        }
        setMeta({
          title: row.title || 'Document',
          role: row.role,
          ownerPn: row.ownerPn,
          expiresAt: row.expiresAt
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'invite_not_found');
      } finally {
        setLoading(false);
      }
    })();
  }, [inviteId, docId]);

  async function accept() {
    if (!session || !inviteId) return;
    setStatus('Accepting…');
    setError(null);
    try {
      const result = await claimPenDocInvite({ session, inviteId });
      if (!result.delivered) {
        setStatus(
          'Request sent. The doc owner must open Pen once to finish granting access.'
        );
      } else {
        setStatus('Access granted. Opening document…');
      }
      void drainPenMailbox(session);
      window.setTimeout(() => {
        navigate(`/d/${result.docId}`);
      }, result.delivered ? 800 : 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'claim_failed');
      setStatus(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-neutral-600">
        Loading invite…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4 text-sm text-neutral-700">Unlock your pN to accept this doc invite.</p>
        <Link className="text-sm font-bold text-black underline" to="/">
          Go to Pen home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-2 text-lg font-bold text-black">Join document</h1>
      {meta ? (
        <div className="mb-6 rounded-md border border-neutral-200 bg-white p-4 text-sm">
          <p className="font-semibold text-black">{meta.title}</p>
          <p className="mt-1 text-neutral-600">Role: {meta.role}</p>
          <p className="mt-1 truncate text-neutral-500">From {meta.ownerPn}</p>
        </div>
      ) : null}
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      {status && <p className="mb-4 text-sm text-neutral-700">{status}</p>}
      {meta && !error && (
        <button
          type="button"
          className="w-full rounded-md bg-black px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          onClick={() => void accept()}
        >
          Accept invite
        </button>
      )}
    </div>
  );
}
