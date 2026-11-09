import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, Check, Copy, Link2, Loader2, Plus } from 'lucide-react';
import { ClaimPublicNameModal, FeedPicker, openYoutubeOAuthPopup } from './ClaimPublicNameModal';
import { copyToClipboard } from '../../utils/helpers';
import {
  acceptHandleTransfer,
  cancelHandleTransfer,
  clearVanityPublicName,
  fetchMyFeeds,
  fetchMyPublicNames,
  listPublicName,
  messagingAppOrigin,
  moveHandle,
  proofLevelLabel,
  renameHandle,
  sendHandle,
  setVanityPublicName,
  syncHandleReceiptsToDrive,
  unlistPublicName,
  type HandleNoticeDto,
  type MyPublicNames,
  type OwnFeedDto,
  type PublicNameDto,
  type ReproofChallengeDto,
} from '../../services/publicNamesApi';

interface PublicNamesSectionProps {
  accessToken: string | null;
  pnIdentifier: string | null;
}

type EditMode = 'rename' | 'move' | 'send';
const EMPTY: MyPublicNames = { names: [], notices: [], transfers: [] };
const SHOWN = new Set(['listed', 'proven', 'disputed']);

function noticeText(n: HandleNoticeDto): string | null {
  switch (n.kind) {
    case 'superseded':
      return n.fallback
        ? `${n.handle} went to a domain registered before your claim. You now have ${n.fallback}; rename it any time.`
        : `${n.handle} went to a domain registered before your claim. Claim a new handle.`;
    case 'disputed':
      return `${n.handle} is disputed. You keep it while the dispute is open.`;
    case 'expiring':
      return `${n.handle} expires on ${new Date(n.expiresAt).toLocaleDateString()} unless your feed posts publicly, you verify your identity, or you prove a domain or YouTube channel.`;
    case 'expired':
      return `${n.handle} expired after 90 days without public posts.`;
    default:
      return null;
  }
}

