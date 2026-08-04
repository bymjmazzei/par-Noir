import React, { useEffect, useRef, useState } from 'react';
import {
  getRecoveryActiveSession,
  recoveryActiveSessionRemainingMs,
  type RecoveryActiveSession,
} from '../../services/recoveryActiveSession';
import { fetchRecoveryRequest } from '../../services/recoveryApiService';

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRecoveryMethod: 'pn' | 'key';
  setActiveRecoveryMethod: (method: 'pn' | 'key') => void;
  onInitiateRecoveryFromPn: (file: File, emailOrPhone: string) => void;
  onInitiateRecoveryWithKey: (
    recoveryKey: string,
    contactInfo: { contactValue: string }
  ) => void;
  onContinueReadyRecovery: () => void;
  onResendCustodianNotify: () => void;
  onCancelActiveRecovery: (opts?: { silent?: boolean }) => void;
  recoveryBlocked?: boolean;
  recoveryBlockedMessage?: string;
  continueLoading?: boolean;
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RecoveryModal({
  isOpen,
  onClose,
  activeRecoveryMethod,
  setActiveRecoveryMethod,
  onInitiateRecoveryFromPn,
  onInitiateRecoveryWithKey,
  onContinueReadyRecovery,
  onResendCustodianNotify,
  onCancelActiveRecovery,
  recoveryBlocked = false,
  recoveryBlockedMessage,
  continueLoading = false,
}: RecoveryModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [keyText, setKeyText] = useState('');
  const [keyContact, setKeyContact] = useState('');
  const [session, setSession] = useState<RecoveryActiveSession | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const refresh = () => {
      const s = getRecoveryActiveSession();
      setSession(s);
      setRemainingMs(recoveryActiveSessionRemainingMs());
    };
    refresh();
    const tick = window.setInterval(refresh, 1000);
    return () => window.clearInterval(tick);
  }, [isOpen]);

  // When countdown hits zero while viewing status, clear and return to initiate
  useEffect(() => {
    if (!isOpen || remainingMs > 0) return;
    if (!session) return;
    onCancelActiveRecovery({ silent: true });
    setSession(null);
  }, [isOpen, session, remainingMs, onCancelActiveRecovery]);

  useEffect(() => {
    if (!isOpen || !session) return;
    let cancelled = false;
    const poll = async () => {
      const current = getRecoveryActiveSession();
      if (!current) return;
      try {
        const remote = await fetchRecoveryRequest(
          current.pnIdentifier,
          null,
          current.requestId
        );
        if (cancelled || !remote) return;
        const { updateRecoveryActiveSession } = await import('../../services/recoveryActiveSession');
        let approvalCount = current.approvalCount;
        try {
          const approvals = JSON.parse(remote.sharesJson || '[]');
          if (Array.isArray(approvals)) approvalCount = approvals.length;
        } catch {
          /* keep local */
        }
        const status =
          remote.status === 'ready'
            ? 'ready'
            : remote.status === 'completed'
              ? 'completed'
              : 'pending';
        const wasPending = current.status === 'pending';
        const updated = updateRecoveryActiveSession({
          status,
          approvalCount,
          threshold: remote.threshold || current.threshold,
        });
        if (updated) setSession(updated);
        if (wasPending && status === 'ready' && current.callbackContact) {
          const message =
            'Your par Noir recovery is ready. Open Recover and Continue to set new Key 1 and Key 2.';
          const contact = current.callbackContact;
          if (contact.includes('@')) {
            window.open(
              `mailto:${encodeURIComponent(contact)}?subject=${encodeURIComponent('par Noir recovery ready')}&body=${encodeURIComponent(message)}`
            );
          } else {
            window.open(`sms:${contact}?body=${encodeURIComponent(message)}`);
          }
        }
        setPollError(null);
      } catch (err) {
        if (!cancelled) {
          setPollError(err instanceof Error ? err.message : 'Could not refresh status');
        }
      }
    };
    void poll();
    const id = window.setInterval(poll, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isOpen, session?.requestId, session?.pnIdentifier]);

  if (!isOpen) return null;

  const showStatus = Boolean(session);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-semibold">Recover pN</h2>
          <button type="button" onClick={onClose} className="modal-close-button">
            ×
          </button>
        </div>

        {showStatus && session ? (
          <div className="space-y-4">
            <div className="p-4 bg-secondary rounded-lg space-y-2">
              <p className="text-sm font-medium">Recovery in progress</p>
              <p className="text-xs text-text-secondary">
                Session expires in {formatRemaining(remainingMs)}
              </p>
              <p className="text-sm">
                Approvals: {session.approvalCount} / {session.threshold}
              </p>
              <p className="text-sm capitalize">
                Status:{' '}
                <span className="font-medium">
                  {session.status === 'ready' ? 'Ready — set Key 1 and Key 2' : session.status}
                </span>
              </p>
              {session.callbackContact ? (
                <p className="text-xs text-text-secondary">Callback: {session.callbackContact}</p>
              ) : null}
              {pollError ? <p className="text-xs text-yellow-600">{pollError}</p> : null}
            </div>

            {session.status === 'ready' ? (
              <button
                type="button"
                disabled={continueLoading}
                onClick={onContinueReadyRecovery}
                className="w-full px-4 py-2 modal-button rounded-md font-medium disabled:opacity-50"
              >
                {continueLoading ? 'Preparing…' : 'Continue — set Key 1 and Key 2'}
              </button>
            ) : (
              <p className="text-xs text-text-secondary">
                Waiting for custodians. You can close this and reopen Recover within 20 minutes to resume.
              </p>
            )}

            <button
              type="button"
              onClick={onResendCustodianNotify}
              className="w-full px-4 py-2 border border-border rounded-md text-sm"
            >
              Resend custodian notify
            </button>
            <button
              type="button"
              onClick={() => onCancelActiveRecovery()}
              className="w-full px-4 py-2 border border-border rounded-md text-sm text-text-secondary"
            >
              Cancel and start over
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-6">
              <button
                type="button"
                onClick={() => setActiveRecoveryMethod('pn')}
                className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
                  activeRecoveryMethod === 'pn'
                    ? 'border-primary bg-primary text-bg-primary shadow-lg'
                    : 'border-border bg-secondary text-text-primary hover:bg-hover'
                }`}
              >
                <div
                  className={`font-medium ${activeRecoveryMethod === 'pn' ? 'text-bg-primary' : 'text-text-primary'}`}
                >
                  Upload .pn file
                </div>
                <div
                  className={`text-sm ${activeRecoveryMethod === 'pn' ? 'text-bg-primary' : 'text-text-secondary'}`}
                >
                  File + callback contact — custodians approve, then set Key 1 and Key 2
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveRecoveryMethod('key')}
                className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
                  activeRecoveryMethod === 'key'
                    ? 'border-primary bg-primary text-bg-primary shadow-lg'
                    : 'border-border bg-secondary text-text-primary hover:bg-hover'
                }`}
              >
                <div
                  className={`font-medium ${activeRecoveryMethod === 'key' ? 'text-bg-primary' : 'text-text-primary'}`}
                >
                  Use a recovery key
                </div>
                <div
                  className={`text-sm ${activeRecoveryMethod === 'key' ? 'text-bg-primary' : 'text-text-secondary'}`}
                >
                  Failsafe if you lost your .pn file or recovery contact
                </div>
              </button>
            </div>

            {activeRecoveryMethod === 'pn' && (
              <div className="mt-4 p-4 bg-secondary rounded-lg">
                {recoveryBlocked && (
                  <div className="mb-4 p-3 border border-yellow-500 rounded text-sm text-yellow-700 bg-yellow-50">
                    {recoveryBlockedMessage ||
                      'Recovery is not available for this identity until the owner configures a protected custodian.'}
                  </div>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (recoveryBlocked) return;
                    const formData = new FormData(e.currentTarget);
                    const file = fileInputRef.current?.files?.[0];
                    if (!file) return;
                    onInitiateRecoveryFromPn(file, formData.get('emailOrPhone') as string);
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Your .pn identity file
                    </label>
                    <input
                      ref={fileInputRef}
                      name="pnFile"
                      type="file"
                      accept=".pn,application/json"
                      className="w-full text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Callback contact (email or phone)
                    </label>
                    <input
                      name="emailOrPhone"
                      type="text"
                      className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
                      required
                      placeholder="Where to notify you when ready"
                    />
                  </div>
                  <p className="text-xs text-text-secondary">
                    Custodians approve with Shamir shares. After the threshold is met, set new Key 1 and Key 2
                    on this device. Lost the file? Use a recovery key instead.
                  </p>
                  <button
                    type="submit"
                    disabled={recoveryBlocked}
                    className="w-full px-4 py-2 modal-button rounded-md font-medium disabled:opacity-50"
                  >
                    Start recovery
                  </button>
                </form>
              </div>
            )}

            {activeRecoveryMethod === 'key' && (
              <div className="mt-4 p-4 bg-secondary rounded-lg">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const raw = keyText.trim();
                    if (!raw || !keyContact.trim()) return;
                    let recoveryKey = raw;
                    try {
                      const parsed = JSON.parse(raw) as { recoveryKey?: string };
                      if (parsed?.recoveryKey) recoveryKey = parsed.recoveryKey;
                    } catch {
                      /* plain key string */
                    }
                    onInitiateRecoveryWithKey(recoveryKey, {
                      contactValue: keyContact.trim(),
                    });
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Recovery key
                    </label>
                    <textarea
                      value={keyText}
                      onChange={(e) => setKeyText(e.target.value)}
                      rows={4}
                      placeholder="Paste your recovery key or the downloaded failsafe JSON"
                      className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Callback contact (required)
                    </label>
                    <input
                      type="text"
                      value={keyContact}
                      onChange={(e) => setKeyContact(e.target.value)}
                      placeholder="Email or phone for ready status"
                      className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
                      required
                    />
                  </div>
                  <p className="text-xs text-text-secondary">
                    Starts custodian recovery without Key 1 or Key 2. Does not unlock by itself.
                  </p>
                  <button type="submit" className="w-full px-4 py-2 modal-button rounded-md font-medium">
                    Start recovery with key
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
