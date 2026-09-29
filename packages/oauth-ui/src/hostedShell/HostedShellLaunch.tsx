import React, { useEffect, useState } from 'react';
import { tryPreferUnlockApp } from '../unlockPreferApp';
import {
  buildShellLaunchUrl,
  buildShellWebUrl,
  parseShellReturn,
  shellClickOpensWeb,
  type HostedShellSession,
  type ShellOp,
} from './session';

function nativeUnlockShell(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (
    window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform();
}

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
  const returnTo =
    props.returnTo ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}${window.location.search}`
      : 'https://pn.parnoir.com/');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.includes('pn_shell=')) return;
    try {
      const session = parseShellReturn(hash);
      if (!session) return;
      if (props.op && session.op !== props.op && session.op !== 'session') return;
      props.onSession(session);
      window.dispatchEvent(new CustomEvent('pn-hosted-shell-session', { detail: session }));
      const clean = window.location.pathname + window.location.search;
      window.history.replaceState({}, '', clean);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unlock handoff failed');
    }
    // Apply once per mount; onSession is the caller's handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openUnlock = () => {
    setError(null);
    const launch = {
      returnTo,
      op: props.op || 'session',
      clientId: props.clientId,
      apiEndpoint: props.apiEndpoint,
      vaultPayload: props.vaultPayload,
    };
    if (!shellClickOpensWeb(nativeUnlockShell())) {
      void tryPreferUnlockApp(buildShellLaunchUrl(launch));
      return;
    }
    window.location.assign(buildShellWebUrl(launch));
  };

  return (
    <div className={props.className}>
      {props.buttonOnly ? null : (
        <p className="mb-4 text-sm text-white">
          Key 1 and Key 2 stay in par Noir Unlock. This page only receives a session.
        </p>
      )}
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
      {error ? <p className="text-sm text-red-400 mt-2">{error}</p> : null}
    </div>
  );
}
