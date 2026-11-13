/**
 * Share menu for a post: Copy link, Send to connections (DM), More options (system share sheet).
 * onShared fires only for a counted share: a DM sent or the system sheet completed.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, Code, Copy, Lock, Send, Share, X } from 'lucide-react';
import { pnShortLabel } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import type { IndexedFile } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { useToast } from '../hooks/useToast';
import { canOpenShareSheet, copyPostEmbedCode, sharePostLink } from '../utils/postLink';
import { embedPostRefusal } from '../utils/embedPost';
import { sendPostToConnections } from '../utils/sharePostDm';
import { getConnections, invalidateConnectionsCache, type Connection } from '../services/connectionService';
import { getUserProfile } from '../services/profileService';
import { isDmIdentityReady } from '../services/dmIdentitySession';
import { requestMessagingReconnect } from '../services/messagingReconnect';

const MENU_WIDTH = 320;
const MENU_Z = 190;

interface ShareMenuProps {
  file: IndexedFile;
  /** Share button bounds; desktop shows a popover beside it, otherwise a bottom sheet. */
  anchorRect?: DOMRect | null;
  onClose: () => void;
  onShared: () => void;
}

function isTouchLayout(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

function popoverStyle(anchor: DOMRect): React.CSSProperties {
  const margin = 12;
  const left =
    anchor.left - MENU_WIDTH - margin >= margin
      ? anchor.left - MENU_WIDTH - margin
      : Math.min(anchor.right + margin, window.innerWidth - MENU_WIDTH - margin);
  const maxHeight = Math.min(480, window.innerHeight - margin * 2);
  const top = Math.max(margin, Math.min(anchor.top + anchor.height / 2 - 120, window.innerHeight - maxHeight - margin));
  return { position: 'fixed', left, top, width: MENU_WIDTH, maxHeight, zIndex: MENU_Z };
}

const sheetStyle: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  maxHeight: '80vh',
  zIndex: MENU_Z,
};

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function ShareMenu({ file, anchorRect, onClose, onShared }: ShareMenuProps) {
  const { userState } = useUserState();
  const { success, error: showError } = useToast();
  const [view, setView] = useState<'main' | 'dm'>('main');
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);

  const fromPn = userState.isUnlocked ? userState.pnIdentifier ?? null : null;
  const showSheetOption = canOpenShareSheet();
  const canEmbed = embedPostRefusal(file.metadata as unknown as Record<string, unknown>) === null;
  const asPopover = !!anchorRect && !isTouchLayout();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (view !== 'dm' || !fromPn || connections) return;
    let cancelled = false;
    invalidateConnectionsCache(fromPn);
    getConnections(fromPn)
      .then(async (list) => {
        const accepted = list.filter((c) => c.status === 'accepted');
        if (cancelled) return;
        setConnections(accepted);
        const entries = await Promise.all(
          accepted.map(async (c) => {
            try {
              const profile = await getUserProfile(c.userPnIdentifier);
              return [c.userPnIdentifier, profile.displayName || pnShortLabel(c.userPnIdentifier)] as const;
            } catch {
              return [c.userPnIdentifier, pnShortLabel(c.userPnIdentifier)] as const;
            }
          })
        );
        if (!cancelled) setNames(new Map(entries));
      })
      .catch(() => {
        if (!cancelled) setConnections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [view, fromPn, connections]);

  const labelFor = (pn: string) => names.get(pn) || pnShortLabel(pn);

  const visibleConnections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!connections) return [];
    if (!q) return connections;
    return connections.filter(
      (c) =>
        c.userPnIdentifier.toLowerCase().includes(q) ||
        (names.get(c.userPnIdentifier) || '').toLowerCase().includes(q)
    );
  }, [connections, names, query]);

  const handleCopy = async () => {
    const result = await sharePostLink(file, 'copy');
    if (result === 'copied') {
      success('Link copied');
      onClose();
    } else {
      showError('Could not copy the link. Please try again.');
    }
  };

  const handleEmbed = async () => {
    if (await copyPostEmbedCode(file)) {
      success('Embed code copied');
      onClose();
    } else {
      showError('Could not copy the embed code. Please try again.');
    }
  };

  const handleSheet = async () => {
    const result = await sharePostLink(file, 'sheet');
    if (result === 'shared') {
      onShared();
      onClose();
    } else if (result === 'failed') {
      showError('Could not open sharing options.');
    }
  };

  const openDm = () => {
    if (!fromPn) return;
    if (!isDmIdentityReady()) requestMessagingReconnect();
    setView('dm');
  };

  const toggle = (pn: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pn)) next.delete(pn);
      else next.add(pn);
      return next;
    });
  };

  const handleSend = async () => {
    if (!fromPn || selected.size === 0 || sending) return;
    if (!isDmIdentityReady()) {
      setDmError('Messaging is locked. Lock and unlock your pN again, then retry.');
      requestMessagingReconnect();
      return;
    }
    setSending(true);
    setDmError(null);
    try {
      const { sent, failed } = await sendPostToConnections(fromPn, [...selected], file, note);
      if (sent.length > 0) {
        onShared();
        success(sent.length === 1 ? `Sent to ${labelFor(sent[0])}` : `Sent to ${sent.length} connections`);
      }
      if (failed.length > 0) {
        const who = failed.map((f) => labelFor(f.pn)).join(', ');
        showError(`Could not send to ${who}: ${failed[0].error}`, 6000);
      }
      if (failed.length === 0) {
        onClose();
      } else {
        setSelected(new Set(failed.map((f) => f.pn)));
        setDmError(failed[0].error);
      }
    } finally {
      setSending(false);
    }
  };

  const rowClass =
    'w-full flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:hover:bg-transparent';

  const mainView = (
    <div className="py-2">
      <button type="button" className={rowClass} onClick={handleCopy}>
        <Copy className="h-5 w-5 text-neutral-300" />
        <span className="text-sm">Copy link</span>
      </button>
      {canEmbed && (
        <button type="button" className={rowClass} onClick={handleEmbed}>
          <Code className="h-5 w-5 text-neutral-300" />
          <span className="text-sm">Copy embed code</span>
        </button>
      )}
      <button type="button" className={rowClass} onClick={openDm} disabled={!fromPn}>
        {fromPn ? <Send className="h-5 w-5 text-neutral-300" /> : <Lock className="h-5 w-5 text-neutral-400" />}
        <span className="text-sm">{fromPn ? 'Send to a connection' : 'Unlock your pN to send to connections'}</span>
      </button>
      {showSheetOption && (
        <button type="button" className={rowClass} onClick={handleSheet}>
          <Share className="h-5 w-5 text-neutral-300" />
          <span className="text-sm">More options…</span>
        </button>
      )}
    </div>
  );

  const dmView = (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="px-4 pt-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search connections"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2" style={{ maxHeight: 240 }}>
        {connections === null ? (
          <p className="py-6 text-center text-sm text-neutral-400">Loading connections…</p>
        ) : visibleConnections.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-400">
            {connections.length === 0 ? 'No connections yet.' : 'No matches.'}
          </p>
        ) : (
          <ul>
            {visibleConnections.map((c) => {
              const pn = c.userPnIdentifier;
              const checked = selected.has(pn);
              const label = labelFor(pn);
              return (
                <li key={pn}>
                  <button
                    type="button"
                    onClick={() => toggle(pn)}
                    className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-neutral-800"
                  >
                    <div className="h-9 w-9 flex-shrink-0 rounded-full bg-neutral-700 flex items-center justify-center text-sm font-medium text-white">
                      {label.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 truncate text-sm text-white" title={pn}>
                      {label}
                    </span>
                    <span
                      className={`h-5 w-5 flex-shrink-0 rounded-full border flex items-center justify-center ${
                        checked ? 'border-white bg-white' : 'border-neutral-500'
                      }`}
                    >
                      {checked && <Check className="h-3.5 w-3.5 text-black" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="border-t border-neutral-800 px-4 py-3 space-y-2">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a message (optional)"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
        />
        {dmError && <p className="text-xs text-red-400">{dmError}</p>}
        <button
          type="button"
          onClick={handleSend}
          disabled={selected.size === 0 || sending}
          className="w-full rounded-lg bg-white py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {sending ? 'Sending…' : selected.size > 1 ? `Send to ${selected.size}` : 'Send'}
        </button>
      </div>
    </div>
  );

  return createPortal(
    <div
      data-share-menu
      onClick={stop}
      onMouseDown={stop}
      onPointerDown={stop}
      onTouchStart={stop}
      onTouchEnd={stop}
    >
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: MENU_Z,
          backgroundColor: asPopover ? 'transparent' : 'rgba(0, 0, 0, 0.6)',
        }}
      />
      <div
        role="dialog"
        aria-label="Share post"
        className={`flex flex-col bg-neutral-900 border border-neutral-700 shadow-2xl ${
          asPopover ? 'rounded-xl' : 'rounded-t-2xl pb-[env(safe-area-inset-bottom)]'
        }`}
        style={asPopover && anchorRect ? popoverStyle(anchorRect) : sheetStyle}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-2">
            {view === 'dm' && (
              <button
                type="button"
                onClick={() => setView('main')}
                className="text-neutral-400 hover:text-white"
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <h3 className="text-base font-semibold text-white">
              {view === 'dm' ? 'Send to a connection' : 'Share'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {view === 'dm' ? dmView : mainView}
      </div>
    </div>,
    document.body
  );
}