export const PublicNamesSection: React.FC<PublicNamesSectionProps> = ({
  accessToken,
  pnIdentifier,
}) => {
  const [data, setData] = useState<MyPublicNames>(EMPTY);
  const [feeds, setFeeds] = useState<OwnFeedDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [edit, setEdit] = useState<{ name: string; mode: EditMode; value: string } | null>(null);
  const [acceptFeed, setAcceptFeed] = useState('');
  const [challenge, setChallenge] = useState<{ transferId: string; challenge: ReproofChallengeDto } | null>(null);

  const reload = useCallback(async () => {
    if (!accessToken || !pnIdentifier) {
      setData(EMPTY);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [mine, own] = await Promise.all([
        fetchMyPublicNames(accessToken, pnIdentifier),
        fetchMyFeeds(accessToken, pnIdentifier).catch(() => [] as OwnFeedDto[]),
      ]);
      setData(mine);
      setFeeds(own);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load public names');
    } finally {
      setLoading(false);
    }
  }, [accessToken, pnIdentifier]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!acceptFeed && feeds[0]) setAcceptFeed(feeds[0].feedId);
  }, [feeds, acceptFeed]);

  if (!accessToken || !pnIdentifier) return null;

  /** Reload, then copy receipt chains to Drive in the background. */
  const changed = async () => {
    await reload();
    void syncHandleReceiptsToDrive(accessToken, pnIdentifier).catch(() => {
      /* retried after the next change */
    });
  };

  const run = async (key: string, fallback: string, fn: () => Promise<unknown>) => {
    setBusyName(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusyName(null);
    }
  };

  const shown = data.names.filter((n) => SHOWN.has(n.status));
  const hasAny = shown.length > 0;
  const messagingOrigin = messagingAppOrigin();
  const feedName = (id: string | null) => feeds.find((f) => f.feedId === id)?.feedName;
  const incoming = data.transfers.filter((t) => t.direction === 'incoming');
  const outgoing = data.transfers.filter((t) => t.direction === 'outgoing');
  const notices = data.notices.map(noticeText).filter((t): t is string => Boolean(t));

  const onCopyProfileUrl = async (url: string) => {
    if (await copyToClipboard(url)) {
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setError('Could not copy profile URL');
    }
  };

  const submitEdit = (n: PublicNameDto) => {
    if (!edit) return;
    const value = edit.value.trim();
    if (!value) return;
    const mode = edit.mode;
    void run(n.publicName, `Could not ${mode} ${n.publicName}`, async () => {
      if (mode === 'rename') await renameHandle(accessToken, pnIdentifier, n.publicName, value);
      if (mode === 'move') await moveHandle(accessToken, pnIdentifier, n.publicName, value);
      if (mode === 'send') {
        await sendHandle(accessToken, pnIdentifier, n.publicName, value);
        setNotice(`Transfer offered. ${n.publicName} moves when the recipient accepts.`);
      }
      setEdit(null);
    });
  };

  const accept = (transferId: string, googleAccessToken?: string) =>
    run(transferId, 'Could not accept the transfer', async () => {
      const out = await acceptHandleTransfer(accessToken, pnIdentifier, transferId, {
        feedId: acceptFeed || null,
        googleAccessToken: googleAccessToken || null,
      });
      if (out.status === 'reproof_required') {
        setChallenge({ transferId, challenge: out.challenge });
      } else {
        setChallenge(null);
        setNotice(`${out.name.publicName} is now yours.`);
      }
    });

  const acceptWithYoutube = async (transferId: string) => {
    try {
      await accept(transferId, await openYoutubeOAuthPopup());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'YouTube sign-in failed');
    }
  };

  return (
    <div className="bg-secondary rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h4 className="text-base font-semibold text-text-primary">Public names</h4>
          <p className="text-xs text-text-secondary mt-1">
            Unique handles on your feeds, for people search. Profile URL is optional and separate from listing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shrink-0"
        >
          <Plus className="w-4 h-4" />
          {hasAny ? 'Add handle or proof' : 'Claim a handle'}
        </button>
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-lg p-3">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 text-sm text-green-300 bg-green-950/30 border border-green-900 rounded-lg p-3">
          {notice}
        </div>
      )}
      {notices.length > 0 && (
        <ul className="mb-3 space-y-2">
          {notices.map((text) => (
            <li
              key={text}
              className="flex items-start gap-2 text-sm text-amber-200 bg-amber-950/30 border border-amber-900 rounded-lg p-3"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {text}
            </li>
          ))}
        </ul>
      )}

      {incoming.length > 0 && (
        <div className="mb-3 p-3 rounded-lg border border-blue-900 bg-blue-950/20 space-y-3">
          {incoming.map((t) => (
            <div key={t.id} className="space-y-2">
              <div className="text-sm text-text-primary">
                Someone is sending you <span className="font-medium">{t.publicName}</span>.
              </div>
              <FeedPicker feeds={feeds} value={acceptFeed} onChange={setAcceptFeed} />
              {challenge?.transferId === t.id && challenge.challenge.proofType === 'dns' && (
                <div className="text-xs text-text-secondary space-y-1">
                  <div>
                    This handle is proven by a domain. Add this token as a TXT record at{' '}
                    <code>{challenge.challenge.dnsName}</code> or as the body of{' '}
                    <code className="break-all">{challenge.challenge.wellKnownUrl}</code>, then accept again:
                  </div>
                  <code className="block p-2 rounded bg-bg-primary border border-border break-all select-all text-text-primary">
                    {challenge.challenge.token}
                  </code>
                </div>
              )}
              <div className="flex gap-2">
                {challenge?.transferId === t.id && challenge.challenge.proofType === 'youtube' ? (
                  <button
                    type="button"
                    disabled={busyName === t.id}
                    onClick={() => void acceptWithYoutube(t.id)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white disabled:opacity-50"
                  >
                    Sign in to the channel and accept
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyName === t.id}
                    onClick={() => void accept(t.id)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white disabled:opacity-50"
                  >
                    Accept
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyName === t.id}
                  onClick={() => void run(t.id, 'Could not decline', () => cancelHandleTransfer(accessToken, pnIdentifier, t.id))}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && !hasAny ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : !hasAny ? (
        <p className="text-sm text-text-secondary">
          No handles yet. Claim one, or prove a domain or YouTube @handle, to appear in people search.
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((n) => {
            const pendingOut = outgoing.find((t) => t.publicName === n.publicName);
            const busy = busyName === n.publicName;
            return (
              <li
                key={`${n.proofType}:${n.proofSubject}`}
                className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-bg-primary"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-text-primary">{n.publicName}</span>
                      {n.proofType !== 'claim' && (
                        <BadgeCheck className="w-4 h-4 text-blue-400" aria-label="Proven" />
                      )}
                      <span className="text-xs text-text-secondary uppercase tracking-wide">
                        {proofLevelLabel(n.proofType)}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-border text-text-secondary">{n.status}</span>
                      {feedName(n.feedId) && (
                        <span className="text-xs text-text-secondary">on {feedName(n.feedId)}</span>
                      )}
                      {n.isVanity && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 inline-flex items-center gap-1">
                          <Link2 className="w-3 h-3" />
                          profile URL
                        </span>
                      )}
                    </div>
                    {n.isVanity && (
                      <div className="flex items-center gap-1 mt-1">
                        <p className="text-xs text-text-secondary break-all">
                          {messagingOrigin}/{n.publicName}
                        </p>
                        <button
                          type="button"
                          onClick={() => void onCopyProfileUrl(`${messagingOrigin}/${n.publicName}`)}
                          className="p-1 rounded text-text-secondary hover:text-text-primary shrink-0"
                          title="Copy profile URL"
                          aria-label="Copy profile URL"
                        >
                          {copiedUrl ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                    {pendingOut && (
                      <div className="flex items-center gap-2 mt-1 text-xs text-text-secondary">
                        Transfer pending
                        <button
                          type="button"
                          disabled={busyName === pendingOut.id}
                          onClick={() =>
                            void run(pendingOut.id, 'Could not cancel the transfer', () =>
                              cancelHandleTransfer(accessToken, pnIdentifier, pendingOut.id)
                            )
                          }
                          className="underline disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {n.status === 'proven' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(n.publicName, 'Failed to list name', async () => {
                            const out = await listPublicName(accessToken, pnIdentifier, n.publicName);
                            if (out.disputed) setNotice(`${n.publicName} is held by someone else; a dispute is open.`);
                          })
                        }
                        className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white disabled:opacity-50"
                      >
                        Add to directory
                      </button>
                    )}
                    {n.status === 'listed' && (
                      <>
                        {!n.isVanity ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(n.publicName, 'Failed to set profile URL', () =>
                                setVanityPublicName(accessToken, pnIdentifier, n.publicName)
                              )
                            }
                            className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-primary disabled:opacity-50"
                          >
                            Use as profile URL
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyName === '__vanity__'}
                            onClick={() =>
                              void run('__vanity__', 'Failed to clear profile URL', () =>
                                clearVanityPublicName(accessToken, pnIdentifier)
                              )
                            }
                            className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary disabled:opacity-50"
                          >
                            Clear profile URL
                          </button>
                        )}
                        {n.proofType === 'claim' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setEdit({ name: n.publicName, mode: 'rename', value: '' })}
                            className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-primary disabled:opacity-50"
                          >
                            Rename
                          </button>
                        )}
                        {feeds.length > 1 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setEdit({
                                name: n.publicName,
                                mode: 'move',
                                value: feeds.find((f) => f.feedId !== n.feedId)?.feedId || '',
                              })
                            }
                            className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-primary disabled:opacity-50"
                          >
                            Move
                          </button>
                        )}
                        {!pendingOut && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setEdit({ name: n.publicName, mode: 'send', value: '' })}
                            className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-primary disabled:opacity-50"
                          >
                            Send
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(n.publicName, 'Failed to unlist name', () =>
                              unlistPublicName(accessToken, pnIdentifier, n.publicName)
                            )
                          }
                          className="px-3 py-1.5 text-xs rounded-lg border border-red-900 text-red-300 disabled:opacity-50"
                        >
                          {n.proofType === 'claim' ? 'Release' : 'Unlist'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {edit?.name === n.publicName && (
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    {edit.mode === 'move' ? (
                      <div className="flex-1">
                        <FeedPicker
                          feeds={feeds}
                          value={edit.value}
                          onChange={(value) => setEdit({ ...edit, value })}
                        />
                      </div>
                    ) : (
                      <label className="flex-1 block text-xs text-text-secondary">
                        {edit.mode === 'rename'
                          ? 'New handle (the old one is held for you for 30 days)'
                          : "Recipient's pN identifier"}
                        <input
                          type="text"
                          value={edit.value}
                          onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                          placeholder={edit.mode === 'rename' ? 'newname' : 'pn-…'}
                          autoFocus
                          className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-text-primary placeholder:text-text-secondary [color-scheme:dark]"
                        />
                      </label>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEdit(null)}
                        className="px-3 py-2 text-xs text-text-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy || !edit.value.trim()}
                        onClick={() => submitEdit(n)}
                        className="px-3 py-2 text-xs rounded-lg bg-blue-600 text-white disabled:opacity-50"
                      >
                        {edit.mode === 'rename' ? 'Rename' : edit.mode === 'move' ? 'Move' : 'Send'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ClaimPublicNameModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        accessToken={accessToken}
        pnIdentifier={pnIdentifier}
        feeds={feeds}
        onChanged={() => void changed()}
      />
    </div>
  );
};
