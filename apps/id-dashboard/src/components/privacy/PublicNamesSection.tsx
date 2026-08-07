import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Link2, Loader2, Plus } from 'lucide-react';
import { ClaimPublicNameModal } from './ClaimPublicNameModal';
import {
  browseAppOrigin,
  clearVanityPublicName,
  fetchMyPublicNames,
  listPublicName,
  setVanityPublicName,
  unlistPublicName,
  type PublicNameDto,
} from '../../services/publicNamesApi';

interface PublicNamesSectionProps {
  accessToken: string | null;
  pnIdentifier: string | null;
}

export const PublicNamesSection: React.FC<PublicNamesSectionProps> = ({
  accessToken,
  pnIdentifier,
}) => {
  const [names, setNames] = useState<PublicNameDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!accessToken || !pnIdentifier) {
      setNames([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchMyPublicNames(accessToken, pnIdentifier);
      setNames(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load public names');
    } finally {
      setLoading(false);
    }
  }, [accessToken, pnIdentifier]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!accessToken || !pnIdentifier) return null;

  const listedOrProven = names.filter((n) => n.status === 'listed' || n.status === 'proven');
  const hasAny = listedOrProven.length > 0;
  const browseOrigin = browseAppOrigin();

  const onList = async (name: string) => {
    setBusyName(name);
    setError(null);
    try {
      await listPublicName(accessToken, pnIdentifier, name);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to list name');
    } finally {
      setBusyName(null);
    }
  };

  const onUnlist = async (name: string) => {
    setBusyName(name);
    setError(null);
    try {
      await unlistPublicName(accessToken, pnIdentifier, name);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unlist name');
    } finally {
      setBusyName(null);
    }
  };

  const onVanity = async (name: string) => {
    setBusyName(name);
    setError(null);
    try {
      await setVanityPublicName(accessToken, pnIdentifier, name);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set profile URL');
    } finally {
      setBusyName(null);
    }
  };

  const onClearVanity = async () => {
    setBusyName('__vanity__');
    setError(null);
    try {
      await clearVanityPublicName(accessToken, pnIdentifier);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear profile URL');
    } finally {
      setBusyName(null);
    }
  };

  return (
    <div className="bg-secondary rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h4 className="text-base font-semibold text-text-primary">Public names</h4>
          <p className="text-xs text-text-secondary mt-1">
            Verified names for people search. Profile URL is optional and separate from listing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shrink-0"
        >
          <Plus className="w-4 h-4" />
          {hasAny ? 'Add proof' : 'Claim public name'}
        </button>
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-lg p-3">
          {error}
        </div>
      )}

      {loading && !hasAny ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : !hasAny ? (
        <p className="text-sm text-text-secondary">
          No public names yet. Claim one with DNS or a YouTube @handle to appear in people search.
        </p>
      ) : (
        <ul className="space-y-3">
          {listedOrProven.map((n) => (
            <li
              key={`${n.proofType}:${n.proofSubject}`}
              className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between p-3 rounded-lg border border-border bg-bg-primary"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-text-primary">{n.publicName}</span>
                  <BadgeCheck className="w-4 h-4 text-blue-400" aria-label="Verified" />
                  <span className="text-xs text-text-secondary uppercase tracking-wide">
                    {n.proofType}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-border text-text-secondary">
                    {n.status}
                  </span>
                  {n.isVanity && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 inline-flex items-center gap-1">
                      <Link2 className="w-3 h-3" />
                      profile URL
                    </span>
                  )}
                </div>
                {n.isVanity && (
                  <p className="text-xs text-text-secondary mt-1 break-all">
                    {browseOrigin}/{n.publicName}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {n.status === 'proven' && (
                  <button
                    type="button"
                    disabled={busyName === n.publicName}
                    onClick={() => void onList(n.publicName)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white disabled:opacity-50"
                  >
                    Add to directory
                  </button>
                )}
                {n.status === 'listed' && (
                  <>
                    {!n.isVanity && (
                      <button
                        type="button"
                        disabled={busyName === n.publicName}
                        onClick={() => void onVanity(n.publicName)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-primary disabled:opacity-50"
                      >
                        Use as profile URL
                      </button>
                    )}
                    {n.isVanity && (
                      <button
                        type="button"
                        disabled={busyName === '__vanity__'}
                        onClick={() => void onClearVanity()}
                        className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary disabled:opacity-50"
                      >
                        Clear profile URL
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyName === n.publicName}
                      onClick={() => void onUnlist(n.publicName)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-red-900 text-red-300 disabled:opacity-50"
                    >
                      Unlist
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ClaimPublicNameModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        accessToken={accessToken}
        pnIdentifier={pnIdentifier}
        onChanged={() => void reload()}
      />
    </div>
  );
};
