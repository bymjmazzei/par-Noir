import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  CONFIGURABLE_CAPABILITIES,
  CONFIGURABLE_CAPABILITY_LABELS,
  DEVICE_CAPABILITIES,
  IMMUTABLE_UNKEYED_DENY,
} from '@par-noir/device-auth';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { unsealDevicePrivateDisplay } from '@par-noir/device-client';
import type { useDeviceAuthState } from '../hooks/useDeviceAuthState';
import {
  bootstrapThisDevice,
  completePairingFromNonce,
  createPairingNonce,
  revokeDeviceOnServer,
  updateDevicePolicy,
} from '../services/deviceApiService';
import { clearPendingDevicePairing } from '../hooks/useDeviceAuthState';
import { clearDeviceRegistration } from '../services/deviceKeyStorage';
import { PN_SHOW_DEVICE_PAIRING_QR_EVENT } from '../constants/deviceEvents';

const PENDING_SHOW_PAIRING_QR_KEY = 'pn_pending_show_pairing_qr';

type DeviceAuth = ReturnType<typeof useDeviceAuthState>;

type DisplayDevice = {
  deviceId: string;
  label: string;
  deviceType: string;
  keyType: string;
  status: string;
  isPrimary: boolean;
  createdAt: string;
  lastSeenAt: string;
};

export interface DeviceManagementPanelProps {
  authToken?: string;
  pnIdentifier?: string;
  sessionId?: string;
  deviceAuth: DeviceAuth;
}

