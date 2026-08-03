import React, { useCallback, useState } from 'react';
import { QRCodeScanner } from './QRCodeScanner';
import { completePairingFromNonce } from '../services/deviceApiService';
import {
  clearPendingDevicePairing,
  stashPendingDevicePairing,
  type PendingDevicePairing,
} from '../hooks/useDeviceAuthState';

export interface DevicePairFromReconnectProps {
  open: boolean;
  onClose: () => void;
  authToken: string;
  pnIdentifier: string;
  sessionId: string;
  onPaired: () => void | Promise<void>;
}

function parsePairingPayload(raw: string): PendingDevicePairing | null {
  const trimmed = raw.trim();
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed);
      const enc = url.searchParams.get('device-pairing');
      if (!enc) return null;
      const data = JSON.parse(decodeURIComponent(enc)) as PendingDevicePairing;
      if (!data?.pairingNonce || !data?.pnIdentifier) return null;
      if (data.expiresAt && Date.parse(data.expiresAt) < Date.now()) return null;
      return data;
    }
    const data = JSON.parse(trimmed) as PendingDevicePairing & {
      data?: PendingDevicePairing;
    };
    const payload = data.pairingNonce ? data : data.data;
    if (!payload?.pairingNonce || !payload?.pnIdentifier) return null;
    if (payload.expiresAt && Date.parse(payload.expiresAt) < Date.now()) return null;
    return payload as PendingDevicePairing;
  } catch {
    return null;
  }
}

/**
 * New-device pairing: scan QR from a keyed device (or paste the pairing link).
 */
export const DevicePairFromReconnect: React.FC<DevicePairFromReconnectProps> = ({
  open,
  onClose,
  authToken,
  pnIdentifier,
  sessionId,
  onPaired,
}) => {
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const complete = useCallback(
    async (pairing: PendingDevicePairing) => {
      if (pairing.pnIdentifier !== pnIdentifier) {
        throw new Error('Pairing invitation is for a different identity');
      }
      setBusy(true);
      setError(null);
      try {
        stashPendingDevicePairing(pairing);
        await completePairingFromNonce({
          userPnIdentifier: pnIdentifier,
          authToken,
          sessionId,
          pairingNonce: pairing.pairingNonce,
        });
        clearPendingDevicePairing();
        await onPaired();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Pairing failed');
      } finally {
        setBusy(false);
      }
    },
    [authToken, onClose, onPaired, pnIdentifier, sessionId]
  );

  const handleScan = useCallback(
    (text: string) => {
      const pairing = parsePairingPayload(text);
      if (!pairing) {
        setError('That QR is not a valid device pairing code.');
        return;
      }
      setShowCamera(false);
      void complete(pairing);
    },
    [complete]
  );

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pairing = parsePairingPayload(paste);
    if (!pairing) {
      setError('Paste the full pairing link from your keyed device.');
      return;
    }
    void complete(pairing);
  };

  if (!open) return null;

  if (showCamera) {
    return (
      <QRCodeScanner
        isOpen
        onClose={() => setShowCamera(false)}
        onScan={handleScan}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[10055] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pn-pair-device-title"
    >
      <div className="w-full max-w-md rounded-xl border border-neutral-600 bg-neutral-900 p-5 text-text-primary shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="pn-pair-device-title" className="text-lg font-semibold m-0">
            Pair this device
          </h2>
          <button
            type="button"
            className="text-sm text-text-secondary hover:text-white"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
        </div>
        <p className="text-sm text-text-secondary mt-2 mb-4">
          On a keyed device open Recovery → Add device (show QR), then scan it here or paste the
          pairing link.
        </p>
        {error ? (
          <p className="text-sm text-red-400 mb-3" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            setShowCamera(true);
          }}
          className="w-full mb-3 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-50"
        >
          Scan QR with camera
        </button>
        <form onSubmit={handlePasteSubmit} className="space-y-2">
          <label className="block text-xs text-text-secondary">
            Or paste pairing link
            <input
              className="mt-1 w-full rounded-lg border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm text-text-primary"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="https://…?device-pairing=…"
              disabled={busy}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !paste.trim()}
            className="w-full px-4 py-2 rounded-lg border border-neutral-600 text-sm disabled:opacity-50"
          >
            {busy ? 'Pairing…' : 'Complete pairing'}
          </button>
        </form>
      </div>
    </div>
  );
};
