import React, { useEffect, useRef, useState } from 'react';
import { getRecoveryActiveSession, type RecoveryActiveSession } from '../../services/recoveryActiveSession';
import { SectionInfo } from '../common/SectionInfo';

const POLL_MS = 30_000;

/** Accepts the raw key or the downloaded recovery key JSON file contents. */
function parseRecoveryKeyInput(raw: string): string {
  const text = raw.trim();
  try {
    const parsed = JSON.parse(text) as { recoveryKey?: string };
    if (parsed?.recoveryKey) return parsed.recoveryKey;
  } catch {
    /* plain key string */
  }
  return text;
}

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInitiateRecoveryWithKey: (
    recoveryKey: string,
    contactInfo: { contactValue: string }
  ) => void;
  /** Key-only recovery passes the recovery key again; it is never stored on the device. */
  onContinueReadyRecovery: (recoveryKey?: string) => void;
  onRefreshActiveRecovery: () => Promise<RecoveryActiveSession | null>;
  onCancelActiveRecovery: (opts?: { silent?: boolean }) => void;
  continueLoading?: boolean;
}

export function RecoveryModal({
  isOpen,
  onClose,
  onInitiateRecoveryWithKey,
  onContinueReadyRecovery,
  onRefreshActiveRecovery,
  onCancelActiveRecovery,
  continueLoading = false,
}: RecoveryModalProps) {
  const [keyText, setKeyText] = useState('');
  const [finishKeyText, setFinishKeyText] = useState('');
  const [keyContact, setKeyContact] = useState('');
  const [session, setSession] = useState<RecoveryActiveSession | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isOpen) return;
    setSession(getRecoveryActiveSession());
    const tick = window.setInterval(() => {
      setNow(Date.now());
      setSession(getRecoveryActiveSession());
    }, 1000);
    return () => window.clearInterval(tick);
  }, [isOpen]);

  const refreshRef = useRef(onRefreshActiveRecovery);
  refreshRef.current = onRefreshActiveRecovery;

  useEffect(() => {
    if (!isOpen || !session?.requestId) return;
    let cancelled = false;
    const poll = async () => {
      const updated = await refreshRef.current();
      if (!cancelled) setSession(updated);
    };
    void poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isOpen, session?.requestId]);

  if (!isOpen) return null;

  const releaseIn = session ? session.releaseAfter - now : 0;
  const keyOnly = session?.mode === 'key_only';
  const released = Boolean(session?.keyEnvelope);
  const canFinish = keyOnly ? released || releaseIn <= 0 : session?.status === 'ready' && releaseIn <= 0;

  const forgetRecovery = () => {
    if (
      released
      && !window.confirm(
        'Your recovery key has already been used for this recovery. If you forget it on this device, this recovery cannot be finished. Forget anyway?'
      )
    ) {
      return;
    }
    onCancelActiveRecovery();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Recover pN</h2>
            <SectionInfo title="Recover pN">
              <p>
                Start with your recovery key. If your pN has custodians, they approve from their
                dashboards and send their encrypted shares to this device only. Otherwise there is a
                24-hour wait the owner can cancel; a keyed device can approve it sooner.
              </p>
              <p>
                Then sign in to the Google account your pN uses to finish, and set new Key 1 and Key 2.
              </p>
            </SectionInfo>
          </div>
          <button type="button" onClick={onClose} className="modal-close-button">
            ×
          </button>
        </div>

        {session ? (
          <div className="space-y-4">
            <div className="p-4 bg-secondary rounded-lg space-y-2">
              <p className="text-sm font-medium">Recovery in progress</p>
              {keyOnly ? (
                <p className="text-sm">
                  {released
                    ? 'Recovery data received. Enter your recovery key to set new Key 1 and Key 2.'
                    : releaseIn > 0
                      ? `You can finish after ${new Date(session.releaseAfter).toLocaleString()}. A keyed device can approve sooner.`
                      : 'Ready to finish.'}
                </p>
              ) : (
                <p className="text-sm">
                  Approvals: {session.approvalCount} / {session.threshold}
                </p>
              )}
              {!keyOnly && session.status === 'ready' && releaseIn > 0 && (
                <p className="text-xs text-text-secondary">
                  Approved. You can finish after {new Date(session.releaseAfter).toLocaleString()} — this delay
                  gives the owner time to cancel.
                </p>
              )}
              <p className="text-xs text-text-secondary">
                Request expires {new Date(session.expiresAt).toLocaleString()}.
              </p>
              {session.callbackContact ? (
                <p className="text-xs text-text-secondary">Your contact: {session.callbackContact}</p>
              ) : null}
            </div>

            {canFinish && keyOnly ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const recoveryKey = parseRecoveryKeyInput(finishKeyText);
                  if (!recoveryKey) return;
                  onContinueReadyRecovery(recoveryKey);
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">Recovery key</label>
                  <textarea
                    value={finishKeyText}
                    onChange={(e) => setFinishKeyText(e.target.value)}
                    rows={3}
                    placeholder="Paste your recovery key or the downloaded recovery key file again"
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
                    required
                  />
                  <p className="text-xs text-text-secondary mt-1">It is not saved on this device.</p>
                </div>
                <button
                  type="submit"
                  disabled={continueLoading}
                  className="w-full px-4 py-2 modal-button rounded-md font-medium disabled:opacity-50"
                >
                  {continueLoading ? 'Preparing…' : released ? 'Finish recovery' : 'Sign in to Google and finish'}
                </button>
              </form>
            ) : canFinish ? (
              <button
                type="button"
                disabled={continueLoading}
                onClick={() => onContinueReadyRecovery()}
                className="w-full px-4 py-2 modal-button rounded-md font-medium disabled:opacity-50"
              >
                {continueLoading ? 'Preparing…' : 'Sign in to Google and finish'}
              </button>
            ) : keyOnly ? (
              <p className="text-xs text-text-secondary">
                You can close this and come back on this device after the wait. The pN owner&apos;s
                signed-in devices can cancel this recovery.
              </p>
            ) : session.status !== 'ready' ? (
              <p className="text-xs text-text-secondary">
                Waiting for custodians. Ask them to open their par Noir Recovery tab. You can close this and
                come back on this device.
              </p>
            ) : null}

            <button
              type="button"
              onClick={forgetRecovery}
              className="w-full px-4 py-2 border border-border rounded-md text-sm text-text-secondary"
            >
              Forget this recovery on this device
            </button>
          </div>
        ) : (
          <div className="p-4 bg-secondary rounded-lg">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const recoveryKey = parseRecoveryKeyInput(keyText);
                if (!recoveryKey || !keyContact.trim()) return;
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
                  Your contact (shown to the owner and custodians)
                </label>
                <input
                  type="text"
                  value={keyContact}
                  onChange={(e) => setKeyContact(e.target.value)}
                  placeholder="Email or phone the owner or custodians know"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
                  required
                />
              </div>
              <button type="submit" className="w-full px-4 py-2 modal-button rounded-md font-medium">
                Start recovery
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