export const DeviceManagementPanel: React.FC<DeviceManagementPanelProps> = ({
  authToken,
  pnIdentifier,
  sessionId,
  deviceAuth,
}) => {
  const {
    registry,
    policy,
    loading,
    refresh,
    isKeyedSession,
    hasKeyedDevices,
    isUnkeyedRestricted,
    localDeviceId,
    pendingPairing,
    setPendingPairing,
    deviceRequiredMessage,
  } = deviceAuth;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairingQr, setPairingQr] = useState<string | null>(null);
  const [showPairing, setShowPairing] = useState(false);
  const [policyDraft, setPolicyDraft] = useState<string[]>(policy.unkeyedAllows);
  const [displayDevices, setDisplayDevices] = useState<DisplayDevice[]>([]);

  useEffect(() => {
    setPolicyDraft(policy.unkeyedAllows);
  }, [policy.unkeyedAllows]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = registry?.devices ?? [];
      if (rows.length === 0) {
        if (!cancelled) setDisplayDevices([]);
        return;
      }
      const creds = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
      const resolved: DisplayDevice[] = [];
      for (const d of rows) {
        if (d.privateDisplay && creds?.pnName && creds?.passcode) {
          try {
            const open = await unsealDevicePrivateDisplay(
              d.privateDisplay,
              creds.pnName,
              creds.passcode
            );
            resolved.push({
              deviceId: d.deviceId,
              label: open.label,
              deviceType: open.deviceType,
              keyType: d.keyType,
              status: d.status,
              isPrimary: d.isPrimary,
              createdAt: d.createdAt,
              lastSeenAt: open.lastSeenAt,
            });
            continue;
          } catch {
            /* fall through to legacy / placeholder */
          }
        }
        resolved.push({
          deviceId: d.deviceId,
          label: d.label || 'Device',
          deviceType: d.deviceType || 'other',
          keyType: d.keyType,
          status: d.status,
          isPrimary: d.isPrimary,
          createdAt: d.createdAt,
          lastSeenAt: d.lastSeenAt || '',
        });
      }
      if (!cancelled) setDisplayDevices(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [registry?.devices, sessionId]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Operation failed');
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const handleKeyThisDevice = () =>
    run(async () => {
      if (!authToken || !pnIdentifier || !sessionId) {
        throw new Error('Unlock and connect Drive first');
      }
      await bootstrapThisDevice({
        userPnIdentifier: pnIdentifier,
        authToken,
        sessionId,
      });
    });

  const handleCompletePairing = () =>
    run(async () => {
      if (!authToken || !pnIdentifier || !sessionId || !pendingPairing) return;
      if (pendingPairing.pnIdentifier !== pnIdentifier) {
        throw new Error('Pairing invitation is for a different identity');
      }
      await completePairingFromNonce({
        userPnIdentifier: pnIdentifier,
        authToken,
        sessionId,
        pairingNonce: pendingPairing.pairingNonce,
      });
      clearPendingDevicePairing();
      setPendingPairing(null);
    });

  const handleStartPairing = () =>
    run(async () => {
      if (!authToken || !pnIdentifier) throw new Error('Session required');
      const { pairingNonce, expiresAt } = await createPairingNonce(pnIdentifier, authToken);
      const payload = {
        pairingNonce,
        pnIdentifier,
        expiresAt,
      };
      const link = `${window.location.origin}?device-pairing=${encodeURIComponent(JSON.stringify(payload))}`;
      const qr = await QRCode.toDataURL(link, { width: 220, margin: 2 });
      setPairingQr(qr);
      setShowPairing(true);
    });

  // Notification action may fire before this panel mounts (tab switch) — stash + retry on mount.
  useEffect(() => {
    const startIfPending = () => {
      try {
        if (sessionStorage.getItem(PENDING_SHOW_PAIRING_QR_KEY) !== '1') return;
        sessionStorage.removeItem(PENDING_SHOW_PAIRING_QR_KEY);
      } catch {
        return;
      }
      if (!isKeyedSession || !authToken || !pnIdentifier) return;
      void handleStartPairing();
    };
    const onShowQr = () => {
      try {
        sessionStorage.setItem(PENDING_SHOW_PAIRING_QR_KEY, '1');
      } catch {
        /* ignore */
      }
      startIfPending();
    };
    window.addEventListener(PN_SHOW_DEVICE_PAIRING_QR_EVENT, onShowQr);
    startIfPending();
    return () => window.removeEventListener(PN_SHOW_DEVICE_PAIRING_QR_EVENT, onShowQr);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open QR once when keyed session + token ready
  }, [isKeyedSession, authToken, pnIdentifier]);

  const handleRevoke = (deviceId: string) =>
    run(async () => {
      if (!authToken || !pnIdentifier) return;
      await revokeDeviceOnServer(pnIdentifier, authToken, deviceId);
      if (deviceId === localDeviceId) {
        await clearDeviceRegistration(pnIdentifier);
      }
    });

  const handleSavePolicy = () =>
    run(async () => {
      if (!authToken || !pnIdentifier) return;
      await updateDevicePolicy(pnIdentifier, authToken, policyDraft);
    });

  const togglePolicyCap = (cap: string) => {
    setPolicyDraft((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const immutableDenyLabels: Record<string, string> = {
    [DEVICE_CAPABILITIES.recoveryVaultWrite]: 'Change recovery vault shares',
    [DEVICE_CAPABILITIES.recoveryCustodianManage]: 'Add or revoke custodians',
    [DEVICE_CAPABILITIES.identityMigrate]: 'Identity migration',
    [DEVICE_CAPABILITIES.identityExport]: 'Export identity backup',
    [DEVICE_CAPABILITIES.identityRotate]: 'Identity rotation',
    [DEVICE_CAPABILITIES.deviceManage]: 'Device registration and policy',
    [DEVICE_CAPABILITIES.oauthWrite]: 'OAuth write scopes',
  };

  return (
    <div className="bg-secondary rounded-lg p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-medium text-text-primary">Devices &amp; sessions</h4>
          <p className="text-xs text-text-secondary mt-1">
            Portable unlock works on any device. Key a device to protect privileged owner actions after
            your first registration.
          </p>
        </div>
        <div className="text-xs text-right">
          <span
            className={
              isKeyedSession
                ? 'text-green-400'
                : isUnkeyedRestricted
                  ? 'text-amber-400'
                  : 'text-text-secondary'
            }
          >
            {isKeyedSession ? 'Keyed session' : 'Unkeyed session'}
          </span>
        </div>
      </div>

      {isUnkeyedRestricted && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2">
          {deviceRequiredMessage}
        </p>
      )}

      {pendingPairing && !isKeyedSession && authToken && pnIdentifier && (
        <div className="border border-violet-500/40 rounded p-3 space-y-2">
          <p className="text-xs text-text-secondary">
            Pairing invitation detected for this identity. Complete to key this device.
          </p>
          <button
            type="button"
            disabled={busy || !sessionId}
            onClick={handleCompletePairing}
            className="px-3 py-1.5 modal-button rounded text-sm disabled:opacity-50"
          >
            Complete pairing on this device
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {!isKeyedSession && authToken && pnIdentifier && !hasKeyedDevices && (
          <button
            type="button"
            disabled={busy || loading || !sessionId}
            onClick={handleKeyThisDevice}
            className="px-3 py-1.5 modal-button rounded text-sm disabled:opacity-50"
          >
            Key this device
          </button>
        )}
        {isKeyedSession && authToken && pnIdentifier && (
          <button
            type="button"
            disabled={busy}
            onClick={handleStartPairing}
            className="px-3 py-1.5 modal-button rounded text-sm disabled:opacity-50"
          >
            Add device (show QR)
          </button>
        )}
      </div>

      {showPairing && pairingQr && (
        <div className="border border-border rounded p-3 space-y-2">
          <p className="text-xs text-text-secondary">
            Scan with the new device after unlock. Expires in 5 minutes.
          </p>
          <img src={pairingQr} alt="Device pairing QR code" className="mx-auto w-48 h-48" />
          <button
            type="button"
            className="text-xs text-text-secondary underline"
            onClick={() => {
              setShowPairing(false);
              setPairingQr(null);
            }}
          >
            Close
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-text-secondary">Loading devices…</p>
      ) : (
        <ul className="text-xs space-y-2">
          {displayDevices.length === 0 ? (
            <li className="text-text-secondary">No keyed devices yet.</li>
          ) : (
            displayDevices.map((d) => (
              <li
                key={d.deviceId}
                className="flex items-center justify-between p-2 bg-input-bg rounded border border-border"
              >
                <div>
                  <span className="text-text-primary font-medium">{d.label}</span>
                  <span className="text-text-secondary ml-2">
                    {d.deviceType}
                    {d.isPrimary ? ' · primary' : ''}
                    {d.deviceId === localDeviceId ? ' · this device' : ''}
                  </span>
                  <div className="text-text-secondary">
                    Last seen: {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—'}
                  </div>
                </div>
                {isKeyedSession && d.deviceId !== localDeviceId && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRevoke(d.deviceId)}
                    className="text-red-400 text-xs hover:underline disabled:opacity-50"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))
          )}
        </ul>
      )}

      {isKeyedSession && hasKeyedDevices && (
        <div className="border-t border-border pt-4 space-y-3">
          <h5 className="text-sm font-medium text-text-primary">Unkeyed device permissions</h5>
          <p className="text-xs text-text-secondary">
            Choose what an unlocked but unkeyed device may do. Recovery flows always remain available.
            Drive and messaging are allowed by default so cloud reconnect works without keying; unkeyed
            sessions still wipe local cloud tokens on lock.
          </p>
          <p className="text-xs text-text-secondary italic">
            Messaging permissions apply when the browser app supports device keys (not yet available).
          </p>
          <ul className="space-y-2">
            {CONFIGURABLE_CAPABILITIES.map((cap) => (
              <li key={cap} className="flex items-center gap-2 text-xs">
                <input
                  id={`cap-${cap}`}
                  type="checkbox"
                  checked={policyDraft.includes(cap)}
                  onChange={() => togglePolicyCap(cap)}
                />
                <label htmlFor={`cap-${cap}`} className="text-text-primary">
                  {CONFIGURABLE_CAPABILITY_LABELS[cap] ?? cap}
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-secondary">Always blocked on unkeyed devices:</p>
          <ul className="text-xs text-text-secondary list-disc pl-4">
            {[...IMMUTABLE_UNKEYED_DENY].map((cap) => (
              <li key={cap}>{immutableDenyLabels[cap] ?? cap}</li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy}
            onClick={handleSavePolicy}
            className="px-3 py-1.5 modal-button rounded text-sm disabled:opacity-50"
          >
            Save permissions
          </button>
        </div>
      )}
    </div>
  );
};
