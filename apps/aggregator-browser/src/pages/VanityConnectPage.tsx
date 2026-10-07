/**
 * Messaging vanity profile landing — Connect sends a connection request via messages rail.
 */

import { useCallback, useEffect, useState } from 'react';
import { useUserState } from '../contexts/UserStateContext';
import { getUserProfile } from '../services/profileService';
import {
  resolveConnectionStatusFromCache,
  sendConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  removeConnection,
  type ConnectionStatus
} from '../services/connectionService';
import { useToast } from '../hooks/useToast';
import { PNConnect } from '../components/PNConnect';

export function VanityConnectPage({
  targetPnIdentifier,
  publicName
}: {
  targetPnIdentifier: string;
  publicName: string;
}) {
  const { userState } = useUserState();
  const { success, error: showError } = useToast();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: 'not_connected'
  });
  const [loading, setLoading] = useState(false);

  const norm = (id: string) => id.replace(/^pn-/, '').replace(/^did:key:/, '');
  const isOwnProfile =
    userState.isUnlocked &&
    userState.pnIdentifier &&
    norm(userState.pnIdentifier) === norm(targetPnIdentifier);

  useEffect(() => {
    let cancelled = false;
    void getUserProfile(targetPnIdentifier).then((profile) => {
      if (!cancelled && profile?.displayName) setDisplayName(profile.displayName);
    });
    return () => {
      cancelled = true;
    };
  }, [targetPnIdentifier]);

  useEffect(() => {
    if (!userState.isUnlocked || !userState.pnIdentifier || isOwnProfile) {
      setConnectionStatus({ status: 'not_connected' });
      return;
    }
    let cancelled = false;
    void resolveConnectionStatusFromCache(userState.pnIdentifier, targetPnIdentifier).then((s) => {
      if (!cancelled) setConnectionStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [userState.isUnlocked, userState.pnIdentifier, targetPnIdentifier, isOwnProfile]);

  const handleConnect = useCallback(async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier) return;
    setLoading(true);
    try {
      await sendConnectionRequest(userState.pnIdentifier, targetPnIdentifier);
      setConnectionStatus({ status: 'pending_sent' });
      success('Connection request sent!');
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to send connection request');
    } finally {
      setLoading(false);
    }
  }, [userState.isUnlocked, userState.pnIdentifier, targetPnIdentifier, success, showError]);

  const handleAccept = useCallback(async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier || !connectionStatus.connectionId) return;
    setLoading(true);
    try {
      await acceptConnectionRequest(
        connectionStatus.connectionId,
        userState.pnIdentifier,
        targetPnIdentifier
      );
      setConnectionStatus({
        status: 'connected',
        connectionId: connectionStatus.connectionId
      });
      success('Connection accepted!');
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to accept connection');
    } finally {
      setLoading(false);
    }
  }, [
    userState.isUnlocked,
    userState.pnIdentifier,
    connectionStatus.connectionId,
    targetPnIdentifier,
    success,
    showError
  ]);

  const handleReject = useCallback(async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier || !connectionStatus.connectionId) return;
    setLoading(true);
    try {
      await rejectConnectionRequest(connectionStatus.connectionId, userState.pnIdentifier);
      setConnectionStatus({ status: 'not_connected' });
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to reject connection');
    } finally {
      setLoading(false);
    }
  }, [userState.isUnlocked, userState.pnIdentifier, connectionStatus.connectionId, showError]);

  const handleDisconnect = useCallback(async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier || !connectionStatus.connectionId) return;
    setLoading(true);
    try {
      await removeConnection(connectionStatus.connectionId, userState.pnIdentifier);
      setConnectionStatus({ status: 'not_connected' });
      success('Disconnected');
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  }, [userState.isUnlocked, userState.pnIdentifier, connectionStatus.connectionId, success, showError]);

  const title = displayName || publicName;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-neutral-950 text-white">
      <header className="border-b border-neutral-800 px-4 py-3 text-center text-sm text-neutral-400">
        par Noir messaging
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-xl">
          <p className="text-center text-xs uppercase tracking-widest text-neutral-500">Connect on par Noir</p>
          <h1 className="mt-2 text-center text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-center text-sm text-neutral-400">@{publicName}</p>

          {isOwnProfile ? (
            <p className="mt-8 text-center text-sm text-neutral-400">This is your profile link.</p>
          ) : !userState.isUnlocked ? (
            <div className="mt-8 space-y-3">
              <p className="text-center text-sm text-neutral-400">
                Unlock your pN to send a connection request.
              </p>
              <div className="flex justify-center">
                <PNConnect compact />
              </div>
            </div>
          ) : connectionStatus.status === 'connected' ? (
            <div className="mt-8 flex flex-col gap-2">
              <p className="text-center text-sm text-green-400">You are connected.</p>
              <button
                type="button"
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800"
                disabled={loading}
                onClick={() => void handleDisconnect()}
              >
                Disconnect
              </button>
            </div>
          ) : connectionStatus.status === 'pending_sent' ? (
            <p className="mt-8 text-center text-sm text-neutral-400">Connection request pending.</p>
          ) : connectionStatus.status === 'pending_received' ? (
            <div className="mt-8 flex flex-col gap-2">
              <button
                type="button"
                className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium hover:bg-green-600 disabled:opacity-50"
                disabled={loading}
                onClick={() => void handleAccept()}
              >
                Accept
              </button>
              <button
                type="button"
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50"
                disabled={loading}
                onClick={() => void handleReject()}
              >
                Decline
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="mt-8 w-full rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-50"
              disabled={loading}
              onClick={() => void handleConnect()}
            >
              {loading ? 'Sending…' : 'Connect'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
