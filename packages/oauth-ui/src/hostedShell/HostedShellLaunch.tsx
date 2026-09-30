import React, { useEffect, useState } from 'react';
import { tryPreferUnlockApp } from '../unlockPreferApp';
import {
  buildShellLaunchUrl,
  buildShellWebUrl,
  parseShellReturn,
  SHELL_OWNER_STORAGE_KEY,
  SHELL_RETURN_STORAGE_KEY,
  shellHandoffDisposition,
  type HostedShellSession,
  type ShellOp,
} from './session';

export type HostedShellLaunchProps = {
  op?: ShellOp;
  returnTo?: string;
  clientId?: string;
  apiEndpoint?: string;
  label?: string;
  className?: string;
  vaultPayload?: string;
  /** Button only. The caller prints the explanation once for several actions. */
  buttonOnly?: boolean;
  onSession: (session: HostedShellSession) => void;
};

/**
 * Hosted pages do not collect Key 1 or Key 2. This opens the unlock binary
 * and applies the factor-free fragment it returns.
 */
export function HostedShellLaunch(props: HostedShellLaunchProps): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [handedOff, setHandedOff] = useState(false);
  const returnTo =
    props.returnTo ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}${window.location.search}`
      : 'https://pn.parnoir.com/');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isOwner = () => {
      try {
        return sessionStorage.getItem(SHELL_OWNER_STORAGE_KEY) === '1';
      } catch {
        return false;
      }
    };
    let applied = false;
    const applyFragment = (fragment: string) => {
      if (applied) return;
      const session = parseShellReturn(fragment);
      if (!session) return;
      if (props.op && session.op !== props.op && session.op !== 'session') return;
      applied = true;
      props.onSession(session);
      window.dispatchEvent(new CustomEvent('pn-hosted-shell-session', { detail: session }));
      try {
        localStorage.removeItem(SHELL_RETURN_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      const clean = window.location.pathname + window.location.search;
      window.history.replaceState({}, '', clean);
    };
    const accept = (fragment: string, source: 'hash' | 'storage') => {
      const disposition = shellHandoffDisposition({ fragment, isOwnerTab: isOwner() });
      if (disposition === 'apply') {
        try {
          applyFragment(fragment);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Unlock handoff failed');
        }
        return;
      }
      if (disposition === 'forward' && source === 'hash') {
        try {
          localStorage.setItem(SHELL_RETURN_STORAGE_KEY, fragment);
        } catch {
          /* ignore */
        }
        setHandedOff(true);
        window.close();
      }
    };
    accept(window.location.hash, 'hash');
    if (isOwner()) {
      try {
        const pending = localStorage.getItem(SHELL_RETURN_STORAGE_KEY);
        if (pending) accept(pending, 'storage');
      } catch {
        /* ignore */
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === SHELL_RETURN_STORAGE_KEY && event.newValue) accept(event.newValue, 'storage');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // Apply once per mount; onSession is the caller's handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openUnlock = () => {
    setError(null);
    try {
      sessionStorage.setItem(SHELL_OWNER_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    const launch = {
      returnTo,
      op: props.op || 'session',
      clientId: props.clientId,
      apiEndpoint: props.apiEndpoint,
      vaultPayload: props.vaultPayload,
    };
    void (async () => {
      const choice = await tryPreferUnlockApp(buildShellLaunchUrl(launch));
      if (choice.opened) return;
      window.location.assign(buildShellWebUrl(launch));
    })();
  };

  return (
    <div className={props.className}>
      {props.buttonOnly ? null : (
        <p className="mb-4 text-sm text-white">
          Key 1 and Key 2 stay in par Noir Unlock. This page only receives a session.
        </p>
      )}
      {handedOff ? (
        <p className="text-sm text-white">You can close this tab and return to the dashboard.</p>
      ) : (
        <button
          type="button"
          className="w-full text-sm font-medium"
          style={{
            backgroundColor: 'rgba(26, 26, 26, 0.95)',
            border: '1px solid #d1d5db',
            color: '#ffffff',
            borderRadius: 8,
            padding: '12px 16px',
          }}
          onClick={openUnlock}
        >
          {props.label || 'Continue in par Noir Unlock'}
        </button>
      )}
      {error ? <p className="text-sm text-red-400 mt-2">{error}</p> : null}
    </div>
  );
}
